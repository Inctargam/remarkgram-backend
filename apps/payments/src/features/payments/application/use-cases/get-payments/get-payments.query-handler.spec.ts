import { describe, expect, it, vi } from 'vitest';
import type { PaymentsQueryRepository } from '../../ports/payments.query-repository.js';
import { GetPaymentsQuery, GetPaymentsQueryHandler } from './get-payments.query-handler.js';

describe(GetPaymentsQueryHandler.name, () => {
  it('adds page metadata to the ownership-scoped repository result', async () => {
    const findUserPaymentsPage = vi.fn().mockResolvedValue({ items: [], totalCount: 21 });
    const handler = new GetPaymentsQueryHandler({
      findUserPaymentsPage,
    } as unknown as PaymentsQueryRepository);

    await expect(handler.execute(new GetPaymentsQuery(42, 2, 10))).resolves.toEqual({
      items: [],
      pageNumber: 2,
      pageSize: 10,
      totalCount: 21,
      pagesCount: 3,
    });
    expect(findUserPaymentsPage).toHaveBeenCalledWith({ userId: 42, pageNumber: 2, pageSize: 10 });
  });

  it('returns zero pages for an empty history', async () => {
    const handler = new GetPaymentsQueryHandler({
      findUserPaymentsPage: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    } as unknown as PaymentsQueryRepository);
    await expect(handler.execute(new GetPaymentsQuery(42, 1, 10))).resolves.toMatchObject({ pagesCount: 0 });
  });
});
