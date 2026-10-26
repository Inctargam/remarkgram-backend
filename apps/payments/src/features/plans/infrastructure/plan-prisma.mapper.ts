import {
  Currency as PrismaCurrencyValues,
  PeriodUnit as PrismaPeriodUnitValues,
  type Currency as PrismaCurrency,
  type PeriodUnit as PrismaPeriodUnit,
} from '../../../database/prisma/generated/enums.js';
import type { PlanModel as PrismaPlan } from '../../../database/prisma/generated/models/Plan.js';
import { InvalidPlanCurrencyError, InvalidPlanPeriodError } from '../application/errors/plan.errors.js';
import { Currency, PeriodUnit, Plan, type PersistedPlan } from '../domain/plan.entity.js';

export class PlanPrismaMapper {
  static toDomain(row: PrismaPlan): PersistedPlan {
    return Plan.restore({
      id: row.id,
      price: row.price,
      currency: PlanPrismaMapper.toDomainCurrency(row.currency),
      periodCount: row.periodCount,
      periodUnit: PlanPrismaMapper.toDomainPeriodUnit(row.periodUnit, row.periodCount),
    });
  }

  private static toDomainCurrency(currency: PrismaCurrency): Currency {
    switch (currency) {
      case PrismaCurrencyValues.USD:
        return Currency.USD;
      default:
        throw new InvalidPlanCurrencyError(currency);
    }
  }

  private static toDomainPeriodUnit(periodUnit: PrismaPeriodUnit, periodCount: number): PeriodUnit {
    switch (periodUnit) {
      case PrismaPeriodUnitValues.DAY:
        return PeriodUnit.DAY;
      case PrismaPeriodUnitValues.WEEK:
        return PeriodUnit.WEEK;
      case PrismaPeriodUnitValues.MONTH:
        return PeriodUnit.MONTH;
      default:
        throw new InvalidPlanPeriodError(periodUnit, periodCount);
    }
  }
}
