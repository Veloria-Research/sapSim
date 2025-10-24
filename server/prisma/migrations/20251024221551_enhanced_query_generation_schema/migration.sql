/*
  Warnings:

  - You are about to drop the column `graphId` on the `GeneratedQuery` table. All the data in the column will be lost.
  - You are about to drop the column `provenance` on the `GeneratedQuery` table. All the data in the column will be lost.
  - Added the required column `complexity` to the `GeneratedQuery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `joinTypes` to the `GeneratedQuery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tablesUsed` to the `GeneratedQuery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `validationStatus` to the `GeneratedQuery` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GeneratedQuery" DROP COLUMN "graphId",
DROP COLUMN "provenance",
ADD COLUMN     "complexity" TEXT NOT NULL,
ADD COLUMN     "executionTime" DOUBLE PRECISION,
ADD COLUMN     "joinTypes" JSONB NOT NULL,
ADD COLUMN     "resultCount" INTEGER,
ADD COLUMN     "tablesUsed" JSONB NOT NULL,
ADD COLUMN     "templateUsed" TEXT,
ADD COLUMN     "validationErrors" JSONB,
ADD COLUMN     "validationStatus" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ColumnMetadata" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "isNullable" BOOLEAN NOT NULL,
    "isPrimaryKey" BOOLEAN NOT NULL,
    "isForeignKey" BOOLEAN NOT NULL,
    "referencedTable" TEXT,
    "referencedColumn" TEXT,
    "semanticType" TEXT,
    "businessContext" TEXT,
    "description" TEXT,
    "embedding" vector(1536),
    "sampleValues" JSONB NOT NULL,
    "valuePatterns" JSONB NOT NULL,
    "uniqueValueCount" INTEGER,
    "nullPercentage" DOUBLE PRECISION,
    "possibleJoinKeys" JSONB NOT NULL,
    "semanticSimilarity" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColumnMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableRelationship" (
    "id" TEXT NOT NULL,
    "leftTable" TEXT NOT NULL,
    "leftColumn" TEXT NOT NULL,
    "rightTable" TEXT NOT NULL,
    "rightColumn" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "joinType" TEXT NOT NULL,
    "businessRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "sqlTemplate" TEXT NOT NULL,
    "requiredTables" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueryTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ColumnMetadata_tableName_idx" ON "ColumnMetadata"("tableName");

-- CreateIndex
CREATE INDEX "ColumnMetadata_semanticType_idx" ON "ColumnMetadata"("semanticType");

-- CreateIndex
CREATE UNIQUE INDEX "ColumnMetadata_tableName_columnName_key" ON "ColumnMetadata"("tableName", "columnName");

-- CreateIndex
CREATE INDEX "TableRelationship_leftTable_idx" ON "TableRelationship"("leftTable");

-- CreateIndex
CREATE INDEX "TableRelationship_rightTable_idx" ON "TableRelationship"("rightTable");

-- CreateIndex
CREATE UNIQUE INDEX "TableRelationship_leftTable_leftColumn_rightTable_rightColu_key" ON "TableRelationship"("leftTable", "leftColumn", "rightTable", "rightColumn");

-- CreateIndex
CREATE INDEX "QueryTemplate_pattern_idx" ON "QueryTemplate"("pattern");

-- CreateIndex
CREATE INDEX "GeneratedQuery_createdAt_idx" ON "GeneratedQuery"("createdAt");

-- CreateIndex
CREATE INDEX "GeneratedQuery_confidence_idx" ON "GeneratedQuery"("confidence");
