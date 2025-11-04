-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT');

-- CreateTable
CREATE TABLE "managers" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requests" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "submittedDate" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "destination" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "duration" TEXT,
    "managerId" TEXT NOT NULL,
    "totalFoodReceipts" INTEGER NOT NULL DEFAULT 0,
    "totalTravelReceipts" INTEGER NOT NULL DEFAULT 0,
    "totalStayReceipts" INTEGER NOT NULL DEFAULT 0,
    "totalAttachments" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_costs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "travelRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_costs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "travelRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay_costs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "travelRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stay_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managers_managerId_key" ON "managers"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "travel_requests_requestId_key" ON "travel_requests"("requestId");

-- CreateIndex
CREATE INDEX "travel_requests_managerId_idx" ON "travel_requests"("managerId");

-- CreateIndex
CREATE INDEX "travel_requests_status_idx" ON "travel_requests"("status");

-- CreateIndex
CREATE INDEX "travel_requests_submittedDate_idx" ON "travel_requests"("submittedDate");

-- CreateIndex
CREATE INDEX "food_costs_travelRequestId_idx" ON "food_costs"("travelRequestId");

-- CreateIndex
CREATE INDEX "travel_costs_travelRequestId_idx" ON "travel_costs"("travelRequestId");

-- CreateIndex
CREATE INDEX "stay_costs_travelRequestId_idx" ON "stay_costs"("travelRequestId");

-- AddForeignKey
ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("managerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_costs" ADD CONSTRAINT "food_costs_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_costs" ADD CONSTRAINT "travel_costs_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_costs" ADD CONSTRAINT "stay_costs_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
