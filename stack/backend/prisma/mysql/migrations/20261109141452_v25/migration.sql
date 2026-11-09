-- AlterTable
ALTER TABLE `User` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `totpEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `totpSecret` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Result` ADD COLUMN `eventId` INTEGER NULL,
    ADD COLUMN `verified` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `AuthToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuthToken_tokenHash_key`(`tokenHash`),
    INDEX `AuthToken_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecoveryCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NULL,

    INDEX `RecoveryCode_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `data` TEXT NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message` TEXT NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'info',
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Announcement_startsAt_idx`(`startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL DEFAULT '',
    `language` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Event_slug_key`(`slug`),
    INDEX `Event_startsAt_endsAt_idx`(`startsAt`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResultReplay` (
    `resultId` INTEGER NOT NULL,
    `data` MEDIUMTEXT NOT NULL,

    PRIMARY KEY (`resultId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Result_eventId_wpm_idx` ON `Result`(`eventId`, `wpm`);

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecoveryCode` ADD CONSTRAINT `RecoveryCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResultReplay` ADD CONSTRAINT `ResultReplay_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `Result`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: Administrators gets the three new permissions (Moderators gets none of them).
INSERT INTO `GroupPermission` (`groupId`, `permission`)
SELECT `g`.`id`, `k`.`permission`
FROM `PermissionGroup` AS `g`
CROSS JOIN (
  SELECT 'announcements.manage' AS `permission`
  UNION ALL SELECT 'events.manage' AS `permission`
  UNION ALL SELECT 'users.security' AS `permission`
) AS `k`
WHERE `g`.`name` = 'Administrators';
