import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCheckoutDto } from './create-checkout.dto.js';

describe(CreateCheckoutDto.name, () => {
  it('accepts the supported checkout transport shape', async () => {
    const dto = plainToInstance(CreateCheckoutDto, {
      planId: 1,
      provider: 'STRIPE',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a plan ID outside the gRPC int32 range', async () => {
    const dto = plainToInstance(CreateCheckoutDto, {
      planId: 2_147_483_648,
      provider: 'STRIPE',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
