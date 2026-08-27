import { randomUUID } from 'node:crypto';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ImageUploadsServiceUnavailableError,
  PostIdempotencyKeyConflictError,
} from '../../src/application/errors/create-post.errors.js';
import { ImageUploadsGateway } from '../../src/application/ports/image-uploads.gateway.js';
import type {
  AttachReservedImageUploadsParams,
  ReleaseReservedImageUploadsParams,
  ReserveImageUploadsParams,
} from '../../src/application/types/posts.types.js';
import { DbosCreatePostWorkflow } from '../../src/infrastructure/dbos/dbos-create-post.workflow.js';
import { PostsDbosDataSource } from '../../src/infrastructure/dbos/posts-dbos.datasource.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

const databaseUrl = process.env.POSTS_DBOS_INTEGRATION_DATABASE_URL?.trim();
const TEST_AUTHOR_ID = 2_000_000_001;

type OperationKind = 'RESERVE' | 'ATTACH' | 'RELEASE';
type ReservationState = 'RESERVED' | 'ATTACHED' | 'RELEASED';

type RecordedCall = {
  kind: OperationKind;
  reservationId: string;
};

type Reservation = {
  userId: number;
  uploadIds: readonly string[];
  state: ReservationState;
};

/** Минимальная идемпотентная модель Files для проверки сетевого окна после commit. */
class ReservationBackedImageUploadsGateway extends ImageUploadsGateway {
  private readonly reservations = new Map<string, Reservation>();
  private readonly responsesToLose = new Set<OperationKind>();
  private readonly calls: RecordedCall[] = [];

  loseNextResponse(kind: OperationKind): void {
    this.responsesToLose.add(kind);
  }

  reset(): void {
    this.reservations.clear();
    this.responsesToLose.clear();
    this.calls.length = 0;
  }

  getCalls(kind: OperationKind): readonly RecordedCall[] {
    return this.calls.filter((call) => call.kind === kind);
  }

  reserveImageUploads(params: ReserveImageUploadsParams): Promise<void> {
    this.calls.push({ kind: 'RESERVE', reservationId: params.reservationId });
    const uploadIds = [...params.imageIds].sort();
    const existing = this.reservations.get(params.reservationId);

    if (existing === undefined) {
      this.reservations.set(params.reservationId, {
        userId: params.userId,
        uploadIds,
        state: 'RESERVED',
      });
    } else if (
      existing.userId !== params.userId ||
      JSON.stringify(existing.uploadIds) !== JSON.stringify(uploadIds)
    ) {
      throw new Error(`Reservation ${params.reservationId} was reused with another payload`);
    }

    this.maybeLoseResponse('RESERVE');
    return Promise.resolve();
  }

  attachReservedImageUploads(params: AttachReservedImageUploadsParams): Promise<void> {
    this.calls.push({ kind: 'ATTACH', reservationId: params.reservationId });
    const reservation = this.reservations.get(params.reservationId);

    if (reservation?.state === 'RESERVED') {
      reservation.state = 'ATTACHED';
    } else if (reservation?.state !== 'ATTACHED') {
      throw new Error(`Reservation ${params.reservationId} is not available for attach`);
    }

    this.maybeLoseResponse('ATTACH');
    return Promise.resolve();
  }

  releaseReservedImageUploads(params: ReleaseReservedImageUploadsParams): Promise<void> {
    this.calls.push({ kind: 'RELEASE', reservationId: params.reservationId });
    const reservation = this.reservations.get(params.reservationId);

    if (reservation?.state === 'RESERVED') {
      reservation.state = 'RELEASED';
    } else if (reservation?.state !== 'RELEASED') {
      throw new Error(`Reservation ${params.reservationId} is not available for release`);
    }

    this.maybeLoseResponse('RELEASE');
    return Promise.resolve();
  }

  private maybeLoseResponse(kind: OperationKind): void {
    if (this.responsesToLose.delete(kind)) {
      // Side effect уже сохранён, но вызывающая сторона видит временную ошибку.
      throw new ImageUploadsServiceUnavailableError();
    }
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
    let imageUploadsGateway: ReservationBackedImageUploadsGateway;
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

      imageUploadsGateway = new ReservationBackedImageUploadsGateway();
      workflow = new DbosCreatePostWorkflow(new PostsDbosDataSource(prisma), imageUploadsGateway);

      DBOS.setConfig({
        name: 'remarkgram-posts-dbos-integration',
        applicationVersion: 'create-post-v1-integration',
        executorID: 'remarkgram-posts-dbos-integration-singleton',
        systemDatabaseUrl: url,
        systemDatabasePoolSize: 4,
        runMigrations: true,
        useListenNotify: false,
      });
      await DBOS.launch();
    }, 60_000);

    beforeEach(async () => {
      imageUploadsGateway.reset();
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
        params.imageIds.map((fileId, position) => ({ fileId, position })),
      );
    }, 30_000);

    it('rejects the same workflow ID with another request hash', async () => {
      const params = createWorkflowParams();
      workflowIds.add(params.workflowId);

      await workflow.execute(params);

      await expect(workflow.execute({ ...params, requestHash: randomUUID() })).rejects.toBeInstanceOf(
        PostIdempotencyKeyConflictError,
      );
      expect(await prisma.post.count({ where: { authorId: TEST_AUTHOR_ID } })).toBe(1);
    }, 30_000);

    it.each(['RESERVE', 'ATTACH'] as const)(
      'retries %s with the same reservation ID after the Files response is lost',
      async (kind) => {
        const params = createWorkflowParams();
        workflowIds.add(params.workflowId);
        imageUploadsGateway.loseNextResponse(kind);

        const result = await workflow.execute(params);
        expect(typeof result.id).toBe('number');

        const calls = imageUploadsGateway.getCalls(kind);
        expect(calls).toHaveLength(2);
        expect(new Set(calls.map(({ reservationId }) => reservationId)).size).toBe(1);
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
    imageIds: [randomUUID(), randomUUID()],
  };
}
