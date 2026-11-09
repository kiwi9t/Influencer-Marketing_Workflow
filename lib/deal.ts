import { Prisma, type Deal } from "@prisma/client";
import { db } from "./db.ts";
import { DEAL_ID, PLATFORMS, type DealData } from "./pipeline.ts";

import { attribution, onDealChange, validCreatorToken } from "./flow.ts";

const include = {
  creator: true,
  contractDraft: true,
  negotiationHistory: { orderBy: { createdAt: "desc" as const } },
  deliverables: { orderBy: { createdAt: "desc" as const } },
  jobs: { orderBy: [{ dueAt: "desc" as const }, { id: "desc" as const }], take: 30 },
  metrics: { orderBy: { dayNumber: "asc" as const }, select: { dayNumber: true, views: true, comments: true, clicks: true, orders: true, source: true, capturedAt: true } },
};

export async function loadDeal(id = DEAL_ID): Promise<DealData | null> {
  const deal = await db.deal.findUnique({ where: { id }, include });
  if (!deal) return null;
  const { creator, negotiationHistory, deliverables, jobs, contractDraft, metrics, ...fields } = deal;
  return {
    ...fields,
    stageHistory: fields.stageHistory as { from: string | null; to: string; at: string }[],
    creator: { name: creator.name, handle: creator.handle, email: creator.email, platform: creator.platform },
    askingRate: decimalNumber(deal.askingRate),
    agreedRate: decimalNumber(deal.agreedRate),
    targetBudget: decimalNumber(deal.targetBudget),
    targetLiveDate: calendarDay(deal.targetLiveDate),
    plannedShipDate: calendarDay(deal.plannedShipDate),
    expectedDeliveryDate: calendarDay(deal.expectedDeliveryDate),
    deliveredAt: calendarDay(deal.deliveredAt),
    lockedAt: deal.lockedAt?.toISOString() ?? null,
    publishedAt: deal.publishedAt?.toISOString() ?? null,
    contractDraft: contractDraft?.body ?? null,
    negotiationHistory: negotiationHistory.map((item) => ({
      id: item.id, note: item.note, askingRate: decimalNumber(item.askingRate),
      offerRate: decimalNumber(item.offerRate), createdAt: item.createdAt.toISOString(),
    })),
    deliverables: deliverables.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    jobs: jobs.map((job) => {
      const payload = job.payload as { subject?: string; to?: string; text?: string; dayNumber?: number };
      return { id: job.id, kind: job.kind, status: job.status, attempts: job.attempts, lastError: job.lastError,
        recipient: job.kind === "EMAIL" ? payload.to : undefined, subject: payload.subject ?? `Collect metrics · Day ${payload.dayNumber}`, preview: job.kind === "EMAIL" ? payload.text : null,
        dueAt: job.dueAt.toISOString() };
    }),
    metrics: metrics.map((item) => ({ ...item, capturedAt: item.capturedAt.toISOString() })),
  };
}

export class WorkflowError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function expect(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new WorkflowError(message, status);
}

function record(input: unknown) {
  expect(input && typeof input === "object" && !Array.isArray(input), "Invalid request.");
  return input as Record<string, unknown>;
}

function str(value: unknown, label: string, limit = 2000): string {
  expect(value == null || typeof value === "string", `${label} must be text.`);
  const result = (value ?? "").trim();
  expect(result.length <= limit, `${label} is too long (maximum ${limit} characters).`);
  return result;
}

function url(value: unknown, label: string): string | null {
  const input = str(value, label);
  if (!input) return null;
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new WorkflowError(`Enter a valid ${label.toLowerCase()} starting with https:// or http://.`); }
  expect(["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password, `Enter a valid ${label.toLowerCase()} starting with https:// or http://.`);
  return parsed.toString();
}

function rate(value: unknown, label: string): Prisma.Decimal | null {
  const input = str(value, label, 15);
  if (!input) return null;
  expect(/^\d{1,9}(\.\d{1,2})?$/.test(input), `${label} must be a nonnegative USD amount with up to two decimal places.`);
  return new Prisma.Decimal(input);
}

function date(value: unknown, label: string, dateOnly = false): Date | null {
  const input = str(value, label, 30);
  if (!input) return null;
  const day = input.slice(0, 10);
  const midnight = new Date(`${day}T00:00:00.000Z`);
  expect(!Number.isNaN(midnight.valueOf()) && midnight.toISOString().slice(0, 10) === day, `Enter a valid ${label.toLowerCase()}.`);
  expect(dateOnly ? /^\d{4}-\d{2}-\d{2}$/.test(input) : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input), `Enter a valid ${label.toLowerCase()}.`);
  const result = new Date(input);
  expect(!Number.isNaN(result.valueOf()), `Enter a valid ${label.toLowerCase()}.`);
  return result;
}

function whole(value: unknown, label: string, min = 0, max = 2147483647): number {
  expect(typeof value === "number" && Number.isInteger(value) && value >= min && value <= max,
    `${label} must be a whole number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`);
  return value;
}

const calendarDay = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const decimalNumber = (value: Prisma.Decimal | null) => value?.toNumber() ?? null;
type Tx = Prisma.TransactionClient;
type CurrentDeal = Deal & { creator: { name: string; email: string; handle: string; platform: string } };

function nextStatus(deal: Deal, confirm: boolean): Deal["status"] {
  switch (deal.status) {
    case "PITCHING":
      if (confirm) {
        expect(deal.topicNotes, "Add the creative scope before confirming.");
        return "NEGOTIATION";
      }
      break;
    case "NEGOTIATION":
      if (confirm) {
        expect(deal.agreedRate !== null, "Enter the agreed rate before locking the deal.");
        return "LOGISTICS_CONTRACT";
      }
      break;
    case "LOGISTICS_CONTRACT":
      if (deal.contractSigned && deal.contractUrl && deal.briefUrl && deal.shippingAddress
        && deal.shippingTrackingNumber && deal.targetLiveDate && deal.deliveredAt && deal.sampleStatus === "PASSED") {
        return "DRAFT_REVIEW";
      }
      if (confirm) throw new WorkflowError("Add the signed contract, brief, schedule, shipping details, receipt date and passed sample check.");
      break;
    case "DRAFT_REVIEW":
      if (deal.draftUrl && deal.reviewStatus === "APPROVED" && deal.destinationUrl) return "LIVE_PENDING";
      if (confirm) throw new WorkflowError("Approve the current draft and enter the campaign destination.");
      break;
    case "LIVE_PENDING":
      if (confirm) {
        expect(deal.trackingLink && deal.liveVideoUrl && deal.publishedAt, "Enter the destination, live video URL and publish time.");
        return "COMPLETED";
      }
      break;
  }
  return deal.status;
}

async function currentDeal(tx: Tx, id = DEAL_ID) {
  const deal = await tx.deal.findUnique({ where: { id }, include: { creator: true } });
  expect(deal, "Run npm run db:setup to initialize the deal.", 404);
  return deal;
}

async function commit(tx: Tx, before: CurrentDeal, patch: Partial<Deal>, confirm = false) {
  const now = new Date();
  const combined = { ...before, ...patch };
  if ((combined.status === "DRAFT_REVIEW" && combined.reviewStatus === "APPROVED") || combined.status === "LIVE_PENDING") {
    Object.assign(patch, combined.destinationUrl ? attribution(combined, combined.destinationUrl) : { trackingLink: null, hashtags: null });
    Object.assign(combined, patch);
  }
  patch.status = nextStatus(combined, confirm);
  if (patch.status !== before.status) {
    const history = Array.isArray(before.stageHistory) ? before.stageHistory : [];
    patch.stageHistory = [...history, { from: before.status, to: patch.status, at: now.toISOString() }];
  }
  if (before.status === "NEGOTIATION" && patch.status === "LOGISTICS_CONTRACT") patch.lockedAt = now;
  const result = await tx.deal.updateMany({
    where: { id: before.id, revision: before.revision }, data: { ...patch, stageHistory: patch.stageHistory as Prisma.InputJsonValue | undefined, revision: { increment: 1 } },
  });
  expect(result.count === 1, "This deal changed in another tab. Refresh to get the latest version.", 409);
  await onDealChange(tx, before, { ...before, ...patch, revision: before.revision + 1 }, now);
}

function setLinks(patch: Partial<Deal>, form: Record<string, unknown>) {
  if ("destinationUrl" in form) patch.destinationUrl = url(form.destinationUrl, "Destination URL");
  if ("affiliateUrl" in form) patch.affiliateUrl = url(form.affiliateUrl, "Affiliate URL");
  if ("requiredTags" in form) patch.requiredTags = str(form.requiredTags, "Official tags", 500);
  if ("targetLiveDate" in form) patch.targetLiveDate = date(form.targetLiveDate, "Target live date", true);
}

function publishedTime(input: unknown) {
  const published = date(input, "Publish time");
  expect(!published || published.valueOf() <= Date.now(), "Publish time cannot be in the future.");
  return published;
}

async function logDeliverables(tx: Tx, before: Deal, patch: Partial<Deal>) {
  const { draftUrl, scriptUrl, reviewStatus, reviewNotes, sampleStatus, sampleNotes } = { ...before, ...patch };
  if (scriptUrl && scriptUrl !== before.scriptUrl) {
    await tx.deliverable.create({ data: { dealId: before.id, kind: "SCRIPT", status: "SUBMITTED", url: scriptUrl } });
  }
  if (sampleStatus && (sampleStatus !== before.sampleStatus || sampleNotes !== before.sampleNotes)) {
    await tx.deliverable.create({ data: { dealId: before.id, kind: "SAMPLE", status: sampleStatus, notes: sampleNotes } });
  }
  if (draftUrl && draftUrl !== before.draftUrl) {
    await tx.deliverable.create({ data: { dealId: before.id, kind: "DRAFT", status: "SUBMITTED", url: draftUrl } });
  }
  if (draftUrl && reviewStatus && (reviewStatus !== before.reviewStatus || draftUrl !== before.draftUrl || reviewNotes !== before.reviewNotes)) {
    await tx.deliverable.create({ data: { dealId: before.id, kind: "DRAFT", status: reviewStatus, url: draftUrl, notes: reviewNotes } });
  }
}

async function stagePatch(tx: Tx, deal: CurrentDeal, form: Record<string, unknown>): Promise<Partial<Deal>> {
  const patch: Partial<Deal> = {};
  switch (deal.status) {
    case "PITCHING":
      patch.topicNotes = str(form.topicNotes, "Creative scope", 6000);
      if ("scopeRequirements" in form) patch.scopeRequirements = str(form.scopeRequirements, "Content requirements", 6000);
      break;
    case "NEGOTIATION": {
      patch.askingRate = rate(form.askingRate, "Asking rate");
      patch.agreedRate = rate(form.agreedRate, "Agreed rate");
      if ("targetBudget" in form) patch.targetBudget = rate(form.targetBudget, "Target budget");
      const note = str(form.negotiationNote, "Negotiation note", 3000);
      const offer = rate(form.offerRate, "Offer rate");
      if (note || offer !== null || decimalNumber(patch.askingRate) !== decimalNumber(deal.askingRate)) {
        await tx.negotiationEntry.create({ data: { dealId: deal.id, askingRate: patch.askingRate, offerRate: offer, note } });
      }
      break;
    }
    case "LOGISTICS_CONTRACT": {
      patch.contractUrl = url(form.contractUrl, "Contract URL");
      patch.contractSigned = form.contractSigned === true;
      patch.shippingAddress = str(form.shippingAddress, "Shipping address", 800) || null;
      patch.shippingTrackingNumber = str(form.shippingTrackingNumber, "Tracking number", 120) || null;
      patch.targetLiveDate = date(form.targetLiveDate, "Target live date", true);
      if ("briefUrl" in form) patch.briefUrl = url(form.briefUrl, "Product brief URL");
      if ("plannedShipDate" in form) patch.plannedShipDate = date(form.plannedShipDate, "Planned shipment", true);
      if ("expectedDeliveryDate" in form) patch.expectedDeliveryDate = date(form.expectedDeliveryDate, "Expected delivery", true);
      if ("deliveredAt" in form) patch.deliveredAt = date(form.deliveredAt, "Delivered on", true);
      if ("sampleStatus" in form) {
        const sample = form.sampleStatus;
        expect(sample === "" || sample === "PASSED" || sample === "FAILED", "Choose a valid sample check result.");
        patch.sampleStatus = sample || null;
      }
      if ("sampleNotes" in form) patch.sampleNotes = str(form.sampleNotes, "Sample check notes", 3000);
      if (deal.shippingTrackingNumber && deal.shippingTrackingNumber !== patch.shippingTrackingNumber) {
        patch.deliveredAt = null;
        patch.sampleStatus = null;
        patch.sampleNotes = "";
      }
      const fulfillment = { ...deal, ...patch };
      expect(!fulfillment.deliveredAt || fulfillment.deliveredAt.valueOf() <= Date.now(), "Delivery date cannot be in the future.");
      expect(!fulfillment.sampleStatus || fulfillment.deliveredAt, "Record sample delivery before its quality check.");
      break;
    }
    case "DRAFT_REVIEW": {
      patch.draftUrl = url(form.draftUrl, "Draft video URL");
      if ("scriptUrl" in form) patch.scriptUrl = url(form.scriptUrl, "Script URL");
      const review = form.reviewStatus;
      expect(review === "" || review == null || review === "APPROVED" || review === "REVISION_REQUESTED", "Choose a valid review status.");
      patch.reviewStatus = review || null;
      patch.reviewNotes = str(form.reviewNotes, "Review notes", 6000);
      expect(!patch.reviewStatus || patch.draftUrl, "Add the draft video URL before recording a review.");
      expect(patch.reviewStatus !== "REVISION_REQUESTED" || patch.reviewNotes, "Add feedback for the requested revision.");
      setLinks(patch, form);
      break;
    }
    case "LIVE_PENDING":
      setLinks(patch, form);
      patch.liveVideoUrl = url(form.liveVideoUrl, "Live video URL");
      patch.publishedAt = publishedTime(form.publishedAt);
      break;
    case "COMPLETED": throw new WorkflowError("Use the metrics tracker to record results.", 409);
  }
  return patch;
}

export async function mutateDeal(input: unknown, id = DEAL_ID) {
  const { action, revision, fields } = record(input);
  const form = record(fields);
  const expectedRevision = whole(revision, "Deal revision");
  expect(typeof action === "string" && ["save", "advance", "creator", "metric"].includes(action), "Unknown action.");
  await db.$transaction(async (tx) => {
    const deal = await currentDeal(tx, id);
    expect(deal.revision === expectedRevision, "This deal changed in another tab. Refresh to get the latest version.", 409);
    if (action === "creator") {
      const name = str(form.name, "Name", 80);
      const handle = str(form.handle, "Handle", 31).replace(/^@/, "");
      const email = str(form.email, "Email", 254);
      const platform = PLATFORMS.find((item) => item === form.platform);
      expect(name, "Enter a creator name.");
      expect(/^[a-zA-Z0-9_.-]{1,30}$/.test(handle), "Enter a valid creator handle.");
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.");
      expect(platform, "Choose a supported platform.");
      expect(!deal.trackingLink || (deal.creator.handle === `@${handle}` && deal.creator.platform === platform),
        "The handle and platform are locked once a tracking link has been generated.");
      await tx.creator.update({ where: { id: deal.creatorId }, data: { name, handle: `@${handle}`, email, platform } });
      await tx.deal.update({ where: { id: deal.id }, data: { revision: { increment: 1 } } });
    } else if (action === "metric") {
      expect(deal.status === "COMPLETED", "Confirm the live post before logging metrics.", 409);
      const dayNumber = whole(form.dayNumber, "Day", 1, 7);
      const values = {
        ...metricValues(form), source: "MANUAL", capturedAt: new Date(),
      };
      await tx.metricSnapshot.upsert({
        where: { dealId_dayNumber: { dealId: deal.id, dayNumber } },
        create: { dealId: deal.id, dayNumber, ...values },
        update: values,
      });
      await tx.deal.update({ where: { id: deal.id }, data: { revision: { increment: 1 } } });
    } else {
      const patch = await stagePatch(tx, deal, form);
      await logDeliverables(tx, deal, patch);
      await commit(tx, deal, patch, action === "advance");
    }
  });
  return loadDeal(id);
}

export function metricValues(input: unknown) {
  const data = record(input);
  return { views: whole(data.views, "Views"), comments: whole(data.comments, "Comments"), clicks: whole(data.clicks, "Clicks"), orders: whole(data.orders, "Orders") };
}

export async function creatorDeal(token: string) {
  const deal = await currentDeal(db, token.split("~")[1] || DEAL_ID);
  expect(validCreatorToken(deal, token), "This submission link is invalid or expired.", 403);
  return deal;
}

export async function submitCreator(token: string, form: Record<string, unknown>) {
  const id = token.split("~")[1] || DEAL_ID;
  await db.$transaction(async (tx) => {
    const deal = await currentDeal(tx, id);
    expect(validCreatorToken(deal, token), "This submission link is invalid or expired.", 403);
    expect(form.revision === String(deal.revision), "The collaboration changed. Reopen the link and submit again.", 409);
    const patch: Partial<Deal> = {};
    if (deal.status === "NEGOTIATION") {
      patch.askingRate = rate(form.askingRate, "Your quote");
      expect(patch.askingRate !== null, "Enter your USD quote.");
      if (decimalNumber(deal.askingRate) !== decimalNumber(patch.askingRate)) {
        await tx.negotiationEntry.create({ data: { dealId: deal.id, askingRate: patch.askingRate, note: "Submitted by creator" } });
      }
    } else if (deal.status === "LOGISTICS_CONTRACT" || deal.status === "DRAFT_REVIEW") {
      if (deal.status === "LOGISTICS_CONTRACT") {
        const address = str(form.shippingAddress, "Shipping address", 800);
        expect(!address || !deal.shippingTrackingNumber, "The shipment is already recorded. Contact the brand to change the address.");
        if (address) patch.shippingAddress = address;
        if (form.delivered === "on") {
          expect(deal.shippingTrackingNumber, "The shipment must be recorded before confirming delivery.");
          patch.deliveredAt = deal.deliveredAt ?? new Date(new Date().toISOString().slice(0, 10));
        }
      }
      const scriptUrl = url(form.scriptUrl, "Script URL");
      const draftUrl = url(form.draftUrl, "Draft URL");
      if (scriptUrl) patch.scriptUrl = scriptUrl;
      if (draftUrl && draftUrl !== deal.draftUrl) {
        patch.draftUrl = draftUrl;
        patch.reviewStatus = null;
        patch.reviewNotes = "";
      }
    } else if (deal.status === "LIVE_PENDING") {
      patch.liveVideoUrl = url(form.liveVideoUrl, "Live video URL");
      patch.publishedAt = publishedTime(form.publishedAt);
      expect(patch.liveVideoUrl && patch.publishedAt, "Enter the live video link and publication time.");
    }
    expect(Object.keys(patch).length > 0, "There are no new details to submit for this stage.");
    await logDeliverables(tx, deal, patch);
    await commit(tx, deal, patch);
  });
}
