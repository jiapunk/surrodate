-- CreateTable
CREATE TABLE "SecondDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "plan" JSONB NOT NULL,
    "decisionSource" TEXT,
    "acceptedA" BOOLEAN NOT NULL DEFAULT false,
    "acceptedB" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SecondDate_matchId_key" ON "SecondDate"("matchId");

