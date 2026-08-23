import {
  type AttachReservedImageUploadsRequest,
  type AttachReservedImageUploadsResponse,
  FilesErrorCode,
  type ReleaseReservedImageUploadsRequest,
  type ReleaseReservedImageUploadsResponse,
  type ReserveImageUploadsRequest,
  type ReserveImageUploadsResponse,
} from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, type CallOptions, type ServiceError, status } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { of, throwError, type Observable } from 'rxjs';
import {
  ImageUploadsServiceUnavailableError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { GrpcImageUploadsGateway } from './grpc-image-uploads.gateway.js';

type UnaryCall<Request, Response> = (request: Request, options?: CallOptions) => Observable<Response>;

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
  const reserveImageUploads = vi.fn<UnaryCall<ReserveImageUploadsRequest, ReserveImageUploadsResponse>>();
  const attachReservedImageUploads =
    vi.fn<UnaryCall<AttachReservedImageUploadsRequest, AttachReservedImageUploadsResponse>>();
  const releaseReservedImageUploads =
    vi.fn<UnaryCall<ReleaseReservedImageUploadsRequest, ReleaseReservedImageUploadsResponse>>();
  const grpcClient = {
    getService: vi.fn(() => ({
      attachReservedImageUploads,
      releaseReservedImageUploads,
      reserveImageUploads,
    })),
  };
  const gateway = new GrpcImageUploadsGateway(grpcClient as unknown as ClientGrpc);
  const reservationId = '22222222-2222-4222-8222-222222222222';
  const operationId = '33333333-3333-4333-8333-333333333333';
  const deadline = new Date('2030-01-01T00:00:05.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    reserveImageUploads.mockReset();
    attachReservedImageUploads.mockReset();
    releaseReservedImageUploads.mockReset();
    grpcClient.getService.mockClear();
    gateway.onModuleInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards attachment of reserved image uploads with a deadline', async () => {
    attachReservedImageUploads.mockReturnValue(of({}));

    await expect(
      gateway.attachReservedImageUploads({ userId: 42, reservationId, operationId }),
    ).resolves.toBeUndefined();

    expect(attachReservedImageUploads).toHaveBeenCalledWith(
      { userId: '42', reservationId, operationId },
      { deadline },
    );
  });

  it('forwards an image upload reservation with a deadline', async () => {
    reserveImageUploads.mockReturnValue(of({}));

    await expect(
      gateway.reserveImageUploads({
        userId: 42,
        imageIds: ['11111111-1111-4111-8111-111111111111'],
        reservationId,
        operationId,
      }),
    ).resolves.toBeUndefined();

    expect(reserveImageUploads).toHaveBeenCalledWith(
      {
        userId: '42',
        uploadIds: ['11111111-1111-4111-8111-111111111111'],
        reservationId,
        operationId,
      },
      { deadline },
    );
  });

  it('forwards release of reserved image uploads with a deadline', async () => {
    releaseReservedImageUploads.mockReturnValue(of({}));

    await expect(
      gateway.releaseReservedImageUploads({ userId: 42, reservationId, operationId }),
    ).resolves.toBeUndefined();

    expect(releaseReservedImageUploads).toHaveBeenCalledWith(
      { userId: '42', reservationId, operationId },
      { deadline },
    );
  });

  it.each([
    [status.NOT_FOUND, FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND, PostImageNotFoundError],
    [status.FAILED_PRECONDITION, FilesErrorCode.IMAGE_UPLOADS_NOT_AVAILABLE, PostImagesNotAvailableError],
    [status.ALREADY_EXISTS, FilesErrorCode.IMAGE_UPLOAD_OPERATION_CONFLICT, PostImagesNotAvailableError],
  ] as const)(
    'maps Files error %s/%s to a Posts application error',
    async (grpcStatus, filesErrorCode, ErrorType) => {
      reserveImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus, filesErrorCode)));

      await expect(
        gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId, operationId }),
      ).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it.each([status.UNAVAILABLE, status.DEADLINE_EXCEEDED])(
    'maps transport status %s to service unavailable',
    async (grpcStatus) => {
      reserveImageUploads.mockReturnValue(throwError(() => createServiceError(grpcStatus)));

      await expect(
        gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId, operationId }),
      ).rejects.toBeInstanceOf(ImageUploadsServiceUnavailableError);
    },
  );

  it('does not infer an application error from a gRPC status alone', async () => {
    const error = createServiceError(status.NOT_FOUND);
    reserveImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId, operationId }),
    ).rejects.toBe(error);
  });

  it('does not hide an unexpected error', async () => {
    const error = new Error('Unexpected failure');
    reserveImageUploads.mockReturnValue(throwError(() => error));

    await expect(
      gateway.reserveImageUploads({ userId: 42, imageIds: ['image-id'], reservationId, operationId }),
    ).rejects.toBe(error);
  });
});
