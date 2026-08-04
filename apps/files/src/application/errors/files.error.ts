import type { FilesErrorCode } from '@app/files-grpc';

export abstract class FilesError extends Error {
  abstract readonly code: FilesErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
