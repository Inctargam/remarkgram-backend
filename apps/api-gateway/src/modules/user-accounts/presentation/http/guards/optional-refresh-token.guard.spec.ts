import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { OptionalRefreshTokenGuard } from './optional-refresh-token.guard.js';

function createHttpContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalRefreshTokenGuard', () => {
  const jwtService = { verifyAsync: vi.fn() };
  let guard: OptionalRefreshTokenGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new OptionalRefreshTokenGuard(jwtService as unknown as JwtService);
  });

  it('allows login without a refresh token', async () => {
    await expect(guard.canActivate(createHttpContext({ cookies: {} }))).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('attaches claims from a valid refresh token', async () => {
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
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh-token', { audience: 'auth' });
  });

  it('allows login with an invalid refresh token without attaching claims', async () => {
    const request = { cookies: { refreshToken: 'invalid' } };
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
    expect(request).not.toHaveProperty('refreshTokenClaims');
  });
});
