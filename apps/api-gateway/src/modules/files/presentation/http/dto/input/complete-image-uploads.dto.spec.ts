import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteImageUploadsDto } from './complete-image-uploads.dto.js';

const createDto = (uploadIds: unknown) =>
  plainToInstance(CompleteImageUploadsDto, {
    uploadIds,
  });

describe('CompleteImageUploadsDto', () => {
  it('accepts an array of upload UUIDs', async () => {
    expect(await validate(createDto(['11111111-1111-4111-8111-111111111111']))).toHaveLength(0);
  });

  it('leaves upload count validation to the use case', async () => {
    expect(await validate(createDto([]))).toHaveLength(0);
  });

  it.each([['not-an-array'], [['not-a-uuid']], [['11111111-1111-1111-8111-111111111111']]])(
    'rejects invalid upload IDs: %j',
    async (uploadIds) => {
      expect(await validate(createDto(uploadIds))).not.toHaveLength(0);
    },
  );
});
