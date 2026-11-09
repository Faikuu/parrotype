-- Permission groups (2.4). Structure first, then the data that replaces users.role, then the column drop.

-- Order matters: the admins are copied into Administrators while User.role still exists.

-- CreateTable
CREATE TABLE "PermissionGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupPermission" (
    "groupId" INTEGER NOT NULL,
    "permission" TEXT NOT NULL,

    PRIMARY KEY ("groupId", "permission"),
    CONSTRAINT "GroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "groupId"),
    CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroup_name_key" ON "PermissionGroup"("name");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- Data: the two starting groups. Administrators is the system group with every catalog permission.
INSERT INTO "PermissionGroup" ("name", "description", "system", "updatedAt")
VALUES ('Administrators', 'Every permission. Cannot be renamed or deleted.', true, CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)),
       ('Moderators', 'Reviews reports, suspends users and removes results.', false, CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER));

-- Data: Administrators permissions.
INSERT INTO "GroupPermission" ("groupId", "permission")
SELECT "g"."id", "k"."permission"
FROM "PermissionGroup" AS "g"
CROSS JOIN (
  SELECT 'admin.access' AS "permission"
  UNION ALL SELECT 'users.read' AS "permission"
  UNION ALL SELECT 'users.edit' AS "permission"
  UNION ALL SELECT 'users.ban' AS "permission"
  UNION ALL SELECT 'users.delete' AS "permission"
  UNION ALL SELECT 'users.groups' AS "permission"
  UNION ALL SELECT 'groups.read' AS "permission"
  UNION ALL SELECT 'groups.manage' AS "permission"
  UNION ALL SELECT 'reports.read' AS "permission"
  UNION ALL SELECT 'reports.resolve' AS "permission"
  UNION ALL SELECT 'results.read' AS "permission"
  UNION ALL SELECT 'results.delete' AS "permission"
  UNION ALL SELECT 'quotes.read' AS "permission"
  UNION ALL SELECT 'quotes.manage' AS "permission"
  UNION ALL SELECT 'races.read' AS "permission"
  UNION ALL SELECT 'races.manage' AS "permission"
  UNION ALL SELECT 'audit.read' AS "permission"
) AS "k"
WHERE "g"."name" = 'Administrators';

-- Data: Moderators permissions.
INSERT INTO "GroupPermission" ("groupId", "permission")
SELECT "g"."id", "k"."permission"
FROM "PermissionGroup" AS "g"
CROSS JOIN (
  SELECT 'admin.access' AS "permission"
  UNION ALL SELECT 'users.read' AS "permission"
  UNION ALL SELECT 'users.ban' AS "permission"
  UNION ALL SELECT 'reports.read' AS "permission"
  UNION ALL SELECT 'reports.resolve' AS "permission"
  UNION ALL SELECT 'results.read' AS "permission"
  UNION ALL SELECT 'results.delete' AS "permission"
  UNION ALL SELECT 'audit.read' AS "permission"
) AS "k"
WHERE "g"."name" = 'Moderators';

-- Data: every admin moves into Administrators. This must run before the role column is dropped.
INSERT INTO "UserGroup" ("userId", "groupId", "createdAt")
SELECT "u"."id", "g"."id", CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)
FROM "User" AS "u"
CROSS JOIN "PermissionGroup" AS "g"
WHERE "u"."role" = 'admin' AND "g"."name" = 'Administrators';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "bannedAt" DATETIME,
    "banReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("banReason", "bannedAt", "createdAt", "email", "id", "name", "nameLower", "passwordHash", "tokenVersion") SELECT "banReason", "bannedAt", "createdAt", "email", "id", "name", "nameLower", "passwordHash", "tokenVersion" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
CREATE UNIQUE INDEX "User_nameLower_key" ON "User"("nameLower");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
