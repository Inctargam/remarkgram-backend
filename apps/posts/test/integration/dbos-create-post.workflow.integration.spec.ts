import { randomUUID } from 'node:crypto';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FilesServiceUnavailableError,
  PostIdempotencyKeyConflictError,
  PostImagesNotAvailableError,
} from '../../src/application/errors/create-post.errors.js';
import { FilesGateway } from '../../src/application/ports/files.gateway.js';
import type { PostImageAttachmentParams } from '../../src/application/types/posts.types.js';
import { DbosCreatePostWorkflow } from '../../src/infrastructure/dbos/dbos-create-post.workflow.js';
import { PostsDbosDataSource } from '../../src/infrastructure/dbos/posts-dbos.datasource.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

const databaseUrl = process.env.POSTS_DBOS_INTEGRATION_DATABASE_URL?.trim();
const TEST_AUTHOR_ID = 2_000_000_001;

type OperationKind = 'ATTACH' | 'CANCEL';
type RecordedCall = { kind: OperationKind; operationId: string; fileIds: readonly string[] };

/** Transport fault injection; atomic Files operations are covered by PostgreSQL repository tests. */
class AttachmentBackedFilesGateway extends FilesGateway {
  readonly failures = new Map<OperationKind, Error>();
  private readonly operations = new Map<
    string,
    { userId: number; fileIds: readonly string[]; state: 'ATTACHED' | 'CANCELLED' }
  >();
  private readonly responsesToLose = new Set<OperationKind>();
  private readonly calls: RecordedCall[] = [];

  loseNextResponse(kind: OperationKind): void {
    this.responsesToLose.add(kind);
  }
  reset(): void {
    this.failures.clear();
    this.operations.clear();
    this.responsesToLose.clear();
    this.calls.length = 0;
  }
  getCalls(kind: OperationKind): readonly RecordedCall[] {
    return this.calls.filter((call) => call.kind === kind);
  }

  attachPostImages(params: PostImageAttachmentParams): Promise<void> {
    this.record('ATTACH', params);
    const existing = this.operations.get(params.operationId);
    if (existing?.state === 'CANCELLED') throw new PostImagesNotAvailableError();
    if (!existing) this.operations.set(params.operationId, { ...params, state: 'ATTACHED' });
    this.maybeLoseResponse('ATTACH');
    return Promise.resolve();
  }

  cancelPostImageAttachment(params: PostImageAttachmentParams): Promise<void> {
    this.record('CANCEL', params);
    this.operations.set(params.operationId, { ...params, state: 'CANCELLED' });
    this.maybeLoseResponse('CANCEL');
    return Promise.resolve();
  }

  private record(kind: OperationKind, params: PostImageAttachmentParams): void {
    this.calls.push({ kind, operationId: params.operationId, fileIds: params.fileIds });
    const failure = this.failures.get(kind);
    if (failure) throw failure;
    const existing = this.operations.get(params.operationId);
    if (
      existing &&
      (existing.userId !== params.userId ||
        JSON.stringify(existing.fileIds) !== JSON.stringify(params.fileIds))
    ) {
      throw new Error('Operation parameters changed');
    }
  }

  private maybeLoseResponse(kind: OperationKind): void {
    if (this.responsesToLose.delete(kind)) throw new FilesServiceUnavailableError();
  }
}

function requireDatabaseUrl(): string {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('POSTS_DBOS_INTEGRATION_DATABASE_URL is required');
  }
  return databaseUrl;
}

describe.runIf(databaseUrl !== undefined && databaseUrl.length > 0)(
  'DbosCreatePostWorkflow with PostgreSQL',
  () => {
    let prisma: PrismaService;
    let workflow: DbosCreatePostWorkflow;
    let filesGateway: AttachmentBackedFilesGateway;
    const workflowIds = new Set<string>();

    beforeAll(async () => {
      const url = requireDatabaseUrl();
      prisma = new PrismaService({ url });

      const [{ postsTable, postImagesTable }] = await prisma.$queryRawUnsafe<
        Array<{ postsTable: string | null; postImagesTable: string | null }>
      >(
        `SELECT
           to_regclass('public.posts')::text AS "postsTable",
           to_regclass('public.post_images')::text AS "postImagesTable"`,
      );

      if (postsTable === null || postImagesTable === null) {
        throw new Error('Posts migrations are missing. Prepare the disposable integration database first.');
      }

      await PrismaDataSource.initializeDBOSSchema(prisma);

      filesGateway = new AttachmentBackedFilesGateway();
      workflow = new DbosCreatePostWorkflow(new PostsDbosDataSource(prisma), filesGateway);

      DBOS.setConfig({
        name: 'remarkgram-posts-dbos-integration',
        applicationVersion: 'create-post-v2-integration',
        executorID: 'remarkgram-posts-dbos-integration-singleton',
        systemDatabaseUrl: url,
        systemDatabasePoolSize: 4,
        runMigrations: true,
        useListenNotify: false,
        logLevel: 'error',
      });
      await DBOS.launch();
    }, 60_000);

    beforeEach(async () => {
      filesGateway.reset();
      await prisma.post.deleteMany({ where: { authorId: TEST_AUTHOR_ID } });
    });

    afterEach(async () => {
      const completedWorkflowIds = [...workflowIds];
      workflowIds.clear();

      if (completedWorkflowIds.length > 0) {
        await DBOS.deleteWorkflows(completedWorkflowIds);
        for (const workflowId of completedWorkflowIds) {
          await prisma.$executeRawUnsafe(
            'DELETE FROM "dbos"."transaction_completion" WHERE workflow_id = $1',
            workflowId,
          );
        }
      }

      await prisma.post.deleteMany({ where: { authorId: TEST_AUTHOR_ID } });
    });

    afterAll(async () => {
      if (DBOS.isInitialized()) {
        await DBOS.shutdown({ deregister: true });
      }
      await prisma?.$disconnect();
    }, 60_000);

    it('creates one published Post for repeated calls with the same workflow ID', async () => {
      const params = createWorkflowParams();
      workflowIds.add(params.workflowId);

      const [firstResult, concurrentResult] = await Promise.all([
        workflow.execute(params),
        workflow.execute(params),
      ]);
      const sequentialReplay = await workflow.execute(params);

      expect(concurrentResult).toEqual(firstResult);
      expect(sequentialReplay).toEqual(firstResult);
      expect(typeof firstResult.id).toBe('number');

      const posts = await prisma.post.findMany({
        where: { authorId: TEST_AUTHOR_ID },
        include: { images: { orderBy: { position: 'asc' } } },
      });
      expect(posts).toHaveLength(1);
      expect(posts[0]?.publishedAt).not.toBeNull();
      expect(posts[0]?.images.map(({ fileId, position }) => ({ fileId, position }))).toEqual(
        params.fileIds.map((fileId, position) => ({ fileId, position })),
      );
    }, 30_000);

    it('stores fileIds in workflow input and replays the result without repeated Files calls', async () => {
      const params = createWorkflowParams();
      workflowIds.add(params.workflowId);
      const { workflowId, ...input } = params;
      const handle = await DBOS.startWorkflow(workflow, { workflowID: workflowId }).createPost(input);
      const original = await handle.getResult();
      expect((await handle.getStatus())?.input).toEqual([input]);

      await expect(workflow.execute(params)).resolves.toEqual(original);
      expect(filesGateway.getCalls('ATTACH')).toHaveLength(1);
      expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(1);
    });

    it('rejects the same workflow ID with another request hash', async () => {
      const params = createWorkflowParams();
      workflowIds.add(params.workflowId);

      await workflow.execute(params);

      await expect(workflow.execute({ ...params, requestHash: randomUUID() })).rejects.toBeInstanceOf(
        PostIdempotencyKeyConflictError,
      );
      expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(1);
    }, 30_000);

    it('retries compensation after losing the cancel response', async () => {
      const params = createWorkflowParams();
      workflowIds.add(params.workflowId);
      filesGateway.failures.set('ATTACH', new PostImagesNotAvailableError());
      filesGateway.loseNextResponse('CANCEL');
      await expect(workflow.execute(params)).rejects.toBeInstanceOf(PostImagesNotAvailableError);
      const calls = filesGateway.getCalls('CANCEL');
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual(calls[1]);
      expect(filesGateway.getCalls('ATTACH')).toHaveLength(1);
      expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(0);
    });

    it.each(['ATTACH', 'CANCEL'] as const)(
      'exhausts %s retries and replays unavailability without further calls',
      async (kind) => {
        const params = createWorkflowParams();
        workflowIds.add(params.workflowId);
        filesGateway.failures.set(kind, new FilesServiceUnavailableError());
        if (kind === 'CANCEL') {
          filesGateway.failures.set('ATTACH', new PostImagesNotAvailableError());
        }
        await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);
        expect(filesGateway.getCalls(kind)).toHaveLength(3);
        expect(new Set(filesGateway.getCalls(kind).map((call) => call.operationId)).size).toBe(1);
        await expect(workflow.execute(params)).rejects.toBeInstanceOf(FilesServiceUnavailableError);
        expect(filesGateway.getCalls(kind)).toHaveLength(3);
        const posts = await prisma.post.findMany({ where: { authorId: TEST_AUTHOR_ID } });
        expect(posts).toHaveLength(1);
        if (posts[0]) expect(posts[0].publishedAt).toBeNull();
        if (kind !== 'CANCEL') expect(filesGateway.getCalls('CANCEL')).toHaveLength(0);
      },
      30_000,
    );

    it.each([new PostImagesNotAvailableError(), new Error('unexpected Files error')])(
      'does not retry a non-transient attach error: %s',
      async (error) => {
        const params = createWorkflowParams();
        workflowIds.add(params.workflowId);
        filesGateway.failures.set('ATTACH', error);
        await expect(workflow.execute(params)).rejects.toMatchObject({ message: error.message });
        expect(filesGateway.getCalls('ATTACH')).toHaveLength(1);
        expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(
          error instanceof PostImagesNotAvailableError ? 0 : 1,
        );
      },
    );

    it.each(['ATTACH'] as const)(
      'retries %s with the same operation ID after the Files response is lost',
      async (kind) => {
        const params = createWorkflowParams();
        workflowIds.add(params.workflowId);
        filesGateway.loseNextResponse(kind);

        const result = await workflow.execute(params);
        expect(typeof result.id).toBe('number');

        const calls = filesGateway.getCalls(kind);
        expect(calls).toHaveLength(2);
        expect(new Set(calls.map(({ operationId }) => operationId)).size).toBe(1);
        expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(1);
      },
      30_000,
    );
  },
);

function createWorkflowParams() {
  return {
    workflowId: `integration:create-post:${randomUUID()}`,
    requestHash: randomUUID(),
    userId: TEST_AUTHOR_ID,
    description: 'DBOS integration test',
    fileIds: [randomUUID(), randomUUID()],
  };
}
