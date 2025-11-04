-- AlterTable
ALTER TABLE "travel_requests" ADD COLUMN     "submittedBy" TEXT,
ADD COLUMN     "submittedByEmail" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "travel_requests_userId_idx" ON "travel_requests"("userId");
