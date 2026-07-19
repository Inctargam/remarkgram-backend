import { describe, expect } from 'vitest';
import type { CanActivate, ExecutionContext, INestApplication, INestMicroservice } from '@nestjs/common';
import { setupGatewayAppHttp } from '../setup-app/setup-gateway.app-http.ts';
import { setupUserAccountsAppGrpc } from '../setup-app/setup-user-accounts.app-grpc.ts';
import { AuthApiHelper } from '../helpers/auth-api.helper.ts';
import { type OAuthIdentityClaims, OAuthProvider } from '@app/user-accounts-grpc';
import { GithubAuthGuard } from '../../src/modules/user-accounts/presentation/http/guards/github/github-auth.guard.js';
import { PrismaService } from '../../../user-accounts/src/database/prisma.service.js';
import { AuthProvider } from '../../../user-accounts/src/database/generated/enums.ts';
import { TestingApiHelper } from '../helpers/testing-api.helper.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfirmationInfo } from '../../../user-accounts/src/features/users/domain/value-objects/confirmation-info.ts';

const shouldSkip = process.env.SKIP_E2E === 'true' || process.env.NODE_ENV === 'production';

type GithubIdentityOverrides = Partial<OAuthIdentityClaims> & {
  email?: string;
  emailVerified?: boolean;
};

function createGithubIdentityClaims(overrides: GithubIdentityOverrides = {}): OAuthIdentityClaims {
  const subject = randomBytes(16).toString('hex');
  const {
    email = `github-email${subject}@gmail.com`,
    emailVerified = true,
    ...identityOverrides
  } = overrides;

  return {
    provider: OAuthProvider.OAUTH_PROVIDER_GITHUB,
    subject: subject,
    emails: email ? [{ email, verified: emailVerified, primary: true }] : [],
    username: 'github_user' + subject,
    avatarUrl: '',
    ...identityOverrides,
  };
}

(shouldSkip ? describe.skip : describe)('OAuth github', () => {
  let appGateway: INestApplication;
  let userAccountsGrpc: INestMicroservice;
  let authRequest: AuthApiHelper;
  let prisma: PrismaService;
  const canActivateMock = vi.fn<CanActivate['canActivate']>();

  const githubAuthGuardMock: CanActivate = {
    canActivate: canActivateMock,
  };

  const mockGithubIdentity = (identity: OAuthIdentityClaims | null): void => {
    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims | null }>();
      request.user = identity;
      return true;
    });
  };

  beforeAll(async () => {
    appGateway = (
      await setupGatewayAppHttp((moduleBuilder) => {
        moduleBuilder.overrideGuard(GithubAuthGuard).useValue(githubAuthGuardMock);
      })
    ).app;
    userAccountsGrpc = (await setupUserAccountsAppGrpc()).app;
    prisma = userAccountsGrpc.get<PrismaService>(PrismaService);
    authRequest = new AuthApiHelper(appGateway);

    const testingRequest = new TestingApiHelper(appGateway);
    await testingRequest.deleteAllData();
  });
  afterAll(async () => {
    await appGateway?.close();
    await userAccountsGrpc?.close();
  });

  beforeEach(() => {
    canActivateMock.mockReset();
  });

  it('passes the GitHub authorization endpoint through the GitHub guard', async () => {
    canActivateMock.mockReturnValue(true);

    const response = await authRequest.githubAuth();

    expect(response.status).toBe(200);
    expect(canActivateMock).toHaveBeenCalledOnce();
  });

  it('redirects to the failed login page when GitHub does not return an identity', async () => {
    mockGithubIdentity(null);

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://remark-gram.com/login?oauth=failed');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('redirects to the failed login page when the returned identity is not from GitHub', async () => {
    mockGithubIdentity(createGithubIdentityClaims({ provider: OAuthProvider.OAUTH_PROVIDER_GOOGLE }));

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://remark-gram.com/login?oauth=failed');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a first OAuth login when GitHub does not return an email', async () => {
    const githubIdentity = createGithubIdentityClaims({ email: '', emailVerified: false });
    mockGithubIdentity(githubIdentity);

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
    await expect(
      prisma.authIdentity.findFirst({
        where: { provider: AuthProvider.github, providerSubject: githubIdentity.subject },
      }),
    ).resolves.toBeNull();
  });
  it('creates a new user and links the GitHub identity on the first OAuth login with a verified email', async () => {
    const githubIdentity: OAuthIdentityClaims = createGithubIdentityClaims({
      email: 'user1@gmail.com',
      emailVerified: true,
    });

    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims }>();
      request.user = githubIdentity;
      return true;
    });

    const redirect = await authRequest.githubAuthRedirect();
    expect(redirect.status).toBe(302);

    const cookies = redirect.headers['set-cookie'];
    expect(cookies[0]).toMatch(/refreshToken/);

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });
    if (!identity) {
      throw new Error('OAuth identity was not created');
    }

    expect(identity).toMatchObject({
      provider: AuthProvider.github,
      providerSubject: githubIdentity.subject,
      providerEmail: githubIdentity.emails.find((email) => email.primary)?.email,
      providerEmailVerified: true,
    });

    const user = await prisma.user.findFirst({
      where: {
        id: identity.userId,
      },
    });
    expect(user!.isConfirmed).toBeTruthy();
  });
  it('links the GitHub identity and confirms the existing user when GitHub returns a verified matching email', async () => {
    const userCredentials = {
      username: 'username_2',
      email: 'username2@gmail.com',
      password: 'pP!sswoRd123',
    };
    const createUserRes = await authRequest.register(userCredentials);

    expect(createUserRes.status).toBe(201);

    const user = await prisma.user.findFirst({
      where: {
        email: userCredentials.email,
      },
    });

    if (!user) {
      throw new Error('User not found, before creating');
    }
    expect(user.isConfirmed).toBeFalsy();

    const githubIdentity: OAuthIdentityClaims = createGithubIdentityClaims({
      email: userCredentials.email,
      emailVerified: true,
    });

    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims }>();
      request.user = githubIdentity;
      return true;
    });

    const redirect = await authRequest.githubAuthRedirect();
    expect(redirect.status).toBe(302);

    const cookies = redirect.headers['set-cookie'];
    expect(cookies[0]).toMatch(/refreshToken/);

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });

    expect(identity).toMatchObject({
      provider: AuthProvider.github,
      providerSubject: githubIdentity.subject,
    });

    const userBeforeLinks = await prisma.user.findFirst({
      where: {
        id: identity!.userId,
      },
    });

    expect(userBeforeLinks!.isConfirmed).toBeTruthy();
  });
  it('registers a pending user when GitHub returns an unverified email', async () => {
    const githubIdentity: OAuthIdentityClaims = createGithubIdentityClaims({
      email: 'test@gmail.com',
      emailVerified: false,
    });

    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims }>();
      request.user = githubIdentity;
      return true;
    });

    const redirect = await authRequest.githubAuthRedirect();
    expect(redirect.status).toBe(302);

    const cookies = redirect.headers['set-cookie'];
    expect(cookies).toBeUndefined();

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });

    expect(identity).toMatchObject({
      provider: AuthProvider.github,
      providerSubject: githubIdentity.subject,
      providerEmail: 'test@gmail.com',
      providerEmailVerified: false,
    });

    const pendingUser = await prisma.user.findUnique({ where: { id: identity!.userId } });
    expect(pendingUser).toMatchObject({
      email: 'test@gmail.com',
      isConfirmed: false,
    });
    expect(pendingUser?.confirmationCode).not.toBeNull();
  });
  it('return reject if user not confirm system email and the Github return not verified email.', async () => {
    const userCredentials = {
      username: 'username_3',
      email: 'username3@gmail.com',
      password: 'pP!sswoRd123',
    };
    const createUserRes = await authRequest.register(userCredentials);

    expect(createUserRes.status).toBe(201);

    const githubIdentity: OAuthIdentityClaims = createGithubIdentityClaims({
      email: userCredentials.email,
      emailVerified: false,
    });

    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims }>();
      request.user = githubIdentity;
      return true;
    });

    const redirect = await authRequest.githubAuthRedirect();
    expect(redirect.status).toBe(302);

    const cookies = redirect.headers['set-cookie'];
    expect(cookies).toBeUndefined();

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });

    expect(identity).toBeNull();

    // Удостоверяемся, что автоматически почта не подтвердилась у сестемного юзера
    const userNotConfirmed = await prisma.user.findFirst({
      where: {
        email: userCredentials.email,
        isConfirmed: false,
      },
      select: { isConfirmed: true },
    });
    expect(userNotConfirmed!.isConfirmed).toBeFalsy();
  });
  it('signs in through an existing GitHub identity and updates the email or verification status when changed', async () => {
    const userCredentials = {
      username: 'supperuser',
      email: 'supperuser@gmail.com',
      password: 'pP!sswoRd123',
    };
    const confirmation = ConfirmationInfo.confirmed();

    const userDb = await prisma.user.create({
      data: {
        email: userCredentials.email,
        hash: randomUUID(),
        username: userCredentials.username,
        createdAt: new Date(),
        isConfirmed: confirmation.isConfirmed,
        confirmationExpiration: confirmation.expiration,
        confirmationCode: confirmation.code,
      },
    });

    if (!userDb) {
      throw new Error('Error user not created');
    }

    const githubIdentity: OAuthIdentityClaims = createGithubIdentityClaims({
      email: userCredentials.email,
      emailVerified: true,
    });

    canActivateMock.mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest<{ user?: OAuthIdentityClaims }>();
      request.user = githubIdentity;
      return true;
    });

    //sign in
    const redirect = await authRequest.githubAuthRedirect();
    expect(redirect.status).toBe(302);

    const identity = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });
    if (!identity) {
      throw new Error('Error identity by provider and subject not found');
    }

    expect(identity.providerEmail).toMatch(userCredentials.email);
    expect(identity.providerEmailVerified).toBeTruthy();

    // //  Повторяем вход, но почта уже другая. Проверяем, что почта в auth identity обновилась
    const newEmail = 'github-new-email@gmail.com';
    mockGithubIdentity({
      ...githubIdentity,
      emails: [{ email: newEmail, verified: false, primary: true }],
    });

    const secondRedirect = await authRequest.githubAuthRedirect();
    expect(secondRedirect.status).toBe(302);
    expect(secondRedirect.headers['set-cookie'][0]).toMatch(/refreshToken/);

    const identityUpdated = await prisma.authIdentity.findFirst({
      where: {
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
      },
    });
    expect(identityUpdated).toMatchObject({
      providerEmail: newEmail,
      providerEmailVerified: false,
    });
  });

  it('confirms an unconfirmed identity owner when GitHub returns the same verified email', async () => {
    const email = 'existing-identity-owner@gmail.com';
    const user = await prisma.user.create({
      data: {
        email,
        hash: randomUUID(),
        username: `identity_owner_${randomBytes(4).toString('hex')}`,
        createdAt: new Date(),
        isConfirmed: false,
        confirmationCode: randomUUID(),
        confirmationExpiration: new Date(Date.now() + 60_000),
      },
    });
    const githubIdentity = createGithubIdentityClaims({ email, emailVerified: true });
    await prisma.authIdentity.create({
      data: {
        userId: user.id,
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
        providerEmail: email,
        providerEmailVerified: true,
      },
    });
    mockGithubIdentity(githubIdentity);

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://remark-gram.com');
    expect(response.headers['set-cookie'][0]).toMatch(/refreshToken/);
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      isConfirmed: true,
      confirmationCode: null,
      confirmationExpiration: null,
    });
  });

  it('does not confirm an unconfirmed identity owner when the GitHub email does not match', async () => {
    const email = 'unconfirmed-identity-owner@gmail.com';
    const user = await prisma.user.create({
      data: {
        email,
        hash: randomUUID(),
        username: `unconfirmed_owner_${randomBytes(4).toString('hex')}`,
        createdAt: new Date(),
        isConfirmed: false,
        confirmationCode: randomUUID(),
        confirmationExpiration: new Date(Date.now() + 60_000),
      },
    });
    const githubIdentity = createGithubIdentityClaims({
      email: 'different-github-email@gmail.com',
      emailVerified: true,
    });
    await prisma.authIdentity.create({
      data: {
        userId: user.id,
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
        providerEmail: email,
        providerEmailVerified: true,
      },
    });
    mockGithubIdentity(githubIdentity);

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      isConfirmed: false,
    });
  });

  it('does not confirm an unconfirmed identity owner when the matching GitHub email is unverified', async () => {
    const email = 'unverified-identity-owner@gmail.com';
    const user = await prisma.user.create({
      data: {
        email,
        hash: randomUUID(),
        username: `unverified_owner_${randomBytes(4).toString('hex')}`,
        createdAt: new Date(),
        isConfirmed: false,
        confirmationCode: randomUUID(),
        confirmationExpiration: new Date(Date.now() + 60_000),
      },
    });
    const githubIdentity = createGithubIdentityClaims({ email, emailVerified: false });
    await prisma.authIdentity.create({
      data: {
        userId: user.id,
        provider: AuthProvider.github,
        providerSubject: githubIdentity.subject,
        providerEmail: email,
        providerEmailVerified: true,
      },
    });
    mockGithubIdentity(githubIdentity);

    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toMatchObject({
      isConfirmed: false,
    });
  });

  it('rejects linking a second GitHub identity to the same user', async () => {
    const email = 'github-provider-conflict@gmail.com';
    const firstIdentity = createGithubIdentityClaims({ email, emailVerified: true });
    mockGithubIdentity(firstIdentity);
    expect((await authRequest.githubAuthRedirect()).status).toBe(302);

    const secondIdentity = createGithubIdentityClaims({ email, emailVerified: true });
    mockGithubIdentity(secondIdentity);
    const response = await authRequest.githubAuthRedirect();

    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
    await expect(
      prisma.authIdentity.count({ where: { provider: AuthProvider.github, providerEmail: email } }),
    ).resolves.toBe(1);
  });
});
