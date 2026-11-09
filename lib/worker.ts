import { randomUUID } from "node:crypto";
import type { AutomationJob, Prisma } from "@prisma/client";
import { db } from "./db.ts";
import { metricValues } from "./deal.ts";
import { creatorLink, DAY, dueReminders, emailCurrent, enqueueEmail, ensureContractDraft, type Email } from "./flow.ts";

type MetricJob = {
  dayNumber: number;
  from: string;
  to: string;
  platform: string;
  liveVideoUrl: string;
  trackingLink: string | null;
  affiliateUrl: string | null;
};

export function checkWorkerConfig() {
  const mode = process.env.EMAIL_MODE ?? "preview";
  if (mode !== "preview" && mode !== "send") throw new Error("EMAIL_MODE must be preview or send.");
  if (mode === "send" && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.OPS_EMAIL)) {
    throw new Error("Email sending requires RESEND_API_KEY, EMAIL_FROM and OPS_EMAIL.");
  }
}

async function schedule(now: Date) {
  const deals = await db.deal.findMany({ select: { id: true } });
  for (const { id } of deals) {
    await db.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({ where: { id }, include: { creator: true, metrics: { select: { dayNumber: true } } } });
      if (!deal) return;
      await ensureContractDraft(tx, deal);
      for (const reminder of dueReminders(deal, now)) {
        const link = reminder.internal ? null : creatorLink(deal, now);
        const text = [reminder.text, link && `Submit your update: ${link}`].filter(Boolean).join("\n\n");
        const recipient = reminder.internal ? process.env.OPS_EMAIL || "ops@example.test" : deal.creator.email;
        await enqueueEmail(tx, deal, reminder.key, reminder.type, reminder.subject, text, now, recipient);
      }

      if (deal.isDemo || deal.status !== "COMPLETED" || !deal.publishedAt || !deal.liveVideoUrl) return;
      const live = deal.publishedAt.valueOf();
      const elapsed = Math.min(7, Math.floor((now.valueOf() - live) / DAY));
      for (let dayNumber = 1; dayNumber <= elapsed; dayNumber += 1) {
        if (deal.metrics.some((item) => item.dayNumber === dayNumber)) continue;
        const dueAt = new Date(live + dayNumber * DAY);
        const eventKey = `${deal.id}/metrics/${dayNumber}`;
        const payload: MetricJob = {
          dayNumber, from: new Date(dueAt.valueOf() - DAY).toISOString(), to: dueAt.toISOString(),
          platform: deal.creator.platform, liveVideoUrl: deal.liveVideoUrl, trackingLink: deal.trackingLink, affiliateUrl: deal.affiliateUrl,
        };
        await tx.automationJob.upsert({
          where: { eventKey }, update: {}, create: { dealId: id, eventKey, kind: "METRICS", dueAt, payload },
        });
      }
    });
  }
}

async function claim(now: Date) {
  const where: Prisma.AutomationJobWhereInput = {
    OR: [{ status: "PENDING", dueAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lte: now } }],
    ...(process.env.METRICS_PROVIDER_URL ? {} : { kind: "EMAIL" }),
  };
  const job = await db.automationJob.findFirst({ where, orderBy: [{ dueAt: "asc" }, { id: "asc" }] });
  if (!job) return null;
  const leaseToken = randomUUID();
  const result = await db.automationJob.updateMany({
    where: { id: job.id, ...where },
    data: {
      status: "RUNNING", leaseToken, leaseUntil: new Date(now.valueOf() + 120_000),
      attempts: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? now,
    },
  });
  return result.count === 1 ? { ...job, attempts: job.attempts + 1, firstAttemptAt: job.firstAttemptAt ?? now, leaseToken } : null;
}

async function finish(job: AutomationJob, data: Prisma.AutomationJobUpdateManyMutationInput) {
  return db.automationJob.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
    data: { leaseToken: null, leaseUntil: null, ...data },
  });
}

async function sendEmail(job: AutomationJob, email: Email, now: Date) {
  const owner = await db.deal.findUnique({ where: { id: job.dealId }, select: { isDemo: true } });
  if (owner?.isDemo || process.env.EMAIL_MODE !== "send") {
    await finish(job, { status: "PREVIEW", processedAt: now, lastError: null });
    return;
  }
  if (email.to.endsWith("@example.test") || email.to.endsWith("@example.com")) {
    await finish(job, { status: "FAILED", processedAt: now, lastError: "Replace the example email address before sending." });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": job.id },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Email provider returned no message ID.");
  await finish(job, { status: "DONE", processedAt: now, providerId: result.id, lastError: null });
}

async function collectMetrics(job: AutomationJob, payload: MetricJob, now: Date) {
  const where = { dealId: job.dealId, dayNumber: payload.dayNumber };
  if (await db.metricSnapshot.findUnique({ where: { dealId_dayNumber: where }, select: { id: true } })) {
    await finish(job, { status: "CANCELED", processedAt: now, lastError: "This day already has a snapshot." });
    return;
  }
  const response = await fetch(process.env.METRICS_PROVIDER_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.METRICS_PROVIDER_TOKEN ? { Authorization: `Bearer ${process.env.METRICS_PROVIDER_TOKEN}` } : {}),
    },
    body: JSON.stringify({ dealId: job.dealId, ...payload }),
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Metrics provider returned HTTP ${response.status}.`);
  const counts = metricValues(await response.json());
  await db.$transaction(async (tx) => {
    const completed = await tx.automationJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: "RUNNING" },
      data: { status: "DONE", leaseToken: null, leaseUntil: null, processedAt: now, lastError: null },
    });
    if (!completed.count) return;
    await tx.metricSnapshot.upsert({
      where: { dealId_dayNumber: where }, update: {},
      create: { ...where, ...counts, source: "PROVIDER", capturedAt: now },
    });
  });
}

async function processJob(job: AutomationJob, now: Date) {
  const firstAttempt = job.firstAttemptAt ?? now;
  if (job.attempts > 5 || (job.kind === "EMAIL" && now.valueOf() - firstAttempt.valueOf() >= 20 * 3_600_000)) {
    await finish(job, { status: "FAILED", lastError: "The retry window has closed." });
    return;
  }
  try {
    if (job.kind === "METRICS") {
      await collectMetrics(job, job.payload as MetricJob, now);
      return;
    }
    const deal = await db.deal.findUnique({ where: { id: job.dealId }, include: { creator: true } });
    const email = job.payload as Email;
    if (!deal || !emailCurrent(deal, job.eventKey, email, now)) {
      await finish(job, { status: "CANCELED", processedAt: now, lastError: "The deal changed before this email was sent." });
      return;
    }
    await sendEmail(job, email, now);
  } catch (error) {
    // Avoid storing service responses or URLs that may contain secrets.
    const message = error instanceof Error && /^(Email provider|Metrics provider|Views must|Comments must|Clicks must|Orders must)/.test(error.message)
      ? error.message : "Provider request failed or returned invalid data.";
    await finish(job, job.attempts >= 5
      ? { status: "FAILED", processedAt: now, lastError: message }
      : { status: "PENDING", dueAt: new Date(now.valueOf() + 60_000 * 2 ** job.attempts), lastError: message });
  }
}

export async function runAutomation() {
  await schedule(new Date());
  let processed = 0;
  while (processed < 20) {
    const now = new Date();
    const job = await claim(now);
    if (!job) break;
    await processJob(job, now);
    processed += 1;
  }
  return processed;
}
