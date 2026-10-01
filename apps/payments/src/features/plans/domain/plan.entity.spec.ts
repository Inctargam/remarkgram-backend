import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  InvalidPlanCurrencyError,
  InvalidPlanIdError,
  InvalidPlanPeriodError,
  InvalidPlanPriceError,
} from '../application/errors/plan.errors.js';
import { Currency, PeriodUnit, Plan, type CreatePlanProps } from './plan.entity.js';

describe('Plan', () => {
  it.each([
    { periodUnit: PeriodUnit.DAY, periodCount: 1 },
    { periodUnit: PeriodUnit.DAY, periodCount: 7 },
    { periodUnit: PeriodUnit.WEEK, periodCount: 1 },
    { periodUnit: PeriodUnit.WEEK, periodCount: 2 },
    { periodUnit: PeriodUnit.MONTH, periodCount: 1 },
    { periodUnit: PeriodUnit.MONTH, periodCount: 2 },
  ])('creates a plan for $periodUnit/$periodCount', ({ periodUnit, periodCount }) => {
    const plan = Plan.create({
      price: 100,
      currency: Currency.USD,
      periodUnit,
      periodCount,
    });

    expect(plan).toEqual({
      id: null,
      price: 100,
      currency: Currency.USD,
      periodUnit,
      periodCount,
    });
    expectTypeOf(plan.id).toEqualTypeOf<null>();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid price %s',
    (price) => {
      expect(() =>
        Plan.create({
          price,
          currency: Currency.USD,
          periodUnit: PeriodUnit.DAY,
          periodCount: 1,
        }),
      ).toThrow(InvalidPlanPriceError);
    },
  );

  it.each([undefined, null, '', '100'])('rejects an empty or non-number price %j', (price) => {
    expect(() =>
      Plan.create({
        price: price as unknown as number,
        currency: Currency.USD,
        periodUnit: PeriodUnit.DAY,
        periodCount: 1,
      }),
    ).toThrow(InvalidPlanPriceError);
  });

  it('rejects an unsupported currency', () => {
    expect(() =>
      Plan.create({
        price: 100,
        currency: 'EUR' as Currency,
        periodUnit: PeriodUnit.DAY,
        periodCount: 1,
      }),
    ).toThrow(InvalidPlanCurrencyError);
  });

  it.each([
    { periodUnit: PeriodUnit.DAY, periodCount: 0 },
    { periodUnit: PeriodUnit.WEEK, periodCount: -1 },
    { periodUnit: PeriodUnit.MONTH, periodCount: 1.5 },
    { periodUnit: PeriodUnit.MONTH, periodCount: Number.NaN },
    { periodUnit: PeriodUnit.MONTH, periodCount: Number.MAX_SAFE_INTEGER + 1 },
    { periodUnit: 'YEAR' as PeriodUnit, periodCount: 1 },
  ])('rejects invalid period combination $periodUnit/$periodCount', ({ periodUnit, periodCount }) => {
    const props: CreatePlanProps = {
      price: 100,
      currency: Currency.USD,
      periodUnit,
      periodCount,
    };

    expect(() => Plan.create(props)).toThrow(InvalidPlanPeriodError);
  });

  describe('restore', () => {
    const validProps = {
      id: 1,
      price: 5000,
      currency: Currency.USD,
      periodUnit: PeriodUnit.WEEK,
      periodCount: 1,
    } as const;

    it('restores a persisted plan with a non-nullable id', () => {
      const plan = Plan.restore(validProps);

      expect(plan).toEqual(validProps);
      expectTypeOf(plan.id).toEqualTypeOf<number>();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid persisted id %s',
      (id) => {
        expect(() => Plan.restore({ ...validProps, id })).toThrow(InvalidPlanIdError);
      },
    );

    it.each([undefined, null, '', '1'])('rejects an empty or non-number persisted id %j', (id) => {
      expect(() => Plan.restore({ ...validProps, id: id as unknown as number })).toThrow(InvalidPlanIdError);
    });

    it('rejects a persisted plan with an invalid price', () => {
      expect(() => Plan.restore({ ...validProps, price: 0 })).toThrow(InvalidPlanPriceError);
    });

    it('rejects a persisted plan with an unsupported currency', () => {
      expect(() => Plan.restore({ ...validProps, currency: 'EUR' as Currency })).toThrow(
        InvalidPlanCurrencyError,
      );
    });

    it('rejects a persisted plan with an invalid period', () => {
      expect(() => Plan.restore({ ...validProps, periodCount: 0 })).toThrow(InvalidPlanPeriodError);
    });
  });
});
