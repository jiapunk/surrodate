PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "metWith" BOOLEAN,
    "rating" INTEGER,
    "tags" JSONB,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Feedback" ("createdAt", "id", "matchId", "metWith", "note", "rating", "tags", "userId") SELECT "createdAt", "id", "matchId", "metWith", "note", "rating", "tags", "userId" FROM "Feedback";
DROP TABLE "Feedback";
ALTER TABLE "new_Feedback" RENAME TO "Feedback";
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
CREATE UNIQUE INDEX "Feedback_matchId_userId_round_key" ON "Feedback"("matchId", "userId", "round");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

