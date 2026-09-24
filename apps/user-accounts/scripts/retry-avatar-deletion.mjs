import { PgBoss } from 'pg-boss';
import { isUUID } from 'class-validator';
import {
  AVATAR_DELETION_QUEUE,
  avatarDeletionBossOptions,
} from '../../../dist/apps/user-accounts/apps/user-accounts/src/features/users/infrastructure/pg-boss/avatar-deletion-queue.options.js';

const id = process.argv[2];
if (!id || !isUUID(id, '4') || !process.env.DATABASE_URL) {
  throw new Error(
    'Usage: DATABASE_URL=... pnpm avatar-deletion:retry <job UUID v4> (build user-accounts first)',
  );
}
const boss = new PgBoss({
  ...avatarDeletionBossOptions,
  connectionString: process.env.DATABASE_URL,
  supervise: false,
  migrate: false,
});
boss.on('error', (error) => console.error(error));
try {
  await boss.start();
  // retry изменяет только failed-задачу: ID и исходное сообщение остаются прежними.
  const result = await boss.retry(AVATAR_DELETION_QUEUE, id.toLowerCase());
  if (Number(result.affected) !== 1) throw new Error('Failed job not found; nothing changed');
  console.log(`Task ${id} requeued. The running service will pick it up on its next poll (up to 6 hours).`);
} finally {
  await boss.stop();
}
