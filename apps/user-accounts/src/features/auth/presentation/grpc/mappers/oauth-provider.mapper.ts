import { status } from '@grpc/grpc-js';
import { OAuthProvider } from '@app/user-accounts-grpc';
import { RpcException } from '@nestjs/microservices';
import type { AuthIdentityProvider } from '../../../../auth-identities/domain/auth-identity.entity.js';

export function mapOAuthProvider(provider: OAuthProvider): AuthIdentityProvider {
  switch (provider) {
    case OAuthProvider.OAUTH_PROVIDER_GITHUB:
      return 'github';
    case OAuthProvider.OAUTH_PROVIDER_GOOGLE:
      return 'google';
    case OAuthProvider.OAUTH_PROVIDER_UNSPECIFIED:
    case OAuthProvider.UNRECOGNIZED:
    default:
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Unsupported OAuth provider: ${provider}`,
      });
  }
}
