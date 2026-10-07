-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "agentId" TEXT;

-- CreateIndex
CREATE INDEX "Property_agentId_idx" ON "Property"("agentId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VerificationAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

