import type { FilesRepository } from '../../ports/files.repository.js';
import type { ObjectStorage } from '../../ports/object-storage.js';
import {
  CleanupExpiredImageUploadsCommand,
  CleanupExpiredImageUploadsUseCase,
} from './cleanup-expired-image-uploads.use-case.js';

describe('CleanupExpiredImageUploadsUseCase', () => {
  const firstUpload = {
    id: '11111111-1111-4111-8111-111111111111',
    objectKey: 'users/42/images/first',
  };
  const secondUpload = {
    id: '22222222-2222-4222-8222-222222222222',
    objectKey: 'users/42/images/second',
  };
  const filesRepository = {
    claimExpiredImageUploads: vi.fn<FilesRepository['claimExpiredImageUploads']>(),
    deleteClaimedImageUpload: vi.fn<FilesRepository['deleteClaimedImageUpload']>(),
  };
  const objectStorage = {
    deleteObject: vi.fn<ObjectStorage['deleteObject']>(),
  };
  const useCase = new CleanupExpiredImageUploadsUseCase(
    filesRepository as unknown as FilesRepository,
    objectStorage as unknown as ObjectStorage,
  );
  const startedAt = new Date('2030-01-01T01:00:00Z');

  beforeEach(() => {
    filesRepository.claimExpiredImageUploads.mockReset();
    filesRepository.claimExpiredImageUploads.mockResolvedValue([firstUpload, secondUpload]);
    filesRepository.deleteClaimedImageUpload.mockReset();
    filesRepository.deleteClaimedImageUpload.mockResolvedValue(true);
    objectStorage.deleteObject.mockReset();
    objectStorage.deleteObject.mockResolvedValue();
  });

  it('claims expired pending, rejected and abandoned completed uploads and removes them', async () => {
    await expect(useCase.execute(new CleanupExpiredImageUploadsCommand(startedAt))).resolves.toBeUndefined();
    expect(filesRepository.claimExpiredImageUploads).toHaveBeenCalledWith({
      pendingExpiredBefore: new Date('2030-01-01T00:45:00Z'),
      rejectedBefore: new Date('2030-01-01T00:45:00Z'),
      completedBefore: new Date('2029-12-31T01:00:00Z'),
      retryBefore: new Date('2030-01-01T00:00:00Z'),
      claimedAt: startedAt,
      limit: 100,
    });
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(firstUpload.objectKey);
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(secondUpload.objectKey);
    expect(filesRepository.deleteClaimedImageUpload).toHaveBeenCalledWith({
      uploadId: firstUpload.id,
      claimedAt: startedAt,
    });
    expect(filesRepository.deleteClaimedImageUpload).toHaveBeenCalledWith({
      uploadId: secondUpload.id,
      claimedAt: startedAt,
    });
  });

  it('does nothing when no expired uploads can be claimed', async () => {
    filesRepository.claimExpiredImageUploads.mockResolvedValue([]);

    await expect(useCase.execute(new CleanupExpiredImageUploadsCommand(startedAt))).resolves.toBeUndefined();
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(filesRepository.deleteClaimedImageUpload).not.toHaveBeenCalled();
  });

  it('propagates an S3 deletion error', async () => {
    const storageError = new Error('S3 is unavailable');
    filesRepository.claimExpiredImageUploads.mockResolvedValue([firstUpload]);
    objectStorage.deleteObject.mockRejectedValueOnce(storageError);

    await expect(useCase.execute(new CleanupExpiredImageUploadsCommand(startedAt))).rejects.toBe(
      storageError,
    );
    expect(filesRepository.deleteClaimedImageUpload).not.toHaveBeenCalledWith({
      uploadId: firstUpload.id,
      claimedAt: startedAt,
    });
  });

  it('keeps the record for retry when its cleanup claim is no longer owned', async () => {
    filesRepository.claimExpiredImageUploads.mockResolvedValue([firstUpload]);
    filesRepository.deleteClaimedImageUpload.mockResolvedValue(false);

    await expect(useCase.execute(new CleanupExpiredImageUploadsCommand(startedAt))).rejects.toThrow(
      'Image upload cleanup claim is no longer owned by this job',
    );
  });
});
