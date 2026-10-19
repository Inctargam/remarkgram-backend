import { FilesErrorCode, type FilesServiceClient } from '@app/files-grpc';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, type ServiceError, status } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import {
  FilesServiceUnavailableError,
  PostImageNotFoundError,
  PostImagesNotAvailableError,
} from '../../application/errors/create-post.errors.js';
import { GrpcFilesGateway } from './grpc-files.gateway.js';

const createServiceError = (code: status, appCode?: FilesErrorCode): ServiceError => {
  const metadata = new Metadata();
  if (appCode) metadata.set(APP_ERROR_CODE_METADATA_KEY, appCode);
  return Object.assign(new Error('Files request failed'), {
    code,
    details: 'Files request failed',
    metadata,
  });
};

describe.each(['attachPostImages', 'cancelPostImageAttachment'] as const)('GrpcFilesGateway.%s', (method) => {
  const client = {
    attachPostImages: vi.fn<FilesServiceClient['attachPostImages']>(),
    cancelPostImageAttachment: vi.fn<FilesServiceClient['cancelPostImageAttachment']>(),
  };
  const gateway = new GrpcFilesGateway({ getService: () => client } as unknown as ClientGrpc);
  const params = {
    userId: 42,
    fileIds: ['11111111-1111-4111-8111-111111111111'],
    operationId: '22222222-2222-4222-8222-222222222222',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    gateway.onModuleInit();
  });

  it('forwards the full operation input', async () => {
    client[method].mockReturnValue(of({}));
    await expect(gateway[method](params)).resolves.toBeUndefined();
    expect(client[method]).toHaveBeenCalledExactlyOnceWith({ ...params, userId: '42' });
  });

  it.each([
    [status.NOT_FOUND, FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND, PostImageNotFoundError],
    [status.FAILED_PRECONDITION, FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT, PostImagesNotAvailableError],
    [status.ALREADY_EXISTS, FilesErrorCode.POST_IMAGE_ATTACHMENT_CONFLICT, PostImagesNotAvailableError],
    [status.UNAVAILABLE, undefined, FilesServiceUnavailableError],
    [status.DEADLINE_EXCEEDED, undefined, FilesServiceUnavailableError],
  ] as const)('maps %s/%s', async (code, appCode, ErrorType) => {
    client[method].mockReturnValue(throwError(() => createServiceError(code, appCode)));
    await expect(gateway[method](params)).rejects.toBeInstanceOf(ErrorType);
    expect(client[method]).toHaveBeenCalledTimes(1);
  });

  it.each([createServiceError(status.NOT_FOUND), new Error('Unexpected failure')])(
    'preserves an unknown error',
    async (error) => {
      client[method].mockReturnValue(throwError(() => error));
      await expect(gateway[method](params)).rejects.toBe(error);
    },
  );
});
