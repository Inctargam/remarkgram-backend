import { UpdatePostDto } from './update-post.dto.js';
import { plainToInstance } from 'class-transformer';
import { expect } from 'vitest';
import { validate } from 'class-validator';
import { MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';

describe('UpdatePostDto', () => {
  it('should be defined', async () => {
    const dto = plainToInstance(UpdatePostDto, {
      description: 'A update the post',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('invalid description, should be return error', async () => {
    const dto = plainToInstance(UpdatePostDto, {
      description: 'a'.repeat(MAX_POST_DESCRIPTION_LENGTH + 1),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('description');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });
});
