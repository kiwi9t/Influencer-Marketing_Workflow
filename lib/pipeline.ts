export const STAGES = [
  { id: "PITCHING", label: "Pitching", hint: "Creative scope", title: "Shape the pitch", description: "Capture the idea and deliverables from the creator’s positive reply.", next: "Confirm scope" },
  { id: "NEGOTIATION", label: "Negotiation", hint: "Rates & terms", title: "Agree on a rate", description: "Record what the creator asked for and the amount you agreed to pay.", next: "Lock agreed rate" },
  { id: "LOGISTICS_CONTRACT", label: "Logistics & contract", hint: "Signature & sample", title: "Get the details in place", description: "Confirm the contract, sample shipment, and target publish date.", next: null },
  { id: "DRAFT_REVIEW", label: "Draft review", hint: "Video & feedback", title: "Review the draft", description: "Share feedback and approve the current cut when it’s ready to publish.", next: null },
  { id: "LIVE_PENDING", label: "Go live", hint: "Tracking & publish", title: "Confirm the live post", description: "Verify the creator’s published video and its publication time.", next: "Confirm post is live" },
  { id: "COMPLETED", label: "Performance tracking", hint: "7-day tracking", title: "Track the first 7 days", description: "Review automated daily snapshots and enter results manually when needed.", next: null },
] as const;

export const PLATFORMS = ["Instagram", "TikTok", "YouTube"] as const;
export const METRICS = ["views", "comments", "clicks", "orders"] as const;
export const DEAL_ID = "first-collaboration";

export type Stage = typeof STAGES[number]["id"];
export type Platform = typeof PLATFORMS[number];
export type Metrics = Record<typeof METRICS[number], number>;
export type Day = Metrics & { dayNumber: number; source: string; capturedAt: string };
export type JobSummary = {
  id: string; kind: "EMAIL" | "METRICS"; status: "PENDING" | "RUNNING" | "PREVIEW" | "DONE" | "FAILED" | "CANCELED";
  subject: string; recipient?: string; preview?: string | null; dueAt: string; attempts: number; lastError: string | null;
};
export type DealData = {
  title: string; isDemo: boolean; stageHistory: { from: string | null; to: string; at: string }[];
  id: string; status: Stage; revision: number;
  creator: { name: string; handle: string; email: string; platform: Platform };
  scopeRequirements: string; targetBudget: number | null; lockedAt: string | null; contractDraft: string | null;
  briefUrl: string | null; plannedShipDate: string | null; expectedDeliveryDate: string | null;
  deliveredAt: string | null; scriptUrl: string | null; sampleStatus: string | null; sampleNotes: string;
  affiliateUrl: string | null; requiredTags: string;
  jobs: JobSummary[];
  negotiationHistory: { id: string; note: string; askingRate: number | null; offerRate: number | null; createdAt: string }[];
  deliverables: { id: string; kind: string; status: string; url: string | null; notes: string; createdAt: string }[];
  topicNotes: string; askingRate: number | null; agreedRate: number | null;
  contractUrl: string | null; contractSigned: boolean; shippingAddress: string | null;
  shippingTrackingNumber: string | null; targetLiveDate: string | null;
  draftUrl: string | null; reviewStatus: "APPROVED" | "REVISION_REQUESTED" | null; reviewNotes: string;
  destinationUrl: string | null; trackingLink: string | null; hashtags: string | null;
  liveVideoUrl: string | null; publishedAt: string | null; metrics: Day[];
};
