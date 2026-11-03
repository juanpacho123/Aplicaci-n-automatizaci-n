-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN     "additional_info" TEXT,
ADD COLUMN     "tracking_code_hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_tracking_code_hash_key" ON "access_requests"("tracking_code_hash");

