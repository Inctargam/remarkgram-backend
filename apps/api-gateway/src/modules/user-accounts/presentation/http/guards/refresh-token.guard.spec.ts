import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { RefreshTokenGuard } from './refresh-token.guard.js';

function createHttpContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => createHttpContext,
    getClass: () => RefreshTokenGuard,
  } as unknown as ExecutionContext;
}

describe('RefreshTokenGuard', () => {
  const jwtService = { verifyAsync: vi.fn() };
  let guard: RefreshTokenGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new RefreshTokenGuard(jwtService as unknown as JwtService);
  });

  it('verifies the token and attaches trusted claims to the request', async () => {
    const request = { cookies: { refreshToken: 'refresh-token' } };
    jwtService.verifyAsync.mockResolvedValue({
      sub: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    });

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty('refreshTokenClaims', {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    });
  });

  it('rejects a required token with an invalid signature', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      guard.canActivate(createHttpContext({ cookies: { refreshToken: 'invalid' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request without a refresh token', async () => {
    await expect(guard.canActivate(createHttpContext({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
