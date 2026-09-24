import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { PrismaService } from '../../src/database/prisma.service.js';
import { PrismaService as FilesPrismaService } from '../../../files/src/infrastructure/prisma/prisma.service.js';
import { PrismaFilesRepository } from '../../../files/src/infrastructure/prisma/repositories/prisma-files.repository.js';
import { PrismaFileDeletionJobsRepository } from '../../../files/src/infrastructure/prisma/repositories/prisma-file-deletion-jobs.repository.js';
import { PrismaUnitOfWork } from '../../../files/src/infrastructure/prisma/prisma-unit-of-work.js';
import {
  AttachAvatarUploadCommand,
  AttachAvatarUploadUseCase,
} from '../../../files/src/application/use-cases/attach-avatar-upload/attach-avatar-upload.use-case.js';
import {
  ScheduleAttachedFileDeletionCommand,
  ScheduleAttachedFileDeletionUseCase,
} from '../../../files/src/application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import {
  AvatarFilesGateway,
  type AvatarFileParams,
  type AttachAvatarParams,
} from '../../src/features/users/application/ports/avatar-files.gateway.js';
import { DbosSetAvatarWorkflow } from '../../src/features/users/infrastructure/dbos/dbos-set-avatar.workflow.js';
import { UserAccountsDbosDataSource } from '../../src/features/users/infrastructure/dbos/user-accounts-dbos.datasource.js';
import {
  AvatarFileStateConflictError,
  AvatarFileNotFoundError,
  AvatarFilesUnavailableError,
  InvalidAvatarImageError,
} from '../../src/features/users/application/errors/avatar.errors.js';
import { UserAccountsErrorCode as Code } from '../../src/common/application/errors/user-accounts.error.js';
import { FilesError } from '../../../files/src/application/errors/files.error.js';
import { FilesErrorCode } from '@app/files-grpc';

const adminUrl = process.env.AVATAR_INTEGRATION_DATABASE_URL;
const userId = 42;

// Actual Files transactions; only transport is replaced to inject lost responses.
class FilesGateway extends AvatarFilesGateway {
  loseNext: string | null = null;
  pauseAttach: (() => Promise<void>) | null = null;
  constructor(
    private readonly repository: PrismaFilesRepository,
    private readonly deletion: ScheduleAttachedFileDeletionUseCase,
    private readonly unitOfWork: PrismaUnitOfWork,
  ) {
    super();
  }
  async attachAvatarUpload(params: AttachAvatarParams) {
    if (this.pauseAttach) await this.pauseAttach();
    try {
      await new AttachAvatarUploadUseCase(this.repository, this.unitOfWork).execute(
        new AttachAvatarUploadCommand(params),
      );
    } catch (error) {
      if (error instanceof FilesError) {
        const avatarError =
          error.code === FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND
            ? new AvatarFileNotFoundError()
            : [FilesErrorCode.INVALID_IMAGE_SIZE, FilesErrorCode.UNSUPPORTED_IMAGE_CONTENT_TYPE].includes(
                  error.code,
                )
              ? new InvalidAvatarImageError()
              : new AvatarFileStateConflictError();
        throw avatarError;
      }
      throw error;
    }
    this.maybeLose('attach');
  }
  async scheduleAttachedFileDeletion(params: AvatarFileParams) {
    await this.deletion.execute(new ScheduleAttachedFileDeletionCommand(params));
    this.maybeLose('delete');
  }
  private maybeLose(operation: string) {
    if (this.loseNext === operation) {
      this.loseNext = null;
      throw new AvatarFilesUnavailableError();
    }
  }
}

describe.runIf(Boolean(adminUrl))('SetAvatar across PostgreSQL databases and DBOS', () => {
  let admin: Client;
  const names: string[] = [];
  let usersUrl: string;
  let filesUrl: string;
  let prisma: PrismaService;
  let files: FilesPrismaService;
  let repository: PrismaFilesRepository;
  let deletion: ScheduleAttachedFileDeletionUseCase;
  let gateway: FilesGateway;
  let workflow: DbosSetAvatarWorkflow;

  async function createDatabase(app: string): Promise<string> {
    const name = `avatar_${app.replace('-', '_')}_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    names.push(name);
    const url = new URL(adminUrl!);
    url.pathname = `/${name}`;
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const migrations = resolve(`apps/${app}/prisma/migrations`);
      for (const entry of (await readdir(migrations, { withFileTypes: true }))
        .filter((item) => item.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))) {
        await client.query(await readFile(resolve(migrations, entry.name, 'migration.sql'), 'utf8'));
      }
    } finally {
      await client.end();
    }
    return url.toString();
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    usersUrl = await createDatabase('user-accounts');
    filesUrl = await createDatabase('files');
    prisma = new PrismaService({ url: usersUrl });
    files = new FilesPrismaService({ url: filesUrl });
    await PrismaDataSource.initializeDBOSSchema(prisma);
    repository = new PrismaFilesRepository(files);
    deletion = new ScheduleAttachedFileDeletionUseCase(
      repository,
      new PrismaFileDeletionJobsRepository(files),
      new PrismaUnitOfWork(files),
    );
    gateway = new FilesGateway(repository, deletion, new PrismaUnitOfWork(files));
    workflow = new DbosSetAvatarWorkflow(new UserAccountsDbosDataSource(prisma), gateway);
    DBOS.setConfig({
      name: 'avatar-integration',
      applicationVersion: 'set-avatar-v1-test',
      executorID: 'avatar-test-main',
      systemDatabaseUrl: usersUrl,
      runMigrations: true,
      useListenNotify: false,
      logLevel: 'error',
    });
    await DBOS.launch();
  }, 60_000);

  beforeEach(async () => {
    gateway.loseNext = null;
    gateway.pauseAttach = null;
    await files.fileDeletionJob.deleteMany();
    await files.file.deleteMany();
    await files.imageUploadReservation.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: {
        id: userId,
        username: 'avatar-test',
        email: 'avatar@example.com',
        createdAt: new Date(),
        isConfirmed: true,
      },
    });
  });

  afterAll(async () => {
    if (DBOS.isInitialized()) await DBOS.shutdown({ deregister: true });
    await prisma?.$disconnect();
    await files?.$disconnect();
    for (const name of names) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin?.end();
  }, 60_000);

  async function newFile(overrides: Record<string, unknown> = {}) {
    const id = randomUUID();
    return files.file.create({
      data: {
        id,
        userId,
        objectKey: `users/${userId}/images/${id}`,
        originalFilename: 'avatar.png',
        contentType: 'image/png',
        size: 10 * 1024 * 1024,
        uploadStatus: 'COMPLETED',
        uploadExpiresAt: new Date(),
        uploadedAt: new Date(),
        ...overrides,
      },
    });
  }
  const params = (fileId: string) => ({ userId, fileId, workflowId: `set-avatar:${userId}:${randomUUID()}` });

  it('installs before profile completion, replaces, preserves personal fields and replays old keys', async () => {
    const first = await newFile();
    const firstParams = params(first.id);
    await Promise.all([workflow.execute(firstParams), workflow.execute(firstParams)]);
    await prisma.profile.update({ where: { userId }, data: { firstName: 'Alice', aboutMe: 'Kept' } });
    const second = await newFile({ contentType: 'image/jpeg', size: 1 });
    await workflow.execute(params(second.id));
    await workflow.execute(firstParams);
    await workflow.execute(params(second.id));
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      avatarFileId: second.id,
      avatarUpdateId: null,
      firstName: 'Alice',
      aboutMe: 'Kept',
    });
    expect(await files.file.findUnique({ where: { id: second.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
      deletedAt: null,
    });
    expect(await repository.findAvailableById({ id: second.id })).toMatchObject({ id: second.id });
    expect(await files.fileDeletionJob.count({ where: { fileId: first.id } })).toBe(1);
    await deletion.execute(new ScheduleAttachedFileDeletionCommand({ userId, fileId: first.id }));
    expect(await files.fileDeletionJob.count()).toBe(1);
    await expect(workflow.execute({ ...firstParams, fileId: second.id })).rejects.toMatchObject({
      code: Code.AVATAR_IDEMPOTENCY_KEY_CONFLICT,
    });
  });

  it.each([
    { overrides: { size: 10 * 1024 * 1024 + 1 }, code: Code.INVALID_AVATAR_IMAGE },
    { overrides: { contentType: 'image/webp' }, code: Code.INVALID_AVATAR_IMAGE },
    { overrides: { userId: 99 }, code: Code.AVATAR_FILE_NOT_FOUND },
    { overrides: { deletedAt: new Date() }, code: Code.AVATAR_FILE_NOT_FOUND },
    { overrides: { uploadStatus: 'PENDING' }, code: Code.AVATAR_FILE_STATE_CONFLICT },
    { overrides: { uploadStatus: 'ATTACHED' }, code: Code.AVATAR_FILE_STATE_CONFLICT },
  ])('rejects $code, preserves the current avatar and unlocks', async ({ overrides, code }) => {
    const old = await newFile({ uploadStatus: 'ATTACHED' });
    await prisma.profile.create({ data: { userId, avatarFileId: old.id } });
    const file = await newFile(overrides);
    const input = params(file.id);
    await expect(workflow.execute(input)).rejects.toMatchObject({ code });
    await expect(workflow.execute(input)).rejects.toMatchObject({ code });
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      avatarFileId: old.id,
      avatarUpdateId: null,
    });
    expect(await files.fileDeletionJob.count()).toBe(0);
    expect(await files.imageUploadReservation.count()).toBe(0);
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: file.uploadStatus,
      reservationId: null,
      attachmentOperationId: null,
    });
  });

  it('rejects concurrent replacement while allowing personal information edits', async () => {
    const first = await newFile();
    const second = await newFile();
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const attached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    gateway.pauseAttach = () => {
      arrived();
      return paused;
    };
    const running = workflow.execute(params(first.id));
    try {
      await attached;
      await expect(workflow.execute(params(second.id))).rejects.toMatchObject({
        code: Code.AVATAR_UPDATE_CONFLICT,
      });
      await prisma.profile.update({ where: { userId }, data: { firstName: 'Bob' } });
    } finally {
      release();
    }
    await running;
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      firstName: 'Bob',
      avatarFileId: first.id,
      avatarUpdateId: null,
    });
    expect(await files.file.count({ where: { attachmentOperationId: { not: null } } })).toBe(1);
    expect(await files.imageUploadReservation.count()).toBe(0);
  });

  it.each([null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])(
    'does not overwrite a released or replaced lock (%s) during compensation',
    async (avatarUpdateId) => {
      const old = await newFile({ uploadStatus: 'ATTACHED' });
      await prisma.profile.create({ data: { userId, avatarFileId: old.id } });
      const file = await newFile();
      gateway.pauseAttach = async () => {
        await prisma.profile.update({ where: { userId }, data: { avatarUpdateId } });
        throw new InvalidAvatarImageError();
      };

      await expect(workflow.execute(params(file.id))).rejects.toMatchObject({
        code: Code.INVALID_AVATAR_IMAGE,
      });

      expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
        avatarFileId: old.id,
        avatarUpdateId,
      });
      expect(await files.fileDeletionJob.count()).toBe(0);
      expect(await files.imageUploadReservation.count()).toBe(0);
    },
  );

  it.each([null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])(
    'does not change the avatar or schedule deletion when lock ownership is lost (%s)',
    async (avatarUpdateId) => {
      const old = await newFile({ uploadStatus: 'ATTACHED' });
      await prisma.profile.create({ data: { userId, avatarFileId: old.id } });
      const file = await newFile();
      gateway.pauseAttach = async () => {
        await prisma.profile.update({ where: { userId }, data: { avatarUpdateId } });
      };

      await expect(workflow.execute(params(file.id))).rejects.toMatchObject({ code: 'P2025' });

      expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
        avatarFileId: old.id,
        avatarUpdateId,
      });
      expect(await files.fileDeletionJob.count()).toBe(0);
      expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
        uploadStatus: 'ATTACHED',
        deletedAt: null,
      });
    },
  );

  it.each(['attach', 'delete'])(
    'records a lost %s response without retrying or compensating an unknown result',
    async (operation) => {
      const old = await newFile({ uploadStatus: 'ATTACHED' });
      await prisma.profile.create({ data: { userId, avatarFileId: old.id } });
      gateway.loseNext = operation;
      const file = await newFile();
      const input = params(file.id);
      await expect(workflow.execute(input)).rejects.toMatchObject({ code: Code.AVATAR_FILES_UNAVAILABLE });
      await expect(workflow.execute(input)).rejects.toMatchObject({ code: Code.AVATAR_FILES_UNAVAILABLE });
      expect(await files.file.count({ where: { attachmentOperationId: { not: null } } })).toBe(1);
      expect(await files.imageUploadReservation.count()).toBe(0);
      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
      expect(profile.avatarUpdateId).not.toBeNull();
      expect(profile.avatarFileId).toBe(operation === 'delete' ? file.id : old.id);
      expect(await files.fileDeletionJob.count()).toBe(operation === 'delete' ? 1 : 0);
    },
  );

  it('waits for attachment to complete and replays the successful result', async () => {
    const file = await newFile();
    const input = params(file.id);
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const attaching = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    gateway.pauseAttach = () => {
      arrived();
      return paused;
    };
    const settled = vi.fn();
    const running = workflow.execute(input).then(settled);
    try {
      await attaching;
      expect(settled).not.toHaveBeenCalled();
      expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({ avatarFileId: null });
    } finally {
      release();
    }
    await running;
    expect(settled).toHaveBeenCalledTimes(1);
    await workflow.execute(input);
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      avatarFileId: file.id,
      avatarUpdateId: null,
    });
    expect(await files.file.count({ where: { attachmentOperationId: { not: null } } })).toBe(1);
    expect(await files.imageUploadReservation.count()).toBe(0);
  });

  it('compensates an attached file when the user was deleted before commit', async () => {
    const file = await newFile();
    gateway.pauseAttach = async () => {
      await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    };
    await expect(workflow.execute(params(file.id))).rejects.toMatchObject({ code: Code.USER_NOT_FOUND });
    expect(await files.fileDeletionJob.count({ where: { fileId: file.id } })).toBe(1);
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      avatarFileId: null,
      avatarUpdateId: null,
    });
  });

  it('rolls back soft deletion when enqueuing fails and never deletes a foreign file', async () => {
    const file = await newFile({ uploadStatus: 'ATTACHED' });
    const failing = new ScheduleAttachedFileDeletionUseCase(
      repository,
      {
        addMany: () => Promise.reject(new Error('enqueue failed')),
      } as unknown as PrismaFileDeletionJobsRepository,
      new PrismaUnitOfWork(files),
    );
    await expect(
      failing.execute(new ScheduleAttachedFileDeletionCommand({ userId, fileId: file.id })),
    ).rejects.toThrow('enqueue failed');
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({ deletedAt: null });
    await deletion.execute(new ScheduleAttachedFileDeletionCommand({ userId: 99, fileId: file.id }));
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({ deletedAt: null });
    expect(await files.fileDeletionJob.count()).toBe(0);
  });

  it('atomically deduplicates concurrent attachment and rejects operation ID reuse', async () => {
    const file = await newFile();
    const other = await newFile();
    const attach = new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files));
    const input = { userId, fileId: file.id, operationId: randomUUID() };
    await Promise.all([
      attach.execute(new AttachAvatarUploadCommand(input)),
      attach.execute(new AttachAvatarUploadCommand(input)),
    ]);
    expect(await files.file.count({ where: { attachmentOperationId: { not: null } } })).toBe(1);
    expect(await files.imageUploadReservation.count()).toBe(0);
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
      reservationId: null,
      attachmentOperationId: input.operationId,
      deletedAt: null,
    });
    await expect(
      attach.execute(new AttachAvatarUploadCommand({ ...input, fileId: other.id })),
    ).rejects.toMatchObject({ code: FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT });
    await expect(
      attach.execute(new AttachAvatarUploadCommand({ ...input, userId: 99 })),
    ).rejects.toMatchObject({ code: FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND });
    expect(await files.file.findUnique({ where: { id: other.id } })).toMatchObject({
      uploadStatus: 'COMPLETED',
      reservationId: null,
      attachmentOperationId: null,
    });
    await deletion.execute(new ScheduleAttachedFileDeletionCommand({ userId, fileId: file.id }));
    await expect(attach.execute(new AttachAvatarUploadCommand(input))).resolves.toBeUndefined();
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      deletedAt: expect.any(Date) as Date,
      attachmentOperationId: input.operationId,
    });
    // После физического удаления теряется и информация о выполненном прикреплении.
    await files.fileDeletionJob.deleteMany();
    await files.file.delete({ where: { id: file.id } });
    await expect(attach.execute(new AttachAvatarUploadCommand(input))).rejects.toMatchObject({
      code: FilesErrorCode.IMAGE_UPLOAD_NOT_FOUND,
    });
    expect(await files.file.findUnique({ where: { id: file.id } })).toBeNull();
  });

  it('allows only one file to claim an attachment operation concurrently', async () => {
    const first = await newFile();
    const second = await newFile();
    const operationId = randomUUID();
    const attach = new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files));
    const results = await Promise.allSettled(
      [first.id, second.id].map((fileId) =>
        attach.execute(new AttachAvatarUploadCommand({ userId, fileId, operationId })),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { code: FilesErrorCode.IMAGE_UPLOAD_RESERVATION_CONFLICT },
    });
    expect(await files.file.count({ where: { attachmentOperationId: operationId } })).toBe(1);
    expect(
      await files.file.count({ where: { uploadStatus: 'COMPLETED', attachmentOperationId: null } }),
    ).toBe(1);
    expect(await files.imageUploadReservation.count()).toBe(0);
  });

  it('allows only one avatar operation to attach the same file concurrently', async () => {
    const file = await newFile();
    const operationIds = [randomUUID(), randomUUID()];
    const attach = new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files));
    const results = await Promise.allSettled(
      operationIds.map((operationId) =>
        attach.execute(new AttachAvatarUploadCommand({ userId, fileId: file.id, operationId })),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { code: FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT },
    });
    const attached = await files.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(operationIds).toContain(attached.attachmentOperationId);
    expect(attached.reservationId).toBeNull();
    expect(await files.imageUploadReservation.count()).toBe(0);
  });

  it('rolls back the attachment marker on invalid metadata and permits a later valid attempt', async () => {
    const file = await newFile({ size: 20 * 1024 * 1024 });
    const valid = await newFile();
    const operationId = randomUUID();
    const attach = new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files));
    await expect(
      attach.execute(new AttachAvatarUploadCommand({ userId, fileId: file.id, operationId })),
    ).rejects.toMatchObject({ code: FilesErrorCode.INVALID_IMAGE_SIZE });
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: 'COMPLETED',
      attachmentOperationId: null,
      reservationId: null,
    });
    await expect(
      attach.execute(new AttachAvatarUploadCommand({ userId, fileId: valid.id, operationId })),
    ).resolves.toBeUndefined();
    expect(await files.file.findUnique({ where: { id: valid.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
      attachmentOperationId: operationId,
      reservationId: null,
    });
  });

  it('keeps the post reservation lifecycle independent from avatar attachment markers', async () => {
    const file = await newFile();
    const reservationId = randomUUID();
    await repository.reserveImageUploads({ userId, uploadIds: [file.id], reservationId });
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: 'RESERVED',
      reservationId,
      attachmentOperationId: null,
    });
    await repository.releaseReservedImageUploads({ userId, reservationId });
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: 'COMPLETED',
      reservationId: null,
      attachmentOperationId: null,
    });
    const nextReservationId = randomUUID();
    await repository.reserveImageUploads({ userId, uploadIds: [file.id], reservationId: nextReservationId });
    await repository.attachReservedImageUploads({ userId, reservationId: nextReservationId });
    expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
      uploadStatus: 'ATTACHED',
      reservationId: nextReservationId,
      attachmentOperationId: null,
    });
    const attach = new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files));
    await expect(
      attach.execute(new AttachAvatarUploadCommand({ userId, fileId: file.id, operationId: randomUUID() })),
    ).rejects.toMatchObject({ code: FilesErrorCode.IMAGE_UPLOAD_STATE_CONFLICT });
  });

  it('allows only one winner against a post reservation or expired-upload cleanup', async () => {
    const file = await newFile();
    const results = await Promise.allSettled([
      new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files)).execute(
        new AttachAvatarUploadCommand({ userId, fileId: file.id, operationId: randomUUID() }),
      ),
      repository.reserveImageUploads({ userId, uploadIds: [file.id], reservationId: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const expired = await newFile({ uploadedAt: new Date(0) });
    const now = new Date();
    await Promise.allSettled([
      new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files)).execute(
        new AttachAvatarUploadCommand({ userId, fileId: expired.id, operationId: randomUUID() }),
      ),
      repository.claimExpiredImageUploads({
        pendingExpiredBefore: now,
        completedBefore: now,
        rejectedBefore: now,
        retryBefore: now,
        claimedAt: now,
        limit: 100,
      }),
    ]);
    const result = await files.file.findUniqueOrThrow({ where: { id: expired.id } });
    expect(result.uploadStatus === 'ATTACHED' && result.deletedAt !== null).toBe(false);
  });

  it.each(['ATTACHED', 'RESERVED'] as const)(
    'skips a file locked by a concurrent transition to %s',
    async (uploadStatus) => {
      const expired = await newFile({ uploadedAt: new Date(0) });
      const now = new Date();
      let release!: () => void;
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      let acquired!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const changing = files.$transaction(async (tx) => {
        await tx.file.update({ where: { id: expired.id }, data: { uploadStatus } });
        acquired();
        await paused;
      });
      try {
        await locked;
        expect(
          await repository.claimExpiredImageUploads({
            pendingExpiredBefore: now,
            completedBefore: now,
            rejectedBefore: now,
            retryBefore: now,
            claimedAt: now,
            limit: 100,
          }),
        ).toEqual([]);
      } finally {
        release();
        await changing;
      }
      expect(await files.file.findUnique({ where: { id: expired.id } })).toMatchObject({
        uploadStatus,
        deletedAt: null,
      });
    },
  );

  it('claims disjoint limited batches and respects cleanup eligibility and retry times', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);
    const expired = await Promise.all([
      newFile({ uploadedAt: cutoff }),
      newFile({ uploadStatus: 'PENDING', uploadExpiresAt: cutoff }),
      newFile({ uploadStatus: 'REJECTED', updatedAt: cutoff }),
      newFile({ uploadedAt: cutoff, deletedAt: cutoff }),
    ]);
    const protectedFiles = await Promise.all([
      newFile({ uploadedAt: future }),
      newFile({ uploadStatus: 'PENDING', uploadExpiresAt: future }),
      newFile({ uploadStatus: 'REJECTED', updatedAt: future }),
      newFile({ uploadedAt: cutoff, deletedAt: now }),
      newFile({ uploadStatus: 'RESERVED', uploadedAt: cutoff }),
      newFile({ uploadStatus: 'ATTACHED', uploadedAt: cutoff }),
    ]);
    const input = {
      pendingExpiredBefore: cutoff,
      completedBefore: cutoff,
      rejectedBefore: cutoff,
      retryBefore: cutoff,
      claimedAt: now,
      limit: 2,
    };
    const batches = await Promise.all([
      repository.claimExpiredImageUploads(input),
      repository.claimExpiredImageUploads(input),
    ]);
    expect(batches.map((batch) => batch.length)).toEqual([2, 2]);
    const initiallyClaimed = batches.flat().map((file) => file.id);
    expect(new Set(initiallyClaimed).size).toBe(initiallyClaimed.length);
    expect(
      batches
        .flat()
        .map((file) => file.id)
        .sort(),
    ).toEqual(expired.map((file) => file.id).sort());
    expect(await repository.claimExpiredImageUploads(input)).toEqual([]);
    for (const file of protectedFiles) {
      expect(await files.file.findUnique({ where: { id: file.id } })).toMatchObject({
        uploadStatus: file.uploadStatus,
        deletedAt: file.deletedAt,
      });
    }
    const claimed = batches.flat()[0];
    expect(await repository.deleteClaimedImageUpload({ uploadId: claimed.id, claimedAt: cutoff })).toBe(
      false,
    );
    expect(await repository.deleteClaimedImageUpload({ uploadId: claimed.id, claimedAt: now })).toBe(true);
  });

  it.each(['after-attach', 'after-commit'])(
    'recovers after process death %s using the original operation and checkpoints',
    async (crashAt) => {
      const old = await newFile({ uploadStatus: 'ATTACHED' });
      await prisma.profile.create({ data: { userId, avatarFileId: old.id, firstName: 'Kept' } });
      const file = await newFile();
      const input = params(file.id);
      const run = (mode: string) =>
        new Promise<{ code: number | null; signal: string | null }>((resolveResult, reject) => {
          const child = spawn(
            process.execPath,
            ['apps/user-accounts/test/fixtures/avatar-recovery-process.mjs'],
            {
              env: {
                ...process.env,
                AVATAR_USERS_URL: usersUrl,
                AVATAR_FILES_URL: filesUrl,
                AVATAR_WORKFLOW_INPUT: JSON.stringify(input),
                AVATAR_CRASH_AT: mode,
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
            reject(new Error(`Recovery process timed out: ${output}`));
          }, 25_000);
          child.once('exit', (code, signal) => {
            clearTimeout(timer);
            if (code && code !== 0) reject(new Error(output));
            else resolveResult({ code, signal });
          });
        });
      expect((await run(crashAt)).signal).toBe('SIGKILL');
      const locked = await prisma.profile.findUniqueOrThrow({ where: { userId } });
      expect(locked.avatarUpdateId).not.toBeNull();
      expect((await run('recover')).code).toBe(0);
      expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
        avatarFileId: file.id,
        avatarUpdateId: null,
        firstName: 'Kept',
      });
      const attachedFile = await files.file.findUniqueOrThrow({ where: { id: file.id } });
      expect(attachedFile.attachmentOperationId).toBe(locked.avatarUpdateId);
      expect(attachedFile.reservationId).toBeNull();
      expect(await files.file.count({ where: { attachmentOperationId: { not: null } } })).toBe(1);
      expect(await files.imageUploadReservation.count()).toBe(0);
      expect(await files.fileDeletionJob.count({ where: { fileId: old.id } })).toBe(1);
    },
    60_000,
  );
});
