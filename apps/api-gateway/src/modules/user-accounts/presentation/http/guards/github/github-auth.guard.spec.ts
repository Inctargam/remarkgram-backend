import { UnauthorizedException } from '@nestjs/common';
import { GithubAuthGuard } from './github-auth.guard.js';

describe('GithubAuthGuard', () => {
  const guard = new GithubAuthGuard();

  it('returns an authenticated user', () => {
    const user = { subject: 'github-user' };

    expect(guard.handleRequest(null, user, null)).toBe(user);
  });

  it('rethrows an authentication error', () => {
    const error = new Error('GitHub is unavailable');

    expect(() => guard.handleRequest(error, null, null)).toThrow(error);
  });

  it('returns a readable Passport authentication error', () => {
    expect(() => guard.handleRequest(null, null, { message: 'Access denied by user' })).toThrow(
      new UnauthorizedException('Access denied by user'),
    );
  });

  it('uses a safe fallback for an unknown authentication error', () => {
    expect(() => guard.handleRequest('unknown error', null, null)).toThrow(
      new UnauthorizedException('GitHub OAuth authentication failed'),
    );
  });
});
