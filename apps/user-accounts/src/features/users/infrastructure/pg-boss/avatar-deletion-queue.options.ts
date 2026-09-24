import type { ConstructorOptions, QueueOptions, WorkOptions } from 'pg-boss';

export const AVATAR_DELETION_QUEUE = 'publish-avatar-deletion';
const SIX_HOURS = 6 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

// Редкие служебные опросы тоже важны: стандартные интервалы не дают Neon засыпать.
export const avatarDeletionBossOptions = {
  // Отдельная схема PostgreSQL для служебных таблиц pg-boss.
  schema: 'pgboss',
  // Не больше двух соединений в собственном пуле pg-boss; пул Prisma отдельный.
  max: 2,
  // Встроенный cron не нужен: задачи создаются при удалении или замене аватара.
  schedule: false,
  // Без постоянного LISTEN-соединения: после commit будим локальный worker через wake().
  useListenNotify: false,
  // Как часто supervisor запускает проверки и обслуживание очередей.
  superviseIntervalSeconds: SIX_HOURS,
  // Интервал обновления статистики и поиска просроченных active-задач для восстановления.
  monitorIntervalSeconds: SIX_HOURS,
  // Как часто перечитывать настройки и статистику очередей в локальный кеш.
  queueCacheIntervalSeconds: SIX_HOURS,
  // Проверка зависимостей между задачами. Flow не используем, но фоновый опрос остаётся.
  flowIntervalSeconds: SIX_HOURS,
  // Раз в сутки удаляем записи, у которых истёк срок хранения.
  maintenanceIntervalSeconds: 24 * 60 * 60,
} satisfies ConstructorOptions;

export const avatarDeletionQueueOptions = {
  // До 10 повторов после первой попытки; затем задача становится failed.
  retryLimit: 10,
  // Минимальная задержка повтора; фактический запуск зависит от следующего опроса.
  retryDelay: SIX_HOURS,
  // Задержка постоянная, без экспоненциального увеличения.
  retryBackoff: false,
  // Лимит active-состояния. 15 минут покрывают пачку: 100 публикаций с таймаутом по 5 секунд.
  expireInSeconds: 15 * 60,
  // Ожидающие задачи (created/retry) удаляются после истечения 30-дневного срока.
  retentionSeconds: THIRTY_DAYS,
  // Храним завершённые задачи, включая failed и их ошибки, ещё 30 дней.
  deleteAfterSeconds: THIRTY_DAYS,
} satisfies QueueOptions;

export const avatarDeletionWorkOptions = {
  // За один запрос забираем до 100 задач; наш обработчик публикует их последовательно.
  batchSize: 100,
  // Один worker на экземпляр приложения; между экземплярами задачи распределяет pg-boss.
  localConcurrency: 1,
  // Резервный опрос, если после commit потерялось пробуждение или наступило время повтора.
  pollingIntervalSeconds: SIX_HOURS,
  // После полной пачки сразу берём следующую, не ожидая ещё 6 часов.
  burstWhenBatchFull: true,
  // Отдельный результат для каждой задачи: ошибка одной не повторяет всю пачку.
  perJobResults: true,
} satisfies WorkOptions;
