-- CreateTable
CREATE TABLE "NegotiationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "askingRate" DECIMAL,
    "offerRate" DECIMAL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationEntry_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractDraft" (
    "dealId" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deliverable_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" DATETIME,
    "leaseUntil" DATETIME,
    "leaseToken" TEXT,
    "processedAt" DATETIME,
    "providerId" TEXT,
    "lastError" TEXT,
    CONSTRAINT "AutomationJob_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PITCHING',
    "scopeRequirements" TEXT NOT NULL DEFAULT '',
    "targetBudget" DECIMAL,
    "lockedAt" DATETIME,
    "briefUrl" TEXT,
    "plannedShipDate" DATETIME,
    "expectedDeliveryDate" DATETIME,
    "deliveredAt" DATETIME,
    "scriptUrl" TEXT,
    "sampleStatus" TEXT,
    "sampleNotes" TEXT NOT NULL DEFAULT '',
    "affiliateUrl" TEXT,
    "requiredTags" TEXT NOT NULL DEFAULT '',
    "topicNotes" TEXT NOT NULL DEFAULT '',
    "askingRate" DECIMAL,
    "agreedRate" DECIMAL,
    "contractUrl" TEXT,
    "contractSigned" BOOLEAN NOT NULL DEFAULT false,
    "shippingAddress" TEXT,
    "shippingTrackingNumber" TEXT,
    "targetLiveDate" DATETIME,
    "draftUrl" TEXT,
    "reviewStatus" TEXT,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "destinationUrl" TEXT,
    "trackingLink" TEXT,
    "hashtags" TEXT,
    "liveVideoUrl" TEXT,
    "publishedAt" DATETIME,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Deal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("agreedRate", "askingRate", "contractSigned", "contractUrl", "creatorId", "destinationUrl", "draftUrl", "hashtags", "id", "liveVideoUrl", "publishedAt", "reviewNotes", "reviewStatus", "revision", "shippingAddress", "shippingTrackingNumber", "status", "targetLiveDate", "topicNotes", "trackingLink") SELECT "agreedRate", "askingRate", "contractSigned", "contractUrl", "creatorId", "destinationUrl", "draftUrl", "hashtags", "id", "liveVideoUrl", "publishedAt", "reviewNotes", "reviewStatus", "revision", "shippingAddress", "shippingTrackingNumber", "status", "targetLiveDate", "topicNotes", "trackingLink" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE TABLE "new_MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetricSnapshot_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MetricSnapshot" ("clicks", "comments", "dayNumber", "dealId", "id", "orders", "views") SELECT "clicks", "comments", "dayNumber", "dealId", "id", "orders", "views" FROM "MetricSnapshot";
DROP TABLE "MetricSnapshot";
ALTER TABLE "new_MetricSnapshot" RENAME TO "MetricSnapshot";
CREATE UNIQUE INDEX "MetricSnapshot_dealId_dayNumber_key" ON "MetricSnapshot"("dealId", "dayNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NegotiationEntry_dealId_createdAt_idx" ON "NegotiationEntry"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Deliverable_dealId_kind_createdAt_idx" ON "Deliverable"("dealId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_eventKey_key" ON "AutomationJob"("eventKey");

-- CreateIndex
CREATE INDEX "AutomationJob_status_dueAt_idx" ON "AutomationJob"("status", "dueAt");

