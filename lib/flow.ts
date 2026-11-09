import { createHmac, timingSafeEqual } from "node:crypto";
import type { Deal, Prisma } from "@prisma/client";

type FlowDeal = Deal & { creator: { name: string; email: string; handle: string; platform: string } };
type Tx = Prisma.TransactionClient;
export type Email = { type: string; to: string; subject: string; text: string };
export const DAY = 86_400_000;

function portalSignature(deal: FlowDeal, expiry: number, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify([deal.id, deal.creator.email, expiry])).digest("hex");
}

export function creatorLink(deal: FlowDeal, now: Date) {
  const secret = process.env.CREATOR_SUBMISSION_SECRET;
  const base = process.env.CREATOR_SUBMISSION_URL;
  if (!secret || secret.length < 32 || !base) return null;
  const expiry = Math.floor(now.valueOf() / DAY) + 45;
  const link = new URL("/submit", base);
  link.searchParams.set("token", `${expiry}.${portalSignature(deal, expiry, secret)}~${deal.id}`);
  return link.toString();
}

export function validCreatorToken(deal: FlowDeal, token: string) {
  token = token.split("~")[0];
  const secret = process.env.CREATOR_SUBMISSION_SECRET;
  if (!secret || secret.length < 32 || !/^\d{1,8}\.[0-9a-f]{64}$/.test(token)) return false;
  const [date, signature] = token.split(".");
  const expiry = Number(date);
  return expiry > Math.floor(Date.now() / DAY)
    && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(portalSignature(deal, expiry, secret), "hex"));
}

export function attribution(deal: FlowDeal, destination: string) {
  const link = new URL(destination);
  const handle = deal.creator.handle.slice(1).toLowerCase();
  link.searchParams.set("utm_source", deal.creator.platform.toLowerCase());
  link.searchParams.set("utm_medium", "influencer");
  link.searchParams.set("utm_campaign", deal.id);
  link.searchParams.set("utm_content", handle);
  const tag = handle.replace(/[^a-z0-9]/g, "");
  return { trackingLink: link.toString(), hashtags: deal.requiredTags || (tag ? `#ad #${tag}` : "#ad") };
}

export async function ensureContractDraft(tx: Tx, deal: FlowDeal) {
  if (deal.agreedRate === null || deal.status === "PITCHING" || deal.status === "NEGOTIATION") return;
  const body = [
    "Collaboration agreement draft • For review",
    `Deal: ${deal.id}`,
    `Creator: ${deal.creator.name} (${deal.creator.handle}, ${deal.creator.platform})`,
    `Agreed fee: USD ${deal.agreedRate.toFixed(2)}`,
    `Creative scope: ${deal.topicNotes || "To be supplied"}`,
    `Content requirements: ${deal.scopeRequirements || "To be supplied"}`,
    "To finalize: add the contracting parties, payment terms, content rights, and signature blocks in your approved contract template.",
  ].join("\n\n");
  await tx.contractDraft.upsert({ where: { dealId: deal.id }, create: { dealId: deal.id, body }, update: {} });
}

export async function enqueueEmail(tx: Tx, deal: FlowDeal, key: string, type: string, subject: string, text: string, now: Date, to = deal.creator.email) {
  const eventKey = `${deal.id}/${key}`;
  if (!type.endsWith("_REMINDER")) {
    await tx.automationJob.updateMany({
      where: { dealId: deal.id, eventKey: { startsWith: `${deal.id}/${key.split("/")[0]}/`, not: eventKey }, status: "PENDING" },
      data: { status: "CANCELED", processedAt: now, lastError: "A newer update replaced this email." },
    });
  }
  await tx.automationJob.upsert({
    where: { eventKey },
    update: {},
    create: { dealId: deal.id, eventKey, kind: "EMAIL", dueAt: now, payload: { type, to, subject, text } },
  });
}

export async function onDealChange(tx: Tx, before: FlowDeal, deal: FlowDeal, now: Date) {
  const portal = creatorLink(deal, now);
  const reply = portal ? `\n\nSubmit your update here: ${portal}` : "\n\nPlease reply to this email with your update.";
  const greeting = `Hi ${deal.creator.name},\n\n`;
  if (before.status === "PITCHING" && deal.status === "NEGOTIATION" && !deal.askingRate) {
    await enqueueEmail(tx, deal, "quote-request", "QUOTE", "Collaboration scope and quote request",
      `${greeting}Here is the agreed creative scope:\n${deal.topicNotes}\n\n${deal.scopeRequirements}\n\nCould you share your USD quote?${reply}`, now);
  }
  await ensureContractDraft(tx, deal);
  if (deal.briefUrl && deal.targetLiveDate && !["PITCHING", "NEGOTIATION"].includes(deal.status)
    && (before.briefUrl !== deal.briefUrl || before.targetLiveDate?.valueOf() !== deal.targetLiveDate.valueOf())) {
    const date = deal.targetLiveDate.toISOString().slice(0, 10);
    await enqueueEmail(tx, deal, `brief/${deal.revision}`, "BRIEF", "Product brief and publication schedule",
      `${greeting}Product brief: ${deal.briefUrl}\nTarget publish date: ${date}.${deal.shippingAddress ? "" : "\nPlease confirm your shipping address."}${reply}`, now);
  }
  if (deal.shippingTrackingNumber && deal.shippingTrackingNumber !== before.shippingTrackingNumber) {
    await enqueueEmail(tx, deal, `shipment/${deal.revision}`, "SHIPMENT", "Your sample has shipped",
      `${greeting}Tracking number: ${deal.shippingTrackingNumber}. Please confirm when your sample arrives.${reply}`, now);
  }
  if (deal.reviewStatus === "REVISION_REQUESTED" &&
    (deal.reviewStatus !== before.reviewStatus || deal.reviewNotes !== before.reviewNotes || deal.draftUrl !== before.draftUrl)) {
    await enqueueEmail(tx, deal, `revision/${deal.revision}`, "REVISION", "Changes requested for your draft",
      `${greeting}Thank you for the draft. Please update the following:\n\n${deal.reviewNotes}${reply}`, now);
  }
  if (deal.status === "LIVE_PENDING" && deal.trackingLink && (
    before.status !== deal.status || before.trackingLink !== deal.trackingLink ||
    before.affiliateUrl !== deal.affiliateUrl || before.hashtags !== deal.hashtags
  )) {
    await enqueueEmail(tx, deal, `assets/${deal.revision}`, "ASSETS", "Approved video and publication assets",
      [`${greeting}Your draft is approved. Please use these assets when publishing:`,
        `UTM link: ${deal.trackingLink}`, deal.affiliateUrl && `Affiliate link: ${deal.affiliateUrl}`,
        `Required tags: ${deal.hashtags}`, `Please submit the live video URL after publishing.${reply}`].filter(Boolean).join("\n"), now);
  }
}

function scheduled(date: Date, daysBefore = 0) {
  return new Date(date.valueOf() - daysBefore * DAY + 15 * 3_600_000);
}

export function dueReminders(deal: FlowDeal, now: Date) {
  const open = deal.status === "LOGISTICS_CONTRACT" || deal.status === "DRAFT_REVIEW";
  const reminders = [
    { type: "SHIP_REMINDER", due: open && !deal.shippingTrackingNumber && deal.plannedShipDate && scheduled(deal.plannedShipDate), internal: true,
      subject: "Sample shipment is due", text: "Please ship the sample and record the tracking number in Relay." },
    { type: "DELIVERY_REMINDER", due: open && Boolean(deal.shippingTrackingNumber) && !deal.deliveredAt && deal.expectedDeliveryDate && scheduled(deal.expectedDeliveryDate), internal: true,
      subject: "Confirm the sample delivery", text: "Please check the carrier and record the sample delivery in Relay." },
    { type: "SCRIPT_REMINDER", due: open && !deal.scriptUrl && !deal.draftUrl && deal.targetLiveDate && scheduled(deal.targetLiveDate, 10), internal: false,
      subject: "Reminder to submit your script", text: "Please send your script for the collaboration." },
    { type: "DRAFT_REMINDER", due: open && (!deal.draftUrl || deal.reviewStatus === "REVISION_REQUESTED") && deal.targetLiveDate && scheduled(deal.targetLiveDate, 7), internal: false,
      subject: "Reminder to submit your video draft", text: "Please send the latest cut for review before your target publish date." },
    { type: "PUBLISH_REMINDER", due: deal.status === "LIVE_PENDING" && deal.targetLiveDate && scheduled(deal.targetLiveDate), internal: false,
      subject: "Your collaboration is scheduled to go live", text: "Please submit your live video URL and publish time once the post is up." },
  ];
  return reminders.flatMap(({ due, ...reminder }) => due && due <= now
    ? [{ ...reminder, key: `reminder/${reminder.type}/${due.toISOString()}` }] : []);
}

export function emailCurrent(deal: FlowDeal, key: string, email: Email, now: Date) {
  if (email.type.endsWith("_REMINDER")) {
    return dueReminders(deal, now).some((item) => `${deal.id}/${item.key}` === key
      && (item.internal ? process.env.OPS_EMAIL || "ops@example.test" : deal.creator.email) === email.to);
  }
  if (email.to !== deal.creator.email) return false;
  switch (email.type) {
    case "QUOTE": return deal.status === "NEGOTIATION" && deal.askingRate === null;
    case "REVISION": return deal.status === "DRAFT_REVIEW" && deal.reviewStatus === "REVISION_REQUESTED"
      && email.text.includes(`\n\n${deal.reviewNotes}`);
    case "SHIPMENT": return Boolean(deal.shippingTrackingNumber && email.text.includes(`Tracking number: ${deal.shippingTrackingNumber}.`));
    case "BRIEF": return Boolean(deal.briefUrl && deal.targetLiveDate && email.text.includes(`Product brief: ${deal.briefUrl}\nTarget publish date: ${deal.targetLiveDate.toISOString().slice(0, 10)}.`));
    case "ASSETS": return deal.status === "LIVE_PENDING" && Boolean(deal.trackingLink && email.text.includes(`UTM link: ${deal.trackingLink}\n`)
      && email.text.includes(`Required tags: ${deal.hashtags}\n`)
      && (deal.affiliateUrl ? email.text.includes(`Affiliate link: ${deal.affiliateUrl}\n`) : !email.text.includes("\nAffiliate link: ")));
    default: return false;
  }
}
