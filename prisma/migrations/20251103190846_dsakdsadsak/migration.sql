-- AlterTable
ALTER TABLE "file_attachments" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "food_costs" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "stay_costs" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "travel_costs" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING';
