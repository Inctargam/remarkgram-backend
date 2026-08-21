import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { ConfigType } from '@nestjs/config';
import type { filesConfig } from '../../config/files.config.js';
import { S3ObjectStorage } from './s3-object-storage.js';

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

describe('S3ObjectStorage', () => {
  const send = vi.fn<(command: unknown) => Promise<unknown>>();
  const s3Client = {
    send,
  } as unknown as S3Client;
  const objectStorage = new S3ObjectStorage(s3Client, { s3: { bucket: 'images-bucket' } } as ConfigType<
    typeof filesConfig
  >);

  beforeEach(() => {
    vi.mocked(createPresignedPost).mockReset();
    send.mockReset();
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

  it('gets object metadata without downloading its body', async () => {
    send.mockResolvedValue({
      ContentLength: 1_024,
      ContentType: 'image/jpeg',
      $metadata: {},
    });

    await expect(objectStorage.getObjectMetadata('user/42/images/image-id')).resolves.toEqual({
      size: 1_024,
      contentType: 'image/jpeg',
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect((command as HeadObjectCommand).input).toEqual({
      Bucket: 'images-bucket',
      Key: 'user/42/images/image-id',
    });
  });

  it('returns null when the object does not exist', async () => {
    send.mockRejectedValue(
      new S3ServiceException({
        name: 'NotFound',
        message: 'Not Found',
        $fault: 'client',
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await expect(objectStorage.getObjectMetadata('missing-object')).resolves.toBeNull();
  });

  it('propagates storage errors other than not found', async () => {
    const error = new S3ServiceException({
      name: 'InternalError',
      message: 'Storage is unavailable',
      $fault: 'server',
      $metadata: { httpStatusCode: 500 },
    });
    send.mockRejectedValue(error);

    await expect(objectStorage.getObjectMetadata('object-key')).rejects.toBe(error);
  });

  it('deletes an object from the configured bucket', async () => {
    send.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });

    await objectStorage.deleteObject('users/42/images/image-id');

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({
      Bucket: 'images-bucket',
      Key: 'users/42/images/image-id',
    });
  });

  it('propagates object deletion errors so the worker can retry', async () => {
    const error = new Error('S3 unavailable');
    send.mockRejectedValue(error);

    await expect(objectStorage.deleteObject('object-key')).rejects.toBe(error);
  });
});
