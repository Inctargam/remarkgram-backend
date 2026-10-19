import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { FileUploadStatus } from '../../src/domain/enums/file-upload-status.enum.js';
import {
  CompleteImageUploadsCommand,
  CompleteImageUploadsUseCase,
} from '../../src/application/use-cases/complete-image-uploads/complete-image-uploads.use-case.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { PrismaFilesRepository } from '../../src/infrastructure/prisma/repositories/prisma-files.repository.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/prisma/prisma-unit-of-work.js';
import {
  AttachAvatarFileCommand,
  AttachAvatarFileUseCase,
} from '../../src/application/use-cases/attach-avatar-file/attach-avatar-file.use-case.js';
import {
  InvalidImageUploadStatusError,
  ImageUploadNotFoundError,
  ImageUploadStateConflictError,
  PostImageAttachmentConflictError,
} from '../../src/application/errors/image-upload.errors.js';

const adminUrl = process.env.POST_ATTACHMENT_INTEGRATION_DATABASE_URL;
const migrationName = '20260927120000_replace_post_image_reservations';
const userId = 42;
const hash = (ids: string[]) =>
  createHash('sha256')
    .update(
      ids
        .map((id) => id.toLowerCase())
        .sort()
        .join(','),
    )
    .digest('hex');

describe.runIf(Boolean(adminUrl))('Post image attachment with PostgreSQL', () => {
  const databaseName = `post_attachment_${randomUUID().replaceAll('-', '')}`;
  let admin: Client;
  let sql: Client;
  let prisma: PrismaService;
  let repository: PrismaFilesRepository;
  const legacyAvatarId = randomUUID();
  const legacyAvatarOperationId = randomUUID();
  const legacy = ['RESERVED', 'ATTACHED', 'RELEASED'].map((status) => ({
    status,
    id: randomUUID(),
    fileIds: [randomUUID(), randomUUID()],
  }));

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    sql = new Client({ connectionString: url.toString() });
    await sql.connect();
    const directory = resolve('apps/files/prisma/migrations');
    const migrations = (await readdir(directory)).filter((name) => /^\d/.test(name)).sort();
    for (const migration of migrations.filter((name) => name < migrationName)) {
      await sql.query(await readFile(resolve(directory, migration, 'migration.sql'), 'utf8'));
    }
    for (const operation of legacy) {
      await sql.query(
        'INSERT INTO image_upload_reservations (id, "userId", "uploadIds", status, "updatedAt") VALUES ($1, $2, $3, $4, now())',
        [operation.id, userId, [...operation.fileIds].reverse(), operation.status],
      );
      for (const id of operation.fileIds) {
        await sql.query(
          `INSERT INTO files (id, "userId", "objectKey", "originalFilename", "contentType", size, "uploadStatus", "uploadExpiresAt", "updatedAt", "reservationId")
          VALUES ($1::uuid, $2, $1::text, 'image.jpg', 'image/jpeg', 1024, $3, now(), now(), $4)`,
          [
            id,
            userId,
            operation.status === 'RELEASED' ? 'COMPLETED' : operation.status,
            operation.status === 'RELEASED' ? null : operation.id,
          ],
        );
      }
    }
    // Seed the old column name to prove that the rename preserves its value and uniqueness.
    await sql.query(
      `INSERT INTO files (id, "userId", "objectKey", "originalFilename", "contentType", size, "uploadStatus", "uploadExpiresAt", "updatedAt", "attachmentOperationId")
       VALUES ($1::uuid, $2, $1::text, 'avatar.jpg', 'image/jpeg', 1024, 'ATTACHED', now(), now(), $3)`,
      [legacyAvatarId, userId, legacyAvatarOperationId],
    );
    for (const migration of migrations.filter((name) => name >= migrationName)) {
      await sql.query(await readFile(resolve(directory, migration, 'migration.sql'), 'utf8'));
    }
    prisma = new PrismaService({ url: url.toString() });
    repository = new PrismaFilesRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it('migrates the existing history, cancels reserves and removes RESERVED from the enum', async () => {
    for (const old of legacy) {
      expect(await prisma.postImageAttachmentOperation.findUnique({ where: { id: old.id } })).toMatchObject({
        userId,
        status: old.status === 'ATTACHED' ? 'ATTACHED' : 'CANCELLED',
        fileIdsHash: hash(old.fileIds),
      });
      for (const id of old.fileIds) {
        expect(await prisma.file.findUnique({ where: { id } })).toMatchObject({
          uploadStatus: old.status === 'ATTACHED' ? 'ATTACHED' : 'COMPLETED',
          postImageAttachmentOperationId: old.status === 'ATTACHED' ? old.id : null,
        });
      }
    }
    const { rows } = await sql.query(
      `SELECT enumlabel FROM pg_enum JOIN pg_type ON enumtypid = pg_type.oid WHERE typname = 'FileUploadStatus'`,
    );
    expect(rows.map((row: { enumlabel: string }) => row.enumlabel).sort()).toEqual([
      'ATTACHED',
      'COMPLETED',
      'PENDING',
      'REJECTED',
    ]);
  });

  it('preserves avatar operation IDs and the unique index after renaming the column', async () => {
    expect(await prisma.file.findUnique({ where: { id: legacyAvatarId } })).toMatchObject({
      avatarAttachmentOperationId: legacyAvatarOperationId,
      postImageAttachmentOperationId: null,
      uploadStatus: 'ATTACHED',
    });
    const other = await file();
    await expect(
      prisma.file.update({
        where: { id: other.id },
        data: {
          avatarAttachmentOperationId: legacyAvatarOperationId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  async function file(
    overrides: {
      userId?: number;
      uploadStatus?: 'PENDING' | 'ATTACHED' | 'COMPLETED';
      deletedAt?: Date;
      uploadedAt?: Date;
    } = {},
  ) {
    const id = randomUUID();
    return prisma.file.create({
      data: {
        id,
        userId,
        objectKey: id,
        originalFilename: 'image.jpg',
        contentType: 'image/jpeg',
        size: 1024,
        uploadStatus: 'COMPLETED',
        uploadExpiresAt: new Date(),
        uploadedAt: new Date(),
        ...overrides,
      },
    });
  }
  const input = (fileIds: string[]) => ({ userId, fileIds, operationId: randomUUID() });

  it('accepts two concurrent confirmations without replacing the first completion timestamp', async () => {
    const upload = await file({ uploadStatus: 'PENDING' });
    let unblock!: () => void;
    const bothReadPending = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let reads = 0;
    const storage = {
      createPresignedUpload: vi.fn(),
      createPresignedDownloadUrl: vi.fn(),
      deleteObject: vi.fn(),
      getObjectMetadata: vi.fn(async () => {
        if (++reads === 2) unblock();
        await bothReadPending;
        return { size: upload.size, contentType: upload.contentType };
      }),
    };
    const complete = new CompleteImageUploadsUseCase(repository, storage);
    const command = new CompleteImageUploadsCommand({ userId, uploadIds: [upload.id] });
    await Promise.all([complete.execute(command), complete.execute(command)]);
    expect(storage.getObjectMetadata).toHaveBeenCalledTimes(2);
    const completed = await prisma.file.findUniqueOrThrow({ where: { id: upload.id } });
    expect(completed.uploadStatus).toBe('COMPLETED');
    await repository.updateImageUploadsStatusIfAllPending({
      userId,
      uploadIds: [upload.id],
      uploadStatus: FileUploadStatus.COMPLETED,
      uploadedAt: new Date('2035-01-01'),
    });
    expect((await prisma.file.findUniqueOrThrow({ where: { id: upload.id } })).uploadedAt).toEqual(
      completed.uploadedAt,
    );
  });

  it('rolls back a partial confirmation before checking for a successful replay', async () => {
    const pending = await file({ uploadStatus: 'PENDING' });
    const completed = await file();
    await expect(
      repository.updateImageUploadsStatusIfAllPending({
        userId,
        uploadIds: [pending.id, completed.id],
        uploadStatus: FileUploadStatus.COMPLETED,
        uploadedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(InvalidImageUploadStatusError);
    expect(await prisma.file.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      uploadStatus: 'PENDING',
      uploadedAt: pending.uploadedAt,
    });
  });

  it.each(['foreign', 'deleted', 'attached', 'rejected'] as const)(
    'does not mistake a %s file for a successful confirmation replay',
    async (kind) => {
      const upload = await file();
      await prisma.file.update({
        where: { id: upload.id },
        data: {
          ...(kind === 'foreign' ? { userId: 43 } : {}),
          ...(kind === 'deleted' ? { deletedAt: new Date() } : {}),
          ...(kind === 'attached' ? { uploadStatus: 'ATTACHED' as const } : {}),
          ...(kind === 'rejected' ? { uploadStatus: 'REJECTED' as const } : {}),
        },
      });
      await expect(
        repository.updateImageUploadsStatusIfAllPending({
          userId,
          uploadIds: [upload.id],
          uploadStatus: FileUploadStatus.COMPLETED,
          uploadedAt: new Date(),
        }),
      ).rejects.toBeInstanceOf(InvalidImageUploadStatusError);
    },
  );

  it('attaches a batch atomically and deduplicates concurrent and reordered repeats', async () => {
    const files = await Promise.all([file(), file()]);
    const params = input(files.map((f) => f.id));
    await Promise.all([
      repository.attachPostImages(params),
      repository.attachPostImages({ ...params, fileIds: [...params.fileIds].reverse() }),
    ]);
    expect(
      await prisma.file.count({
        where: { postImageAttachmentOperationId: params.operationId, uploadStatus: 'ATTACHED' },
      }),
    ).toBe(2);
    await prisma.file.deleteMany({ where: { id: { in: params.fileIds } } });
    await expect(repository.attachPostImages(params)).resolves.toBeUndefined();
  });

  it.each(['missing', 'foreign', 'deleted', 'pending', 'attached'] as const)(
    'rolls back a mixed batch with a %s file',
    async (kind) => {
      const good = await file();
      const badId =
        kind === 'missing'
          ? randomUUID()
          : (
              await file({
                ...(kind === 'foreign' ? { userId: 43 } : {}),
                ...(kind === 'deleted' ? { deletedAt: new Date() } : {}),
                ...(kind === 'pending' ? { uploadStatus: 'PENDING' as const } : {}),
                ...(kind === 'attached' ? { uploadStatus: 'ATTACHED' as const } : {}),
              })
            ).id;
      const params = input([good.id, badId]);
      await expect(repository.attachPostImages(params)).rejects.toBeInstanceOf(
        ['pending', 'attached'].includes(kind) ? ImageUploadStateConflictError : ImageUploadNotFoundError,
      );
      expect(
        await prisma.postImageAttachmentOperation.findUnique({ where: { id: params.operationId } }),
      ).toBeNull();
      expect(await prisma.file.findUnique({ where: { id: good.id } })).toMatchObject({
        uploadStatus: 'COMPLETED',
        postImageAttachmentOperationId: null,
      });
    },
  );

  it('rejects changed payloads for both attach and cancel without modifying files', async () => {
    const first = await file();
    const other = await file();
    const params = input([first.id]);
    await repository.attachPostImages(params);
    for (const method of ['attachPostImages', 'cancelPostImageAttachment'] as const) {
      await expect(repository[method]({ ...params, fileIds: [other.id] })).rejects.toBeInstanceOf(
        PostImageAttachmentConflictError,
      );
      await expect(repository[method]({ ...params, userId: 43 })).rejects.toBeInstanceOf(
        PostImageAttachmentConflictError,
      );
    }
    expect(await prisma.file.findUnique({ where: { id: first.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
    });
  });

  it('remembers cancellation before attach, including when the file does not exist', async () => {
    const params = input([randomUUID()]);
    await repository.cancelPostImageAttachment(params);
    await repository.cancelPostImageAttachment(params);
    await expect(repository.attachPostImages(params)).rejects.toBeInstanceOf(ImageUploadStateConflictError);
  });

  it('serializes concurrent attach and cancel; cancellation is terminal', async () => {
    const params = input([(await file()).id]);
    const results = await Promise.allSettled([
      repository.attachPostImages(params),
      repository.cancelPostImageAttachment(params),
    ]);
    expect(results[1].status).toBe('fulfilled');
    if (results[0].status === 'rejected')
      expect(results[0].reason).toBeInstanceOf(ImageUploadStateConflictError);
    expect(
      await prisma.postImageAttachmentOperation.findUnique({ where: { id: params.operationId } }),
    ).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.file.findUnique({ where: { id: params.fileIds[0] } })).toMatchObject({
      uploadStatus: 'COMPLETED',
      postImageAttachmentOperationId: null,
    });
    await expect(repository.attachPostImages(params)).rejects.toBeInstanceOf(ImageUploadStateConflictError);
  });

  it('does not let a stale cancel or attach overwrite another operation, even after the file becomes free again', async () => {
    const f = await file();
    const a = input([f.id]);
    const b = input([f.id]);
    await repository.attachPostImages(a);
    await repository.cancelPostImageAttachment(a);
    await repository.attachPostImages(b);
    await repository.cancelPostImageAttachment(a);
    expect(await prisma.file.findUnique({ where: { id: f.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
      postImageAttachmentOperationId: b.operationId,
    });
    await repository.cancelPostImageAttachment(b);
    await expect(repository.attachPostImages(a)).rejects.toBeInstanceOf(ImageUploadStateConflictError);
    expect(await prisma.file.findUnique({ where: { id: f.id } })).toMatchObject({
      uploadStatus: 'COMPLETED',
    });
  });

  it('does not resurrect deleted files during cancellation', async () => {
    const f = await file();
    const params = input([f.id]);
    await repository.attachPostImages(params);
    const deletedAt = new Date();
    await prisma.file.update({ where: { id: f.id }, data: { deletedAt } });
    await repository.cancelPostImageAttachment(params);
    expect(await prisma.file.findUnique({ where: { id: f.id } })).toMatchObject({
      deletedAt,
      uploadStatus: 'ATTACHED',
    });
  });

  it('allows only one competing post to attach the same file', async () => {
    const f = await file();
    const a = input([f.id]);
    const b = input([f.id]);
    const results = await Promise.allSettled([
      repository.attachPostImages(a),
      repository.attachPostImages(b),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'IMAGE_UPLOAD_STATE_CONFLICT' },
    });
    expect(
      await prisma.postImageAttachmentOperation.count({
        where: { id: { in: [a.operationId, b.operationId] } },
      }),
    ).toBe(1);
  });

  it('arbitrates a post versus avatar attachment atomically', async () => {
    const f = await file();
    const avatar = new AttachAvatarFileUseCase(repository, new PrismaUnitOfWork(prisma));
    const results = await Promise.allSettled([
      repository.attachPostImages(input([f.id])),
      avatar.execute(new AttachAvatarFileCommand({ userId, fileId: f.id, operationId: randomUUID() })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const attached = await prisma.file.findUniqueOrThrow({ where: { id: f.id } });
    expect(Boolean(attached.avatarAttachmentOperationId)).not.toBe(
      Boolean(attached.postImageAttachmentOperationId),
    );
  });

  it('never attaches a file already claimed by concurrent cleanup', async () => {
    const f = await file({ uploadedAt: new Date(0) });
    const now = new Date();
    const params = input([f.id]);
    await Promise.allSettled([
      repository.attachPostImages(params),
      repository.claimExpiredImageUploads({
        pendingExpiredBefore: now,
        completedBefore: now,
        rejectedBefore: now,
        retryBefore: new Date(0),
        claimedAt: now,
        limit: 100,
      }),
    ]);
    const result = await prisma.file.findUniqueOrThrow({ where: { id: f.id } });
    expect(result.uploadStatus === 'ATTACHED' && result.deletedAt !== null).toBe(false);
    if (result.deletedAt)
      expect(
        await prisma.postImageAttachmentOperation.findUnique({ where: { id: params.operationId } }),
      ).toBeNull();
  });
});
