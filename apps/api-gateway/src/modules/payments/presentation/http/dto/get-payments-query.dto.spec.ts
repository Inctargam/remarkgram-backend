import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { GetPaymentsQueryDto, MAX_PAYMENTS_PAGE_NUMBER } from './get-payments-query.dto.js';

describe(GetPaymentsQueryDto.name, () => {
  it('applies the documented pagination defaults', async () => {
    const query = plainToInstance(GetPaymentsQueryDto, {});
    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({ pageNumber: 1, pageSize: 10 });
  });

  it.each([
    [{ pageNumber: 0, pageSize: 10 }],
    [{ pageNumber: 1.5, pageSize: 10 }],
    [{ pageNumber: MAX_PAYMENTS_PAGE_NUMBER + 1, pageSize: 100 }],
    [{ pageNumber: 1, pageSize: 0 }],
    [{ pageNumber: 1, pageSize: 101 }],
  ])('rejects unsupported pagination values: %j', async (input) => {
    const errors = await validate(plainToInstance(GetPaymentsQueryDto, input));
    expect(errors.length).toBeGreaterThan(0);
  });
});
