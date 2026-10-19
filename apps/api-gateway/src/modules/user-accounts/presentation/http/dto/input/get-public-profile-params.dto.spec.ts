import { describe, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { GetPublicProfileParamsDto } from './get-public-profile-params.dto.js';
import { validate, ValidationError } from 'class-validator';
import { randomUUID } from 'node:crypto';

describe('GetPublicProfileParamsDto()', () => {
  it('fail if userId is empty', async () => {
    const plain = plainToInstance(GetPublicProfileParamsDto, { userId: undefined });

    const errors = await validate(plain);
    expect(errors[0]).toBeInstanceOf(ValidationError);
    expect(errors[0].property).toBe('userId');
  });

  it('fail if userId is not to be number', async () => {
    const plain = plainToInstance(GetPublicProfileParamsDto, { userId: randomUUID() });

    const errors = await validate(plain);
    expect(errors[0]).toBeInstanceOf(ValidationError);
    expect(errors[0].property).toBe('userId');
  });

  it('should be convert string to be number', async () => {
    const plain = plainToInstance(GetPublicProfileParamsDto, { userId: '1' });
    const errors = await validate(plain);
    console.log('errors', errors);
    expect(errors.length).toBe(0);
  });
});
