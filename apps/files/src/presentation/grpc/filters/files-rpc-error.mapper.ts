import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { FILES_APP_ERROR_CODE_METADATA_KEY } from '@app/files-grpc';
import { type FilesError, FilesErrorCode } from '../../../application/errors/files.error.js';

const GRPC_STATUS_BY_APP_ERROR_CODE = {
  [FilesErrorCode.INVALID_USER_ID]: status.INVALID_ARGUMENT,
  [FilesErrorCode.INVALID_IMAGE_COUNT]: status.INVALID_ARGUMENT,
  [FilesErrorCode.INVALID_IMAGE_SIZE]: status.INVALID_ARGUMENT,
  [FilesErrorCode.DUPLICATE_CLIENT_FILE_ID]: status.INVALID_ARGUMENT,
  [FilesErrorCode.DUPLICATE_IMAGE_UPLOAD_ID]: status.INVALID_ARGUMENT,
  [FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND]: status.NOT_FOUND,
  [FilesErrorCode.INVALID_IMAGE_UPLOAD_STATUS]: status.FAILED_PRECONDITION,
  [FilesErrorCode.IMAGE_UPLOAD_METADATA_MISMATCH]: status.FAILED_PRECONDITION,
  [FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE]: status.INVALID_ARGUMENT,
} satisfies Record<FilesErrorCode, status>;

export const mapFilesErrorToRpcException = (error: FilesError): RpcException => {
  const appErrorCode = error.code;
  const grpcStatus = GRPC_STATUS_BY_APP_ERROR_CODE[appErrorCode];

  const metadata = new Metadata();
  metadata.set(FILES_APP_ERROR_CODE_METADATA_KEY, appErrorCode);

  return new RpcException({
    code: grpcStatus,
    message: error.message,
    metadata,
  });
};
