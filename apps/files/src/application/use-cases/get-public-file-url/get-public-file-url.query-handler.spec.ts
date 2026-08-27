import type { ConfigType } from '@nestjs/config';
import {
  FileDownloadUrlGenerationError,
  FileNotFoundError,
} from '../../errors/get-public-file-url.errors.js';
import type { FilesRepository } from '../../ports/files.repository.js';
import type { ObjectStorage } from '../../ports/object-storage.js';
import type { filesConfig } from '../../../config/files.config.js';
import {
  GetFileDownloadUrlQuery,
  GetFileDownloadUrlQueryHandler,
} from './get-public-file-url.query-handler.js';

describe('GetFileDownloadUrlQueryHandler', () => {
  const storage = {
    createPresignedDownloadUrl: vi.fn<ObjectStorage['createPresignedDownloadUrl']>(),
  };
  const filesRepository = {
    findAvailableById: vi.fn<FilesRepository['findAvailableById']>(),
  };
  const config = {
    s3: { downloadUrlExpiresInSeconds: 300 },
  } as ConfigType<typeof filesConfig>;
  const handler = new GetFileDownloadUrlQueryHandler(
    storage as unknown as ObjectStorage,
    filesRepository as unknown as FilesRepository,
    config,
  );

  beforeEach(() => {
    storage.createPresignedDownloadUrl.mockReset();
    filesRepository.findAvailableById.mockReset();
  });

  it('returns a temporary signed URL for an available file', async () => {
    filesRepository.findAvailableById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 42,
      objectKey: 'users/42/images/image-id',
    });
    storage.createPresignedDownloadUrl.mockResolvedValue('https://storage.example.com/signed-object');

    await expect(
      handler.execute(new GetFileDownloadUrlQuery('11111111-1111-4111-8111-111111111111')),
    ).resolves.toEqual({ url: 'https://storage.example.com/signed-object' });
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
      objectKey: 'users/42/images/image-id',
      expiresInSeconds: 300,
    });
  });

  it('rejects a missing or unavailable file', async () => {
    filesRepository.findAvailableById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetFileDownloadUrlQuery('11111111-1111-4111-8111-111111111111')),
    ).rejects.toBeInstanceOf(FileNotFoundError);
    expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('maps signing failures to a files-domain error', async () => {
    filesRepository.findAvailableById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 42,
      objectKey: 'users/42/images/image-id',
    });
    storage.createPresignedDownloadUrl.mockRejectedValue(new Error('Signing failed'));

    await expect(
      handler.execute(new GetFileDownloadUrlQuery('11111111-1111-4111-8111-111111111111')),
    ).rejects.toBeInstanceOf(FileDownloadUrlGenerationError);
  });
});
