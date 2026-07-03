import { Test } from '@nestjs/testing';
import { AuthService } from './features/auth/auth.service.js';
import { SessionsService } from './features/sessions/application/sessions.service.js';
import { UsersService } from './features/users/application/users.service.js';
import { UserAccountsModule } from './app.module.js';

describe('UserAccountsModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves auth, users and sessions without circular module dependencies', async () => {
    vi.stubEnv('NODE_ENV', 'testing');
    vi.stubEnv('JWT_PRIVATE_KEY', 'private-key');
    vi.stubEnv('ACCESS_TOKEN_EXPIRES_IN', '10m');
    vi.stubEnv('REFRESH_TOKEN_EXPIRES_IN', '20m');
    vi.stubEnv('CONFIRMATION_CODE_EXPIRES_IN', '24');
    vi.stubEnv('RECOVERY_CODE_EXPIRES_IN', '1');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@localhost:5432/database');
    vi.stubEnv('EMAIL_LOGIN_GOOGLE', 'user@example.com');
    vi.stubEnv('EMAIL_PASSWORD_GOOGLE', 'password');
    vi.stubEnv('SMTP_URL', 'smtp.example.com');
    vi.stubEnv('USER_ACCOUNTS_GRPC_URL', 'localhost:50052');

    const module = await Test.createTestingModule({ imports: [UserAccountsModule] }).compile();

    expect(module.get(AuthService)).toBeInstanceOf(AuthService);
    expect(module.get(UsersService)).toBeInstanceOf(UsersService);
    expect(module.get(SessionsService)).toBeInstanceOf(SessionsService);

    await module.close();
  });
});
