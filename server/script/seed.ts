import { Prisma, PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

type Scale = "tiny" | "small" | "medium" | "large";

const scale: Scale = (process.env.SEED_SCALE as Scale) || "small";

const VOLUMES: Record<
  Scale,
  { mara: number; kna1: number; vbak: number; vbapPerVbak: [number, number] }
> = {
  tiny: { mara: 500, kna1: 200, vbak: 1000, vbapPerVbak: [1, 3] },
  small: { mara: 5000, kna1: 2000, vbak: 10000, vbapPerVbak: [1, 5] },
  medium: { mara: 20000, kna1: 10000, vbak: 50000, vbapPerVbak: [1, 8] },
  large: { mara: 50000, kna1: 30000, vbak: 150000, vbapPerVbak: [1, 10] },
};

const cfg = VOLUMES[scale];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const MTARTS = ["FERT", "HALB", "ROH", "HAWA"];
const MEINS = ["PC", "EA", "KG", "LTR", "M"];
const VKORG = ["1000", "2000", "3000"];
const WERKS = ["1000", "1100", "1200", "2000"]; // plants
const AUART = ["OR", "TA", "KE", "RE"]; // order types

function genMATNR(i: number): string {
  return String(100000 + i).padStart(18, "0");
}

function genVBELN(i: number): string {
  return String(900000 + i).padStart(10, "0");
}

function genKUNNR(i: number): string {
  return String(500000 + i).padStart(10, "0");
}

async function seedMARA() {
  const batchSize = 1000;
  for (let i = 0; i < cfg.mara; i += batchSize) {
    const data = Array.from(
      { length: Math.min(batchSize, cfg.mara - i) },
      (_, k) => {
        const idx = i + k;
        return {
          MATNR: genMATNR(idx),
          MTART: randomFrom(MTARTS),
          MATKL: faker.string
            .alphanumeric({ length: { min: 4, max: 9 } })
            .toUpperCase(),
          MEINS: randomFrom(MEINS),
          LAEDA: faker.date.recent({ days: 180 }),
        };
      }
    );
    await prisma.mARA.createMany({ data, skipDuplicates: true });
  }
}

async function seedKNA1() {
  const batchSize = 1000;
  for (let i = 0; i < cfg.kna1; i += batchSize) {
    const data = Array.from(
      { length: Math.min(batchSize, cfg.kna1 - i) },
      (_, k) => {
        const idx = i + k;
        return {
          KUNNR: genKUNNR(idx),
          LAND1: faker.location.countryCode("alpha-2"),
          ORT01: faker.location.city(),
          NAME1: faker.company.name().slice(0, 35),
          REGIO: faker.location.stateAbbr(),
        };
      }
    );
    await prisma.kNA1.createMany({ data, skipDuplicates: true });
  }
}

async function seedVBAKandVBAP() {
  const vbakCount = cfg.vbak;
  const maraKeys = await prisma.mARA.findMany({
    select: { MATNR: true },
    take: 50000,
  });
  const kna1Keys = await prisma.kNA1.findMany({
    select: { KUNNR: true },
    take: 50000,
  });

  const batchSize = 1000;
  for (let i = 0; i < vbakCount; i += batchSize) {
    const batchLen = Math.min(batchSize, vbakCount - i);
    const vbak = Array.from({ length: batchLen }, (_, k) => {
      const idx = i + k;
      return {
        VBELN: genVBELN(idx),
        AUART: randomFrom(AUART),
        ERDAT: faker.date.recent({ days: 365 }),
        KUNNR: randomFrom(kna1Keys).KUNNR,
        VKORG: randomFrom(VKORG),
      };
    });
    await prisma.vBAK.createMany({ data: vbak, skipDuplicates: true });

    // VBAP items per VBAK
    const vbap: Array<{
      VBELN: string;
      POSNR: string;
      MATNR: string | null;
      KWMENG: any;
      WERKS: string | null;
      ERDAT: Date;
    }> = [];

    for (const h of vbak) {
      const items = faker.number.int({
        min: cfg.vbapPerVbak[0],
        max: cfg.vbapPerVbak[1],
      });
      for (let p = 1; p <= items; p++) {
        const mat = randomFrom(maraKeys).MATNR;
        vbap.push({
          VBELN: h.VBELN,
          POSNR: String(p).padStart(6, "0"),
          MATNR: mat,
          KWMENG: new Prisma.Decimal(
            faker.number.float({ min: 1, max: 100, fractionDigits: 3 })
          ),
          WERKS: randomFrom(WERKS),
          ERDAT: h.ERDAT as Date,
        });
      }
    }
    if (vbap.length > 0)
      await prisma.vBAP.createMany({ data: vbap, skipDuplicates: true });
  }
}

async function main() {
  console.time("seed");
  await seedMARA();
  await seedKNA1();
  await seedVBAKandVBAP();
  console.timeEnd("seed");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
