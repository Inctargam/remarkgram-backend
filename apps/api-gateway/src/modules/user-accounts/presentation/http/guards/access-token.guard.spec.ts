import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { AccessTokenGuard } from './access-token.guard.js';

function createHttpContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => createHttpContext,
    getClass: () => AccessTokenGuard,
  } as unknown as ExecutionContext;
}

describe('AccessTokenGuard', () => {
  const jwtService = { verifyAsync: vi.fn() };
  const reflector = { getAllAndOverride: vi.fn() };
  let guard: AccessTokenGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    guard = new AccessTokenGuard(jwtService as unknown as JwtService, reflector as unknown as Reflector);
  });

  it('sets userId for a valid bearer token', async () => {
    const request = {
      headers: { authorization: 'Bearer access-token' },
      userId: null as string | null,
    };
    jwtService.verifyAsync.mockResolvedValue({ sub: '1' });

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);
    expect(request.userId).toBe('1');
  });

  it('rejects a protected request without authorization header', async () => {
    const request = { headers: {}, userId: null };

    await expect(guard.canActivate(createHttpContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
