-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `nameLower` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_name_key`(`name`),
    UNIQUE INDEX `User_nameLower_key`(`nameLower`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `language` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `source` TEXT NOT NULL,
    `length` INTEGER NOT NULL,

    INDEX `Quote_language_idx`(`language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Result` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `mode` VARCHAR(191) NOT NULL,
    `mode2` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL,
    `wpm` DOUBLE NOT NULL,
    `rawWpm` DOUBLE NOT NULL,
    `accuracy` DOUBLE NOT NULL,
    `consistency` DOUBLE NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `correctChars` INTEGER NOT NULL,
    `incorrectChars` INTEGER NOT NULL,
    `extraChars` INTEGER NOT NULL,
    `missedChars` INTEGER NOT NULL,
    `punctuation` BOOLEAN NOT NULL,
    `numbers` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Result_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Result_mode_mode2_language_wpm_idx`(`mode`, `mode2`, `language`, `wpm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

