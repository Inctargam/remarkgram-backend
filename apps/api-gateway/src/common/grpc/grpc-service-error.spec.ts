import { Metadata, status } from '@grpc/grpc-js';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { getGrpcMetadataValue, isGrpcServiceError } from './grpc-service-error.js';

describe('gRPC service error helpers', () => {
  it.each([
    { code: status.INVALID_ARGUMENT },
    { code: status.UNAVAILABLE, details: 'Service is unavailable' },
  ])('recognizes a gRPC service error with status $code', (error) => {
    expect(isGrpcServiceError(error)).toBe(true);
  });

  it.each([null, new Error('Failed'), { code: 'UNAVAILABLE' }, { code: 999 }])(
    'rejects a value without a valid gRPC status',
    (error) => {
      expect(isGrpcServiceError(error)).toBe(false);
    },
  );

  it('extracts the application error code from metadata', () => {
    const metadata = new Metadata();
    metadata.set(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, 'OAUTH_EMAIL_REQUIRED');

    expect(
      getGrpcMetadataValue(
        {
          code: status.FAILED_PRECONDITION,
          metadata,
        },
        USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY,
      ),
    ).toBe('OAUTH_EMAIL_REQUIRED');
  });

  it('returns undefined when the error has no application code', () => {
    expect(getGrpcMetadataValue({ code: status.UNAVAILABLE }, 'application-error-code')).toBeUndefined();
    expect(getGrpcMetadataValue(new Error('Failed'), 'application-error-code')).toBeUndefined();
  });
});
