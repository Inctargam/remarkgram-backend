import { Metadata, type CallOptions, status } from '@grpc/grpc-js';
import {
  FilesErrorCode,
  type EnsureCompletedImageUploadsRequest,
  type EnsureCompletedImageUploadsResponse,
} from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { of, throwError, type Observable } from 'rxjs';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotCompletedError,
  PostImageNotFoundError,
} from '../../application/errors/create-post.errors.js';
import { FilesImageUploadsVerifier } from './files-image-uploads-verifier.js';

type EnsureCompletedImageUploadsCall = (
  request: EnsureCompletedImageUploadsRequest,
  options?: CallOptions,
) => Observable<EnsureCompletedImageUploadsResponse>;

const createServiceError = (grpcStatus: status, filesErrorCode?: FilesErrorCode): Error => {
  const metadata = new Metadata();

  if (filesErrorCode !== undefined) {
    metadata.set(APP_ERROR_CODE_METADATA_KEY, filesErrorCode);
  }

  return Object.assign(new Error('Files error'), {
    code: grpcStatus,
    details: 'Files error',
    metadata,
  });
};

describe('FilesImageUploadsVerifier', () => {
  const ensureCompletedImageUploads = vi.fn<EnsureCompletedImageUploadsCall>();
  const grpcClient = {
    getService: vi.fn(() => ({ ensureCompletedImageUploads })),
  };
  const verifier = new FilesImageUploadsVerifier(grpcClient as unknown as ClientGrpc);

  beforeEach(() => {
    ensureCompletedImageUploads.mockReset();
    grpcClient.getService.mockClear();
    verifier.onModuleInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards image verification to files', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    ensureCompletedImageUploads.mockReturnValue(of({}));

    await expect(
      verifier.ensureCompleted({
        userId: 42,
        imageIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).resolves.toBeUndefined();

    expect(ensureCompletedImageUploads).toHaveBeenCalledWith(
      {
        userId: '42',
        imageIds: ['11111111-1111-4111-8111-111111111111'],
      },
      {
        deadline: new Date('2030-01-01T00:00:05Z'),
      },
    );
  });

  it.each([
    [status.NOT_FOUND, FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND, PostImageNotFoundError],
    [status.FAILED_PRECONDITION, FilesErrorCode.IMAGE_UPLOADS_NOT_COMPLETED, PostImageNotCompletedError],
  ] as const)(
    'maps files error %s/%s to an application error',
    async (grpcStatus, filesErrorCode, ErrorType) => {
      ensureCompletedImageUploads.mockReturnValue(
        throwError(() => createServiceError(grpcStatus, filesErrorCode)),
      );

      await expect(
        verifier.ensureCompleted({
          userId: 42,
          imageIds: ['11111111-1111-4111-8111-111111111111'],
        }),
      ).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it.each([status.UNAVAILABLE, status.DEADLINE_EXCEEDED])(
    'maps transport status %s to service unavailable',
    async (grpcStatus) => {
      ensureCompletedImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus)));

      await expect(
        verifier.ensureCompleted({
          userId: 42,
          imageIds: ['11111111-1111-4111-8111-111111111111'],
        }),
      ).rejects.toBeInstanceOf(ImageUploadsServiceUnavailableError);
    },
  );

  it.each([
    [status.NOT_FOUND, undefined],
    [status.FAILED_PRECONDITION, FilesErrorCode.IMAGE_UPLOAD_METADATA_MISMATCH],
  ] as const)('does not guess an application error from status %s', async (grpcStatus, filesErrorCode) => {
    const error = createServiceError(grpcStatus, filesErrorCode);
    ensureCompletedImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      verifier.ensureCompleted({
        userId: 42,
        imageIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toBe(error);
  });

  it('does not hide an unexpected error', async () => {
    const error = new Error('Unexpected failure');
    ensureCompletedImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      verifier.ensureCompleted({
        userId: 42,
        imageIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toBe(error);
  });
});
