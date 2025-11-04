-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VacationType" AS ENUM ('ANNUAL_LEAVE', 'SICK_LEAVE', 'UNPAID_LEAVE', 'PARENTAL_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('APPROVED', 'REJECTED', 'PENDING');

-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('GENERAL', 'REJECTION', 'APPROVAL', 'PARTIAL_REJECTION');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('UNAVAILABLE', 'VACATION', 'SICK', 'BUSINESS_TRIP', 'OTHER');

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'PARTIALLY_REJECTED';

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_requests" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "submittedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "vacationType" "VacationType" NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "substituteId" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fileSize" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'APPROVED',
    "rejectionReason" TEXT,
    "category" TEXT,
    "vacationRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "commentType" "CommentType" NOT NULL DEFAULT 'GENERAL',
    "userId" TEXT NOT NULL,
    "vacationRequestId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "availabilityType" "AvailabilityType" NOT NULL DEFAULT 'UNAVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userId_key" ON "users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_requests_requestId_key" ON "vacation_requests"("requestId");

-- CreateIndex
CREATE INDEX "vacation_requests_userId_idx" ON "vacation_requests"("userId");

-- CreateIndex
CREATE INDEX "vacation_requests_managerId_idx" ON "vacation_requests"("managerId");

-- CreateIndex
CREATE INDEX "vacation_requests_status_idx" ON "vacation_requests"("status");

-- CreateIndex
CREATE INDEX "vacation_requests_startDate_idx" ON "vacation_requests"("startDate");

-- CreateIndex
CREATE INDEX "file_attachments_vacationRequestId_idx" ON "file_attachments"("vacationRequestId");

-- CreateIndex
CREATE INDEX "comments_vacationRequestId_idx" ON "comments"("vacationRequestId");

-- CreateIndex
CREATE INDEX "comments_userId_idx" ON "comments"("userId");

-- CreateIndex
CREATE INDEX "availabilities_userId_idx" ON "availabilities"("userId");

-- CreateIndex
CREATE INDEX "availabilities_startDate_idx" ON "availabilities"("startDate");

-- AddForeignKey
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_vacationRequestId_fkey" FOREIGN KEY ("vacationRequestId") REFERENCES "vacation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_vacationRequestId_fkey" FOREIGN KEY ("vacationRequestId") REFERENCES "vacation_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
