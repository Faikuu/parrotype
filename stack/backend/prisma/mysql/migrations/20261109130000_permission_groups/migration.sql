-- Permission groups (2.4). Structure first, then the data that replaces users.role, then the column drop.

-- Order matters: the admins are copied into Administrators while User.role still exists.

-- CreateTable
CREATE TABLE `PermissionGroup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(200) NOT NULL DEFAULT '',
    `system` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PermissionGroup_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupPermission` (
    `groupId` INTEGER NOT NULL,
    `permission` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`groupId`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserGroup` (
    `userId` INTEGER NOT NULL,
    `groupId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserGroup_groupId_idx`(`groupId`),
    PRIMARY KEY (`userId`, `groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GroupPermission` ADD CONSTRAINT `GroupPermission_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `PermissionGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserGroup` ADD CONSTRAINT `UserGroup_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserGroup` ADD CONSTRAINT `UserGroup_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `PermissionGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: the two starting groups. Administrators is the system group with every catalog permission.
INSERT INTO `PermissionGroup` (`name`, `description`, `system`, `updatedAt`)
VALUES ('Administrators', 'Every permission. Cannot be renamed or deleted.', true, CURRENT_TIMESTAMP(3)),
       ('Moderators', 'Reviews reports, suspends users and removes results.', false, CURRENT_TIMESTAMP(3));

-- Data: Administrators permissions.
INSERT INTO `GroupPermission` (`groupId`, `permission`)
SELECT `g`.`id`, `k`.`permission`
FROM `PermissionGroup` AS `g`
CROSS JOIN (
  SELECT 'admin.access' AS `permission`
  UNION ALL SELECT 'users.read' AS `permission`
  UNION ALL SELECT 'users.edit' AS `permission`
  UNION ALL SELECT 'users.ban' AS `permission`
  UNION ALL SELECT 'users.delete' AS `permission`
  UNION ALL SELECT 'users.groups' AS `permission`
  UNION ALL SELECT 'groups.read' AS `permission`
  UNION ALL SELECT 'groups.manage' AS `permission`
  UNION ALL SELECT 'reports.read' AS `permission`
  UNION ALL SELECT 'reports.resolve' AS `permission`
  UNION ALL SELECT 'results.read' AS `permission`
  UNION ALL SELECT 'results.delete' AS `permission`
  UNION ALL SELECT 'quotes.read' AS `permission`
  UNION ALL SELECT 'quotes.manage' AS `permission`
  UNION ALL SELECT 'races.read' AS `permission`
  UNION ALL SELECT 'races.manage' AS `permission`
  UNION ALL SELECT 'audit.read' AS `permission`
) AS `k`
WHERE `g`.`name` = 'Administrators';

-- Data: Moderators permissions.
INSERT INTO `GroupPermission` (`groupId`, `permission`)
SELECT `g`.`id`, `k`.`permission`
FROM `PermissionGroup` AS `g`
CROSS JOIN (
  SELECT 'admin.access' AS `permission`
  UNION ALL SELECT 'users.read' AS `permission`
  UNION ALL SELECT 'users.ban' AS `permission`
  UNION ALL SELECT 'reports.read' AS `permission`
  UNION ALL SELECT 'reports.resolve' AS `permission`
  UNION ALL SELECT 'results.read' AS `permission`
  UNION ALL SELECT 'results.delete' AS `permission`
  UNION ALL SELECT 'audit.read' AS `permission`
) AS `k`
WHERE `g`.`name` = 'Moderators';

-- Data: every admin moves into Administrators. This must run before the role column is dropped.
INSERT INTO `UserGroup` (`userId`, `groupId`, `createdAt`)
SELECT `u`.`id`, `g`.`id`, CURRENT_TIMESTAMP(3)
FROM `User` AS `u`
CROSS JOIN `PermissionGroup` AS `g`
WHERE `u`.`role` = 'admin' AND `g`.`name` = 'Administrators';

-- AlterTable
ALTER TABLE `User` DROP COLUMN `role`;
