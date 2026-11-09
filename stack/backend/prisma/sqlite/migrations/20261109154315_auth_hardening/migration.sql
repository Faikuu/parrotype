-- AlterTable
ALTER TABLE "ResultReplay" ADD COLUMN "hash" TEXT;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailVerifiedAt" DATETIME,
    "totpSecret" TEXT,
    "totpEnabledAt" DATETIME,
    "twoFactorFailures" INTEGER NOT NULL DEFAULT 0,
    "twoFactorLockedUntil" DATETIME,
    "totpLastStep" INTEGER,
    "loginTicketNonce" TEXT
);
INSERT INTO "new_User" ("banReason", "bannedAt", "createdAt", "email", "emailVerifiedAt", "id", "name", "nameLower", "passwordHash", "tokenVersion", "totpEnabledAt", "totpSecret") SELECT "banReason", "bannedAt", "createdAt", "email", "emailVerifiedAt", "id", "name", "nameLower", "passwordHash", "tokenVersion", "totpEnabledAt", "totpSecret" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
CREATE UNIQUE INDEX "User_nameLower_key" ON "User"("nameLower");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ResultReplay_hash_key" ON "ResultReplay"("hash");

