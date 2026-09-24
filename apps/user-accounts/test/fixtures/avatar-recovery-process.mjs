import { PgBoss } from 'pg-boss';
import { PgBossAvatarDeletionOutbox } from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/users/infrastructure/pg-boss/pg-boss-avatar-deletion.outbox.js';
import {
  AVATAR_DELETION_QUEUE,
  avatarDeletionBossOptions,
} from '../../../../dist/apps/user-accounts/apps/user-accounts/src/features/users/infrastructure/pg-boss/avatar-deletion-queue.options.js';
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
  const result = await transaction(callback, config);
  if (config.name === 'updateProfileAvatar' && process.env.AVATAR_CRASH_AT === 'after-commit')
    process.kill(process.pid, 'SIGKILL');
  if (config.name === 'scheduleFileDeletion' && process.env.AVATAR_CRASH_AT === 'after-enqueue')
    process.kill(process.pid, 'SIGKILL');
  return result;
};
const boss = new PgBoss({ ...avatarDeletionBossOptions, connectionString: process.env.AVATAR_USERS_URL });
const queue = new PgBossAvatarDeletionOutbox(boss, {
  publish: (event) => deletion.execute({ params: event.data }),
});
await queue.start();
const workflow = new DbosSetAvatarWorkflow(
  dataSource,
  {
    attachAvatarUpload: async (params) => {
      await new AttachAvatarUploadUseCase(repository, new PrismaUnitOfWork(files)).execute({ params });
      if (process.env.AVATAR_CRASH_AT === 'after-attach') process.kill(process.pid, 'SIGKILL');
    },
  },
  queue,
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
  while ((await boss.findJobs(AVATAR_DELETION_QUEUE)).some((job) => job.state !== 'completed')) {
    if (Date.now() > deadline) throw new Error('Publication did not complete');
    queue.wake();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
} finally {
  await DBOS.shutdown();
  await queue.stop();
  await prisma.$disconnect();
  await files.$disconnect();
}
