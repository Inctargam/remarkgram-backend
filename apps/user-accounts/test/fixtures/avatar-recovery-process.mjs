import { PrismaOutboxEventsRepository } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/outbox/infrastructure/persistence/repositories/prisma-outbox-events.repository.js';
import { OutboxWorker } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/outbox/application/workers/outbox.worker.js';
import { PrismaUnitOfWork as UsersUnitOfWork } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/database/prisma-unit-of-work.js';
// Run only against disposable databases created by set-avatar.integration.spec.ts.
// Build Files and user-accounts before this test so a real Node process can be killed/restarted.
import { DBOS } from '@dbos-inc/dbos-sdk';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { PrismaService } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/database/prisma.service.js';
import { UserAccountsDbosDataSource } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/users/infrastructure/dbos/user-accounts-dbos.datasource.js';
import { DbosSetAvatarWorkflow } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/users/infrastructure/dbos/dbos-set-avatar.workflow.js';
import { PrismaService as FilesPrismaService } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/prisma.service.js';
import { PrismaFilesRepository } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/repositories/prisma-files.repository.js';
import { PrismaFileDeletionJobsRepository } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/repositories/prisma-file-deletion-jobs.repository.js';
import { PrismaUnitOfWork } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/prisma-unit-of-work.js';
import { ScheduleAttachedFileDeletionUseCase } from '../../../../dist/apps/files/apps/files/src/application/use-cases/schedule-attached-file-deletion/schedule-attached-file-deletion.use-case.js';
import { AttachAvatarUploadUseCase } from '../../../../dist/apps/files/apps/files/src/application/use-cases/attach-avatar-upload/attach-avatar-upload.use-case.js';

const input = JSON.parse(process.env.AVATAR_WORKFLOW_INPUT);
const prisma = new PrismaService({ url: process.env.AVATAR_USERS_URL });
const files = new FilesPrismaService({ url: process.env.AVATAR_FILES_URL });
const repository = new PrismaFilesRepository(files);
const deletion = new ScheduleAttachedFileDeletionUseCase(
  repository,
  new PrismaFileDeletionJobsRepository(files),
  new PrismaUnitOfWork(files),
);
const dataSource = new UserAccountsDbosDataSource(prisma);
const transaction = dataSource.runTransaction.bind(dataSource);
dataSource.runTransaction = async (callback, config) => {
  const result = await transaction(async () => {
    const value = await callback();
    if (
      config.name === 'updateAvatarAndScheduleDeletion' &&
      process.env.AVATAR_CRASH_AT === 'before-profile-commit'
    )
      process.kill(process.pid, 'SIGKILL');
    return value;
  }, config);
  if (
    config.name === 'updateAvatarAndScheduleDeletion' &&
    process.env.AVATAR_CRASH_AT === 'after-profile-commit'
  )
    process.kill(process.pid, 'SIGKILL');
  return result;
};
const events = new PrismaOutboxEventsRepository(prisma);
const worker = new OutboxWorker(new UsersUnitOfWork(prisma), events, {
  publish: (event) => deletion.execute({ params: event.data }),
});
const workflow = new DbosSetAvatarWorkflow(
  dataSource,
  {
    attachAvatarUpload: async (params) => {
      await new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files)).execute({ params });
      if (process.env.AVATAR_CRASH_AT === 'after-attach') process.kill(process.pid, 'SIGKILL');
    },
  },
  events,
  worker,
);
await PrismaDataSource.initializeDBOSSchema(prisma);
DBOS.setConfig({
  name: 'avatar-integration',
  applicationVersion: 'set-avatar-v1-test',
  executorID: 'avatar-test-recovery',
  systemDatabaseUrl: process.env.AVATAR_USERS_URL,
  runMigrations: true,
  useListenNotify: false,
  logLevel: 'error',
});
try {
  await DBOS.launch();
  await workflow.execute(input);
  const deadline = Date.now() + 10000;
  while (await prisma.outboxEvent.count({ where: { publishedAt: null } })) {
    if (Date.now() > deadline) throw new Error('Publication did not complete');
    await worker.run();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
} finally {
  await DBOS.shutdown();
  await prisma.$disconnect();
  await files.$disconnect();
}
