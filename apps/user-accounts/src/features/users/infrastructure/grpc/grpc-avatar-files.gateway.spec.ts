import {
  AvatarFilesUnavailableError,
  AvatarFileNotFoundError,
  AvatarFileStateConflictError,
  InvalidAvatarImageError,
} from '../../application/errors/avatar.errors.js';
import { Metadata, status } from '@grpc/grpc-js';
import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { FilesErrorCode } from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { GrpcAvatarFilesGateway } from './grpc-avatar-files.gateway.js';
import { UserAccountsErrorCode as Code } from '../../../../common/application/errors/user-accounts.error.js';

describe('GrpcAvatarFilesGateway', () => {
  const client = {
    attachAvatarUpload: vi.fn(),
  };
  const gateway = new GrpcAvatarFilesGateway({ getService: () => client } as unknown as ClientGrpc);
  const params = {
    userId: 42,
    fileId: '11111111-1111-4111-8111-111111111111',
    operationId: '22222222-2222-4222-8222-222222222222',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    for (const method of Object.values(client)) method.mockReturnValue(of({}));
    gateway.onModuleInit();
  });

  it('forwards avatar attachment to Files', async () => {
    await gateway.attachAvatarUpload(params);
    expect(client.attachAvatarUpload).toHaveBeenCalledWith({ ...params, userId: '42' });
  });

  it.each([
    {
      grpcCode: status.UNAVAILABLE,
      fileCode: '',
      ErrorType: AvatarFilesUnavailableError,
      code: Code.AVATAR_FILES_UNAVAILABLE,
    },
    {
      grpcCode: status.DEADLINE_EXCEEDED,
      fileCode: '',
      ErrorType: AvatarFilesUnavailableError,
      code: Code.AVATAR_FILES_UNAVAILABLE,
    },
    {
      grpcCode: status.NOT_FOUND,
      fileCode: FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND,
      ErrorType: AvatarFileNotFoundError,
      code: Code.AVATAR_FILE_NOT_FOUND,
    },
    {
      grpcCode: status.FAILED_PRECONDITION,
      fileCode: FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT,
      ErrorType: AvatarFileStateConflictError,
      code: Code.AVATAR_FILE_STATE_CONFLICT,
    },
    {
      grpcCode: status.ALREADY_EXISTS,
      fileCode: FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT,
      ErrorType: AvatarFileStateConflictError,
      code: Code.AVATAR_FILE_STATE_CONFLICT,
    },
    {
      grpcCode: status.INVALID_ARGUMENT,
      fileCode: FilesErrorCode.INVALID_IMAGE_SIZE,
      ErrorType: InvalidAvatarImageError,
      code: Code.INVALID_AVATAR_IMAGE,
    },
    {
      grpcCode: status.INVALID_ARGUMENT,
      fileCode: FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE,
      ErrorType: InvalidAvatarImageError,
      code: Code.INVALID_AVATAR_IMAGE,
    },
  ])('maps $fileCode / $grpcCode to $code', async ({ grpcCode, fileCode, code, ErrorType }) => {
    const metadata = new Metadata();
    metadata.set(APP_ERROR_CODE_METADATA_KEY, fileCode);
    const error = Object.assign(new Error('Files error'), { code: grpcCode, metadata });
    client.attachAvatarUpload.mockReturnValueOnce(throwError(() => error));

    const attach = gateway.attachAvatarUpload(params);
    await expect(attach).rejects.toBeInstanceOf(ErrorType);
    await expect(attach).rejects.toMatchObject({ code });
  });

  it.each([
    { grpcCode: status.RESOURCE_EXHAUSTED, fileCode: '' },
    { grpcCode: status.ABORTED, fileCode: '' },
    { grpcCode: status.INTERNAL, fileCode: FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND },
    { grpcCode: status.INTERNAL, fileCode: FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT },
    { grpcCode: status.INTERNAL, fileCode: FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT },
    { grpcCode: status.INTERNAL, fileCode: FilesErrorCode.INVALID_IMAGE_SIZE },
    { grpcCode: status.INTERNAL, fileCode: FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE },
    { grpcCode: status.NOT_FOUND, fileCode: 'UNKNOWN_FILE_ERROR' },
  ])('preserves unmapped $grpcCode / $fileCode errors', async ({ grpcCode, fileCode }) => {
    const metadata = new Metadata();
    metadata.set(APP_ERROR_CODE_METADATA_KEY, fileCode);
    const error = Object.assign(new Error('Files error'), { code: grpcCode, metadata });
    client.attachAvatarUpload.mockReturnValueOnce(throwError(() => error));

    await expect(gateway.attachAvatarUpload(params)).rejects.toBe(error);
  });

  it.each([
    { code: status.UNAVAILABLE },
    { code: status.UNAVAILABLE, metadata: {} },
    { code: String(status.UNAVAILABLE), metadata: new Metadata() },
  ])('preserves errors that do not match the gRPC error shape: %j', async (properties) => {
    const error = Object.assign(new Error('Not a ServiceError'), properties);
    client.attachAvatarUpload.mockReturnValueOnce(throwError(() => error));

    await expect(gateway.attachAvatarUpload(params)).rejects.toBe(error);
  });

  it('preserves unexpected errors so the saga does not compensate blindly', async () => {
    const error = new Error('unexpected');
    client.attachAvatarUpload.mockReturnValueOnce(throwError(() => error));
    await expect(gateway.attachAvatarUpload(params)).rejects.toBe(error);
  });
});
