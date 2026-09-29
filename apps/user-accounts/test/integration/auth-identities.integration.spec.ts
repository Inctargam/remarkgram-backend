import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PrismaAuthIdentitiesRepository } from '../../src/features/auth-identities/infrastucture/persistence/prisma-auth-identities.repository.js';
import type { AuthIdentityCreateRepositoryParams } from '../../src/features/auth-identities/application/types/auth-identities.types.js';

const adminUrl = process.env.USER_ACCOUNTS_INTEGRATION_DATABASE_URL;

describe.runIf(Boolean(adminUrl))('OAuth identity creation on PostgreSQL', () => {
  const database = `auth_identities_${randomUUID().replaceAll('-', '')}`;
  let admin: Client;
  let prisma: PrismaService;
  let repository: PrismaAuthIdentitiesRepository;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${database}`;
    const setup = new Client({ connectionString: url.toString() });
    await setup.connect();
    try {
      const directory = 'apps/user-accounts/prisma/migrations';
      for (const name of (await readdir(directory)).filter((name) => /^\d/.test(name)).sort()) {
        await setup.query(await readFile(`${directory}/${name}/migration.sql`, 'utf8'));
      }
    } finally {
      await setup.end();
    }
    prisma = new PrismaService({ url: url.toString() });
    repository = new PrismaAuthIdentitiesRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function identity(): Promise<AuthIdentityCreateRepositoryParams> {
    const username = randomUUID();
    const user = await prisma.user.create({
      data: { username, email: `${username}@example.com`, isConfirmed: true, createdAt: new Date() },
    });
    return {
      userId: user.id,
      provider: 'github',
      providerSubject: randomUUID(),
      providerEmail: null,
      providerEmailVerified: false,
      username: null,
      avatarUrl: null,
    };
  }

  it('returns the created identity with defaults; a concurrent duplicate returns null', async () => {
    const params = await identity();
    const results = await Promise.all([repository.createIfAbsent(params), repository.createIfAbsent(params)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    const created = results.find(Boolean)!;
    expect(created).toMatchObject(params);
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(await prisma.authIdentity.count({ where: { userId: params.userId } })).toBe(1);
  });

  it('skips either unique conflict without aborting the caller transaction', async () => {
    const first = await identity();
    const other = await identity();
    const created = await repository.createIfAbsent(first);
    await prisma.$transaction(async (tx) => {
      // Тот же внешний аккаунт у другого пользователя; другой аккаунт того же провайдера у владельца.
      expect(await repository.createIfAbsent({ ...first, userId: other.userId }, tx)).toBeNull();
      expect(
        await repository.createIfAbsent({ ...first, providerSubject: other.providerSubject }, tx),
      ).toBeNull();
      expect(await tx.authIdentity.findUnique({ where: { id: created!.id } })).toMatchObject(first);
    });
  });

  it('rolls back the new identity with the caller transaction', async () => {
    const params = await identity();
    await expect(
      prisma.$transaction(async (tx) => {
        expect(await repository.createIfAbsent(params, tx)).not.toBeNull();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await prisma.authIdentity.count({ where: { userId: params.userId } })).toBe(0);
  });

  it('does not suppress foreign-key failures as duplicates', async () => {
    const params = await identity();
    await prisma.user.delete({ where: { id: params.userId } });
    await expect(repository.createIfAbsent(params)).rejects.toMatchObject({ code: 'P2003' });
  });
});
