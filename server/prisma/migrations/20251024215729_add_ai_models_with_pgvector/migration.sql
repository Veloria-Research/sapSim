-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "SchemaSummary" (
    "id" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchemaSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundTruth" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroundTruth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedQuery" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "graphId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchemaSummary_table_key" ON "SchemaSummary"("table");
