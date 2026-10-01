import {
  InvalidPlanCurrencyError,
  InvalidPlanIdError,
  InvalidPlanPeriodError,
  InvalidPlanPriceError,
} from '../application/errors/plan.errors.js';

export enum Currency {
  USD = 'USD',
}

export enum PeriodUnit {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export type CreatePlanProps = {
  price: number;
  currency: Currency;
  /**
   * Number of period units, not a number of days.
   * For example, WEEK/2 means two weeks (14 days), while MONTH/2 means two calendar months.
   */
  periodCount: number;
  periodUnit: PeriodUnit;
};

export type RestorePlanProps = CreatePlanProps & {
  id: number;
};

type PlanProps<TId extends number | null> = CreatePlanProps & {
  id: TId;
};

export class Plan<TId extends number | null> {
  readonly id: TId;
  readonly price: number;
  readonly currency: Currency;
  readonly periodCount: number;
  readonly periodUnit: PeriodUnit;

  private constructor(props: PlanProps<TId>) {
    this.id = props.id;
    this.price = props.price;
    this.currency = props.currency;
    this.periodCount = props.periodCount;
    this.periodUnit = props.periodUnit;
  }

  static create(props: CreatePlanProps): NewPlan {
    Plan.assertPrice(props.price);
    Plan.assertCurrency(props.currency);
    Plan.assertPeriod(props.periodUnit, props.periodCount);

    return new Plan({ ...props, id: null });
  }

  static restore(props: RestorePlanProps): PersistedPlan {
    Plan.assertId(props.id);
    Plan.assertPrice(props.price);
    Plan.assertCurrency(props.currency);
    Plan.assertPeriod(props.periodUnit, props.periodCount);

    return new Plan(props);
  }

  private static assertId(id: number): void {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      throw new InvalidPlanIdError(id);
    }
  }

  private static assertPrice(price: number): void {
    if (typeof price !== 'number' || !Number.isSafeInteger(price) || price <= 0) {
      throw new InvalidPlanPriceError(price);
    }
  }

  private static assertCurrency(currency: Currency): void {
    if (!Object.values(Currency).includes(currency)) {
      throw new InvalidPlanCurrencyError(currency);
    }
  }

  private static assertPeriod(periodUnit: PeriodUnit, periodCount: number): void {
    if (
      !Object.values(PeriodUnit).includes(periodUnit) ||
      !Number.isSafeInteger(periodCount) ||
      periodCount <= 0
    ) {
      throw new InvalidPlanPeriodError(periodUnit, periodCount);
    }
  }
}

export type NewPlan = Plan<null>;
export type PersistedPlan = Plan<number>;
