export enum FilesErrorCode {
  INVALID_IMAGE_UPLOAD_COUNT = 'INVALID_IMAGE_UPLOAD_COUNT',
  INVALID_IMAGE_SIZE = 'INVALID_IMAGE_SIZE',
  UNSUPPORTED_IMAGE_CONTENT_TYPE = 'UNSUPPORTED_IMAGE_CONTENT_TYPE',
}

export abstract class FilesError extends Error {
  abstract readonly code: FilesErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
