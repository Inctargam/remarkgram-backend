import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/database/prisma/generated/client.ts';
import { Currency, PeriodUnit } from '../src/database/prisma/generated/enums.ts';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed payment plans');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const plans = [
  {
    price: 1_000,
    currency: Currency.USD,
    periodUnit: PeriodUnit.DAY,
    periodCount: 1,
  },
  {
    price: 5_000,
    currency: Currency.USD,
    periodUnit: PeriodUnit.WEEK,
    periodCount: 1,
  },
  {
    price: 10_000,
    currency: Currency.USD,
    periodUnit: PeriodUnit.MONTH,
    periodCount: 1,
  },
] as const;

const seedPlans = async (): Promise<void> => {
  await prisma.$transaction(async (transaction) => {
    for (const plan of plans) {
      const existingPlans = await transaction.plan.findMany({
        where: {
          periodUnit: plan.periodUnit,
          periodCount: plan.periodCount,
        },
        select: { id: true },
        take: 2,
      });

      if (existingPlans.length > 1) {
        throw new Error(`Cannot seed duplicate plans for ${plan.periodUnit}/${plan.periodCount}`);
      }

      const existingPlan = existingPlans[0];

      if (existingPlan) {
        await transaction.plan.update({
          where: { id: existingPlan.id },
          data: {
            price: plan.price,
            currency: plan.currency,
          },
        });
      } else {
        await transaction.plan.create({ data: plan });
      }
    }
  });
};

try {
  await seedPlans();
} finally {
  await prisma.$disconnect();
}
