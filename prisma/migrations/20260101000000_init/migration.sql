-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "platform" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PITCHING',
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

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "orders" INTEGER NOT NULL,
    CONSTRAINT "MetricSnapshot_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_dealId_dayNumber_key" ON "MetricSnapshot"("dealId", "dayNumber");

