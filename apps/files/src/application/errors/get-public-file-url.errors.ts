import { FilesError } from './files.error.js';
import { FilesErrorCode } from '@app/files-grpc';

export class FileNotFoundError extends FilesError {
  readonly code = FilesErrorCode.FILE_NOT_FOUND;
  constructor() {
    super(`File  not found`);
  }
}

export class FileUploadNotCompletedError extends FilesError {
  readonly code = FilesErrorCode.FILE_UPLOAD_NOT_COMPLETED;
  constructor() {
    super(`File upload not completed`);
  }
}

export class FileDeletedError extends FilesError {
  readonly code = FilesErrorCode.FILE_DELETED;
  constructor() {
    super(`File already deleted`);
  }
}
export class FilePublicAccessDeniedError extends FilesError {
  readonly code = FilesErrorCode.FILE_PUBLIC_ACCESS_DENIED;
  constructor() {
    super(`File  is not public`);
  }
}
