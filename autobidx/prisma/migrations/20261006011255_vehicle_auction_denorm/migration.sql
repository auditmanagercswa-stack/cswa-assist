-- DropIndex
DROP INDEX "Vehicle_searchText_trgm_idx";

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "bidCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentBid" INTEGER,
ADD COLUMN     "liveAuctionId" TEXT;

-- CreateIndex
CREATE INDEX "Vehicle_status_auctionEndAt_idx" ON "Vehicle"("status", "auctionEndAt");

-- CreateIndex
CREATE INDEX "Vehicle_status_bidCount_idx" ON "Vehicle"("status", "bidCount" DESC);

-- CreateIndex
CREATE INDEX "Vehicle_status_viewCount_idx" ON "Vehicle"("status", "viewCount" DESC);
