import { describe, expect, it, vi } from 'vitest';
import { GetPlansQueryHandler } from './get-plans.query-handler.js';

describe(GetPlansQueryHandler.name, () => {
  it('returns the public plans from the query repository', async () => {
    const plans = [{ id: 1, price: 999, currency: 'USD', periodCount: 1, periodUnit: 'MONTH' }];
    const findAll = vi.fn().mockResolvedValue(plans);
    const handler = new GetPlansQueryHandler({ findAll });

    await expect(handler.execute()).resolves.toEqual(plans);
    expect(findAll).toHaveBeenCalledOnce();
  });
});
