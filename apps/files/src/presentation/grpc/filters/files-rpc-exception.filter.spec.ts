import { status } from '@grpc/grpc-js';
import { FILES_APP_ERROR_CODE_METADATA_KEY } from '@app/files-grpc';
import type { ArgumentsHost } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  DuplicateClientFileIdError,
  DuplicateImageUploadIdError,
  ImageUploadMetadataMismatchError,
  ImageUploadNotFoundError,
  ImageUploadsNotCompletedError,
  InvalidUserIdError,
  InvalidImageSizeError,
  InvalidImageCountError,
  InvalidImageUploadStatusError,
  UnsupportedImageContentTypeError,
} from '../../../application/errors/image-upload.errors.js';
import { FilesRpcExceptionFilter } from './files-rpc-exception.filter.js';

describe('FilesRpcExceptionFilter', () => {
  const filter = new FilesRpcExceptionFilter();
  const host = {} as ArgumentsHost;

  it.each([
    new InvalidUserIdError(),
    new InvalidImageCountError(),
    new InvalidImageSizeError(),
    new DuplicateClientFileIdError('11111111-1111-4111-8111-111111111111'),
    new DuplicateImageUploadIdError(),
    new UnsupportedImageContentTypeError('image/gif'),
  ])('maps $code to INVALID_ARGUMENT with an application error code', async (error) => {
    const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
      (caught: unknown) => caught,
    );

    expect(rpcError).toEqual(
      expect.objectContaining({
        code: status.INVALID_ARGUMENT,
        message: error.message,
      }),
    );
    expect(
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
        FILES_APP_ERROR_CODE_METADATA_KEY,
      ),
    ).toEqual([error.code]);
  });

  it('maps a missing image upload to NOT_FOUND', async () => {
    const error = new ImageUploadNotFoundError();
    const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
      (caught: unknown) => caught,
    );

    expect(rpcError).toEqual(
      expect.objectContaining({
        code: status.NOT_FOUND,
        message: error.message,
      }),
    );
    expect(
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
        FILES_APP_ERROR_CODE_METADATA_KEY,
      ),
    ).toEqual([error.code]);
  });

  it('maps mismatched upload metadata to FAILED_PRECONDITION', async () => {
    const error = new ImageUploadMetadataMismatchError();
    const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
      (caught: unknown) => caught,
    );

    expect(rpcError).toEqual(
      expect.objectContaining({
        code: status.FAILED_PRECONDITION,
        message: error.message,
      }),
    );
    expect(
      (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
        FILES_APP_ERROR_CODE_METADATA_KEY,
      ),
    ).toEqual([error.code]);
  });

  it.each([new InvalidImageUploadStatusError(), new ImageUploadsNotCompletedError()])(
    'maps $code to FAILED_PRECONDITION',
    async (error) => {
      const rpcError: unknown = await firstValueFrom(filter.catch(error, host)).catch(
        (caught: unknown) => caught,
      );

      expect(rpcError).toEqual(
        expect.objectContaining({
          code: status.FAILED_PRECONDITION,
          message: error.message,
        }),
      );
      expect(
        (rpcError as { metadata: { get(key: string): unknown[] } }).metadata.get(
          FILES_APP_ERROR_CODE_METADATA_KEY,
        ),
      ).toEqual([error.code]);
    },
  );
});
