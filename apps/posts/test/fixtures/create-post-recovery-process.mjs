// Only disposable databases created by create-post-recovery.integration.spec.ts.
import { DBOS } from '@dbos-inc/dbos-sdk';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { PrismaService } from '../../../../dist/apps/posts/apps/posts/src/infrastructure/prisma/prisma.service.js';
import { PostsDbosDataSource } from '../../../../dist/apps/posts/apps/posts/src/infrastructure/dbos/posts-dbos.datasource.js';
import { DbosCreatePostWorkflow } from '../../../../dist/apps/posts/apps/posts/src/infrastructure/dbos/dbos-create-post.workflow.js';
import { PostImagesNotAvailableError } from '../../../../dist/apps/posts/apps/posts/src/application/errors/create-post.errors.js';
import { PrismaService as FilesPrismaService } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/prisma.service.js';
import { PrismaFilesRepository } from '../../../../dist/apps/files/apps/files/src/infrastructure/prisma/repositories/prisma-files.repository.js';

const input = JSON.parse(process.env.POST_RECOVERY_INPUT);
const prisma = new PrismaService({ url: process.env.POST_RECOVERY_POSTS_URL });
const files = new FilesPrismaService({ url: process.env.POST_RECOVERY_FILES_URL });
const repository = new PrismaFilesRepository(files);
const source = new PostsDbosDataSource(prisma);
const crash = (point) => {
  if (process.env.POST_RECOVERY_CRASH_AT === point) process.kill(process.pid, 'SIGKILL');
};
const transaction = source.runTransaction.bind(source);
source.runTransaction = async (callback, config) => {
  const result = await transaction(async () => {
    const value = await callback();
    crash(`before-${config.name}-commit`);
    return value;
  }, config);
  crash(`after-${config.name}-commit`);
  return result;
};
const workflow = new DbosCreatePostWorkflow(source, {
  attachPostImages: async (params) => {
    if (process.env.POST_RECOVERY_REJECT_ATTACH === 'true') throw new PostImagesNotAvailableError();
    await repository.attachPostImages(params);
    crash('after-attach');
  },
  cancelPostImageAttachment: async (params) => {
    await repository.cancelPostImageAttachment(params);
    crash('after-cancel');
  },
});
await PrismaDataSource.initializeDBOSSchema(prisma);
DBOS.setConfig({
  name: 'post-recovery-test',
  applicationVersion: 'create-post-v2',
  executorID: 'post-recovery-executor',
  systemDatabaseUrl: process.env.POST_RECOVERY_POSTS_URL,
  runMigrations: true,
  useListenNotify: false,
  logLevel: 'error',
});
try {
  await DBOS.launch();
  try {
    await workflow.execute(input);
  } catch (error) {
    if (process.env.POST_RECOVERY_REJECT_ATTACH !== 'true' || !(error instanceof PostImagesNotAvailableError))
      throw error;
  }
} finally {
  await DBOS.shutdown();
  await prisma.$disconnect();
  await files.$disconnect();
}
