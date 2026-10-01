import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  Currency as PrismaCurrency,
  PeriodUnit as PrismaPeriodUnit,
} from '../../../database/prisma/generated/enums.js';
import type { PlanModel as PrismaPlan } from '../../../database/prisma/generated/models/Plan.js';
import {
  InvalidPlanCurrencyError,
  InvalidPlanPeriodError,
  InvalidPlanPriceError,
} from '../application/errors/plan.errors.js';
import { Currency, PeriodUnit, type PersistedPlan } from '../domain/plan.entity.js';
import { PlanPrismaMapper } from './plan-prisma.mapper.js';

const validRow: PrismaPlan = {
  id: 1,
  price: 5_000,
  currency: PrismaCurrency.USD,
  periodCount: 1,
  periodUnit: PrismaPeriodUnit.WEEK,
};

describe('PlanPrismaMapper', () => {
  it.each([
    { prisma: PrismaPeriodUnit.DAY, domain: PeriodUnit.DAY },
    { prisma: PrismaPeriodUnit.WEEK, domain: PeriodUnit.WEEK },
    { prisma: PrismaPeriodUnit.MONTH, domain: PeriodUnit.MONTH },
  ])('maps Prisma $prisma to domain $domain', ({ prisma, domain }) => {
    const plan = PlanPrismaMapper.toDomain({ ...validRow, periodUnit: prisma });

    expect(plan).toEqual({
      id: 1,
      price: 5_000,
      currency: Currency.USD,
      periodCount: 1,
      periodUnit: domain,
    });
    expectTypeOf(plan).toEqualTypeOf<PersistedPlan>();
    expectTypeOf(plan.id).toEqualTypeOf<number>();
  });

  it('rejects an unknown Prisma currency', () => {
    const row = { ...validRow, currency: 'EUR' } as unknown as PrismaPlan;

    expect(() => PlanPrismaMapper.toDomain(row)).toThrow(InvalidPlanCurrencyError);
  });

  it('rejects an unknown Prisma period unit', () => {
    const row = { ...validRow, periodUnit: 'YEAR' } as unknown as PrismaPlan;

    expect(() => PlanPrismaMapper.toDomain(row)).toThrow(InvalidPlanPeriodError);
  });

  it('does not allow invalid persisted values into the domain', () => {
    expect(() => PlanPrismaMapper.toDomain({ ...validRow, price: 0 })).toThrow(InvalidPlanPriceError);
  });
});
