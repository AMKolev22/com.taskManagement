-- CreateTable
CREATE TABLE "equipment_requests" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "submittedDate" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "managerId" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL DEFAULT '0',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_items" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "equipmentRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_requests_requestId_key" ON "equipment_requests"("requestId");

-- CreateIndex
CREATE INDEX "equipment_requests_managerId_idx" ON "equipment_requests"("managerId");

-- CreateIndex
CREATE INDEX "equipment_requests_status_idx" ON "equipment_requests"("status");

-- CreateIndex
CREATE INDEX "equipment_requests_submittedDate_idx" ON "equipment_requests"("submittedDate");

-- CreateIndex
CREATE INDEX "equipment_items_equipmentRequestId_idx" ON "equipment_items"("equipmentRequestId");

-- AddForeignKey
ALTER TABLE "equipment_requests" ADD CONSTRAINT "equipment_requests_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("managerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_equipmentRequestId_fkey" FOREIGN KEY ("equipmentRequestId") REFERENCES "equipment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
