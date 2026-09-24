import { FilesErrorCode, type FilesServiceClient } from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, type ServiceError, status } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { GrpcImageUploadsGateway } from './grpc-image-uploads.gateway.js';

const createServiceError = (grpcStatus: status, filesErrorCode?: FilesErrorCode): ServiceError => {
  const metadata = new Metadata();

  if (filesErrorCode !== undefined) {
    metadata.set(APP_ERROR_CODE_METADATA_KEY, filesErrorCode);
  }

  return Object.assign(new Error('Files request failed'), {
    code: grpcStatus,
    details: 'Files request failed',
    metadata,
  });
};

describe('GrpcImageUploadsGateway', () => {
  const reserveImageUploads = vi.fn<FilesServiceClient['reserveImageUploads']>();
  const attachReservedImageUploads = vi.fn<FilesServiceClient['attachReservedImageUploads']>();
  const releaseReservedImageUploads = vi.fn<FilesServiceClient['releaseReservedImageUploads']>();
  const grpcClient = {
    getService: vi.fn(() => ({
      attachReservedImageUploads,
      releaseReservedImageUploads,
      reserveImageUploads,
    })),
  };
  const gateway = new GrpcImageUploadsGateway(grpcClient as unknown as ClientGrpc);
  const reservationId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    reserveImageUploads.mockReset();
    attachReservedImageUploads.mockReset();
    releaseReservedImageUploads.mockReset();
    grpcClient.getService.mockClear();
    gateway.onModuleInit();
  });

  it('forwards attachment of reserved image uploads', async () => {
    attachReservedImageUploads.mockReturnValue(of({}));

    await expect(gateway.attachReservedImageUploads({ userId: 42, reservationId })).resolves.toBeUndefined();

    expect(attachReservedImageUploads).toHaveBeenCalledWith({ userId: '42', reservationId });
  });

  it('forwards an image upload reservation', async () => {
    reserveImageUploads.mockReturnValue(of({}));

    await expect(
      gateway.reserveImageUploads({
        userId: 42,
        imageIds: ['11111111-1111-4111-8111-111111111111'],
        reservationId,
      }),
    ).resolves.toBeUndefined();

    expect(reserveImageUploads).toHaveBeenCalledWith({
      userId: '42',
      uploadIds: ['11111111-1111-4111-8111-111111111111'],
      reservationId,
    });
  });

  it('forwards release of reserved image uploads', async () => {
    releaseReservedImageUploads.mockReturnValue(of({}));

    await expect(gateway.releaseReservedImageUploads({ userId: 42, reservationId })).resolves.toBeUndefined();

    expect(releaseReservedImageUploads).toHaveBeenCalledWith({ userId: '42', reservationId });
  });

  it.each([
    [status.NOT_FOUND, FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND, PostImageNotFoundError],
    [status.FAILED_PRECONDITION, FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT, PostImagesNotAvailableError],
  ] as const)(
    'maps Files error %s/%s to a Posts application error',
    async (grpcStatus, filesErrorCode, ErrorType) => {
      reserveImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus, filesErrorCode)));
      attachReservedImageUploads.mockReturnValue(
        throwError(() => createServiceError(grpcStatus, filesErrorCode)),
      );
      releaseReservedImageUploads.mockReturnValue(
        throwError(() => createServiceError(grpcStatus, filesErrorCode)),
      );

      await expect(
        gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId }),
      ).rejects.toBeInstanceOf(ErrorType);
      await expect(gateway.attachReservedImageUploads({ userId: 42, reservationId })).rejects.toBeInstanceOf(
        ErrorType,
      );
      await expect(gateway.releaseReservedImageUploads({ userId: 42, reservationId })).rejects.toBeInstanceOf(
        ErrorType,
      );
    },
  );

  it('does not present an internal reservation conflict as a client idempotency conflict', async () => {
    const error = createServiceError(status.ALREADY_EXISTS, FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT);
    reserveImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId }),
    ).rejects.toBe(error);
  });

  it.each([status.UNAVAILABLE, status.DEADLINE_EXCEEDED])(
    'maps transport status %s to service unavailable',
    async (grpcStatus) => {
      reserveImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus)));
      attachReservedImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus)));
      releaseReservedImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus)));

      await expect(
        gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId }),
      ).rejects.toBeInstanceOf(ImageUploadsServiceUnavailableError);
      await expect(gateway.attachReservedImageUploads({ userId: 42, reservationId })).rejects.toBeInstanceOf(
        ImageUploadsServiceUnavailableError,
      );
      await expect(gateway.releaseReservedImageUploads({ userId: 42, reservationId })).rejects.toBeInstanceOf(
        ImageUploadsServiceUnavailableError,
      );
    },
  );

  it('does not infer an application error from a gRPC status alone', async () => {
    const error = createServiceError(status.NOT_FOUND);
    reserveImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId }),
    ).rejects.toBe(error);
  });

  it('does not hide an unexpected error', async () => {
    const error = new Error('Unexpected failure');
    reserveImageUploads.mockReturnValue(throwError(() => error));
    attachReservedImageUploads.mockReturnValue(throwError(() => error));
    releaseReservedImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId }),
    ).rejects.toBe(error);
    await expect(gateway.attachReservedImageUploads({ userId: 42, reservationId })).rejects.toBe(error);
    await expect(gateway.releaseReservedImageUploads({ userId: 42, reservationId })).rejects.toBe(error);
  });
});
