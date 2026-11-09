-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginTicketNonce" TEXT,
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "twoFactorFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoFactorLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ResultReplay" ADD COLUMN     "hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ResultReplay_hash_key" ON "ResultReplay"("hash");

