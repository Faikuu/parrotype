-- AlterTable
ALTER TABLE `User` ADD COLUMN `loginTicketNonce` VARCHAR(191) NULL,
    ADD COLUMN `totpLastStep` INTEGER NULL,
    ADD COLUMN `twoFactorFailures` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `twoFactorLockedUntil` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ResultReplay` ADD COLUMN `hash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ResultReplay_hash_key` ON `ResultReplay`(`hash`);

