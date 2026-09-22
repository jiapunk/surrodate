-- CreateTable
CREATE TABLE "SwarmPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "teamId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "model" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL,
    "retained" BOOLEAN,
    "answers" JSONB,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SwarmPart_runId_idx" ON "SwarmPart"("runId");

-- CreateIndex
CREATE INDEX "SwarmPart_teamId_idx" ON "SwarmPart"("teamId");

-- CreateIndex
CREATE INDEX "SwarmPart_status_idx" ON "SwarmPart"("status");

