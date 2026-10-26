import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { PrismaService as FilesPrismaService } from '../../../files/src/infrastructure/prisma/prisma.service.js';

const adminUrl = process.env.POST_ATTACHMENT_INTEGRATION_DATABASE_URL;

describe.runIf(Boolean(adminUrl))('CreatePostV2 process recovery', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const databases = [`post_recovery_${suffix}`, `post_files_${suffix}`];
  let admin: Client;
  let posts: PrismaService;
  let files: FilesPrismaService;
  const urls: string[] = [];

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    for (const [index, service] of ['posts', 'files'].entries()) {
      await admin.query(`CREATE DATABASE "${databases[index]}"`);
      const url = new URL(adminUrl!);
      url.pathname = `/${databases[index]}`;
      urls.push(url.toString());
      const sql = new Client({ connectionString: urls[index] });
      await sql.connect();
      try {
        const dir = resolve(`apps/${service}/prisma/migrations`);
        for (const migration of (await readdir(dir)).filter((name) => /^\d/.test(name)).sort()) {
          await sql.query(await readFile(resolve(dir, migration, 'migration.sql'), 'utf8'));
        }
      } finally {
        await sql.end();
      }
    }
    posts = new PrismaService({ url: urls[0] });
    files = new FilesPrismaService({ url: urls[1] });
  }, 60_000);

  afterAll(async () => {
    await posts?.$disconnect();
    await files?.$disconnect();
    if (admin) {
      for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it.each([
    'before-createUnpublishedPost-commit',
    'after-createUnpublishedPost-commit',
    'after-attach',
    'before-publishPost-commit',
    'after-publishPost-commit',
    'after-cancel',
    'before-deleteUnpublishedPost-commit',
    'after-deleteUnpublishedPost-commit',
  ])(
    'restores checkpoints and the same Files operation after %s',
    async (crashAt) => {
      const rejectAttach = crashAt.includes('cancel') || crashAt.includes('deleteUnpublished');
      const ids = [randomUUID(), randomUUID()];
      await files.file.createMany({
        data: ids.map((id) => ({
          id,
          userId: 42,
          objectKey: id,
          originalFilename: 'image.jpg',
          contentType: 'image/jpeg',
          size: 1024,
          uploadStatus: 'COMPLETED',
          uploadExpiresAt: new Date(),
          uploadedAt: new Date(),
        })),
      });
      const params = {
        workflowId: `post-recovery:${randomUUID()}`,
        requestHash: randomUUID(),
        userId: 42,
        description: 'recovery',
        fileIds: ids,
      };
      const run = (mode: string) =>
        new Promise<{ code: number | null; signal: string | null }>((resolveResult, reject) => {
          const child = spawn(
            process.execPath,
            ['apps/posts/test/fixtures/create-post-recovery-process.mjs'],
            {
              env: {
                ...process.env,
                POST_RECOVERY_INPUT: JSON.stringify(params),
                POST_RECOVERY_POSTS_URL: urls[0],
                POST_RECOVERY_FILES_URL: urls[1],
                POST_RECOVERY_CRASH_AT: mode,
                POST_RECOVERY_REJECT_ATTACH: String(rejectAttach),
              },
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
          let output = '';
          child.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          child.stderr.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          child.once('error', reject);
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`Recovery timed out: ${output}`));
          }, 25_000);
          child.once('exit', (code, signal) => {
            clearTimeout(timer);
            if (code) reject(new Error(output));
            else resolveResult({ code, signal });
          });
        });
      const beforeCount = await files.postImageAttachmentOperation.count();
      expect((await run(crashAt)).signal).toBe('SIGKILL');
      const before = await posts.post.findMany({ where: { images: { some: { fileId: { in: ids } } } } });
      const operationBefore = await files.postImageAttachmentOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      const countAtCrash = await files.postImageAttachmentOperation.count();
      if (
        crashAt === 'before-createUnpublishedPost-commit' ||
        crashAt === 'after-deleteUnpublishedPost-commit'
      )
        expect(before).toHaveLength(0);
      else {
        expect(before).toHaveLength(1);
        expect(before[0].publishedAt !== null).toBe(crashAt === 'after-publishPost-commit');
      }

      expect((await run('recover')).code).toBe(0);
      const after = await posts.post.findMany({
        where: { images: { some: { fileId: { in: ids } } } },
        include: { images: { orderBy: { position: 'asc' } } },
      });
      expect(await files.postImageAttachmentOperation.count()).toBe(beforeCount + 1);
      if (countAtCrash > beforeCount) {
        expect(
          await files.postImageAttachmentOperation.findUnique({ where: { id: operationBefore[0].id } }),
        ).toMatchObject({ status: rejectAttach ? 'CANCELLED' : 'ATTACHED' });
      }
      if (rejectAttach) {
        expect(after).toHaveLength(0);
        expect(
          await files.file.count({
            where: { id: { in: ids }, uploadStatus: 'COMPLETED', postImageAttachmentOperationId: null },
          }),
        ).toBe(2);
      } else {
        expect(after).toHaveLength(1);
        expect(after[0].publishedAt).not.toBeNull();
        if (before.length) expect(after[0].id).toBe(before[0].id);
        expect(after[0].images.map((image) => image.fileId)).toEqual(ids);
        expect(await files.file.count({ where: { id: { in: ids }, uploadStatus: 'ATTACHED' } })).toBe(2);
      }
      expect((await run('replay')).code).toBe(0);
      expect(await files.postImageAttachmentOperation.count()).toBe(beforeCount + 1);
    },
    90_000,
  );
});
