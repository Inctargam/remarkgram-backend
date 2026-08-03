import type { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { ConfigType } from '@nestjs/config';
import type { filesConfig } from '../../config/files.config.js';
import { S3ObjectStorage } from './s3-object-storage.js';

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

describe('S3ObjectStorage', () => {
  const s3Client = {} as S3Client;
  const objectStorage = new S3ObjectStorage(s3Client, { s3: { bucket: 'images-bucket' } } as ConfigType<
    typeof filesConfig
  >);

  beforeEach(() => {
    vi.mocked(createPresignedPost).mockReset();
  });

  it('creates a constrained presigned upload and returns its policy expiration', async () => {
    const fields = {
      key: 'user/42/images/image-id',
      Policy: Buffer.from(JSON.stringify({ expiration: '2030-01-01T00:00:00Z' })).toString('base64'),
    };
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://images-bucket.storage.example.com',
      fields,
    });

    const result = await objectStorage.createPresignedUpload({
      objectKey: 'user/42/images/image-id',
      contentType: 'image/jpeg',
      size: 1_024,
      expiresInSeconds: 300,
    });

    expect(createPresignedPost).toHaveBeenCalledWith(s3Client, {
      Bucket: 'images-bucket',
      Key: 'user/42/images/image-id',
      Expires: 300,
      Fields: {
        'Content-Type': 'image/jpeg',
      },
      Conditions: [['content-length-range', 1_024, 1_024]],
    });
    expect(result).toEqual({
      url: 'https://images-bucket.storage.example.com',
      fields,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    });
  });
});
