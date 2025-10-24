import { PrismaClient } from "@prisma/client";

export interface TableStructure {
  tableName: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    referencedTable?: string;
    referencedField?: string;
  }>;
  sampleData: Record<string, any>[];
  recordCount: number;
}

export interface ExtractedData {
  tables: TableStructure[];
  extractedAt: Date;
  metadata: {
    totalTables: number;
    totalRecords: number;
  };
}

export class ExtractorService {
  constructor(private prisma: PrismaClient) {}

  async extractAllTables(): Promise<ExtractedData> {
    const tables: TableStructure[] = [];
    
    // Extract MARA table
    const maraStructure = await this.extractTableStructure('MARA', {
      fields: [
        { name: 'MATNR', type: 'VARCHAR(18)', nullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'MTART', type: 'CHAR(4)', nullable: false, isPrimaryKey: false, isForeignKey: false },
        { name: 'MATKL', type: 'VARCHAR(9)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'MEINS', type: 'CHAR(3)', nullable: false, isPrimaryKey: false, isForeignKey: false },
        { name: 'LAEDA', type: 'DATE', nullable: true, isPrimaryKey: false, isForeignKey: false },
      ],
      sampleQuery: () => this.prisma.mARA.findMany({ take: 5 }),
      countQuery: () => this.prisma.mARA.count()
    });
    tables.push(maraStructure);

    // Extract KNA1 table
    const kna1Structure = await this.extractTableStructure('KNA1', {
      fields: [
        { name: 'KUNNR', type: 'VARCHAR(10)', nullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'LAND1', type: 'CHAR(2)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'ORT01', type: 'VARCHAR(25)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'NAME1', type: 'VARCHAR(35)', nullable: false, isPrimaryKey: false, isForeignKey: false },
        { name: 'REGIO', type: 'VARCHAR(3)', nullable: true, isPrimaryKey: false, isForeignKey: false },
      ],
      sampleQuery: () => this.prisma.kNA1.findMany({ take: 5 }),
      countQuery: () => this.prisma.kNA1.count()
    });
    tables.push(kna1Structure);

    // Extract VBAK table
    const vbakStructure = await this.extractTableStructure('VBAK', {
      fields: [
        { name: 'VBELN', type: 'VARCHAR(10)', nullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'AUART', type: 'CHAR(4)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'ERDAT', type: 'DATE', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'KUNNR', type: 'VARCHAR(10)', nullable: false, isPrimaryKey: false, isForeignKey: true, referencedTable: 'KNA1', referencedField: 'KUNNR' },
        { name: 'VKORG', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isForeignKey: false },
      ],
      sampleQuery: () => this.prisma.vBAK.findMany({ take: 5 }),
      countQuery: () => this.prisma.vBAK.count()
    });
    tables.push(vbakStructure);

    // Extract VBAP table
    const vbapStructure = await this.extractTableStructure('VBAP', {
      fields: [
        { name: 'VBELN', type: 'VARCHAR(10)', nullable: false, isPrimaryKey: true, isForeignKey: true, referencedTable: 'VBAK', referencedField: 'VBELN' },
        { name: 'POSNR', type: 'VARCHAR(6)', nullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'MATNR', type: 'VARCHAR(18)', nullable: true, isPrimaryKey: false, isForeignKey: true, referencedTable: 'MARA', referencedField: 'MATNR' },
        { name: 'KWMENG', type: 'DECIMAL(15,3)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'WERKS', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isForeignKey: false },
        { name: 'ERDAT', type: 'DATE', nullable: true, isPrimaryKey: false, isForeignKey: false },
      ],
      sampleQuery: () => this.prisma.vBAP.findMany({ take: 5 }),
      countQuery: () => this.prisma.vBAP.count()
    });
    tables.push(vbapStructure);

    const totalRecords = tables.reduce((sum, table) => sum + table.recordCount, 0);

    return {
      tables,
      extractedAt: new Date(),
      metadata: {
        totalTables: tables.length,
        totalRecords
      }
    };
  }

  private async extractTableStructure(
    tableName: string,
    config: {
      fields: Array<{
        name: string;
        type: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        referencedTable?: string;
        referencedField?: string;
      }>;
      sampleQuery: () => Promise<any[]>;
      countQuery: () => Promise<number>;
    }
  ): Promise<TableStructure> {
    const [sampleData, recordCount] = await Promise.all([
      config.sampleQuery(),
      config.countQuery()
    ]);

    return {
      tableName,
      fields: config.fields,
      sampleData,
      recordCount
    };
  }

  async saveExtractedData(data: ExtractedData): Promise<string> {
    // Save to a JSON file for now (in a real scenario, this might go to a data lake)
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const outputDir = path.join(process.cwd(), 'extracted_data');
    await fs.mkdir(outputDir, { recursive: true });
    
    const filename = `sap_extraction_${data.extractedAt.toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(outputDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    
    return filepath;
  }
}