const lifecycle = vi.hoisted(() => ({
  initializeDBOSSchema: vi.fn(),
  launch: vi.fn(),
  registerQueue: vi.fn(),
  shutdown: vi.fn(),
  isInitialized: vi.fn(),
}));

vi.mock('@dbos-inc/dbos-sdk', () => ({ DBOS: lifecycle }));
vi.mock('@dbos-inc/prisma-datasource', () => ({ PrismaDataSource: lifecycle }));

import { DbosLifecycleService, PAYMENT_WEBHOOK_QUEUE } from './dbos-lifecycle.service.js';

describe('DbosLifecycleService', () => {
  it('initializes checkpoints, launches DBOS and registers the bounded queue', async () => {
    const prisma = {};
    lifecycle.isInitialized.mockReturnValue(true);
    const service = new DbosLifecycleService(prisma as never);

    await service.onApplicationBootstrap();

    expect(lifecycle.initializeDBOSSchema).toHaveBeenCalledWith(prisma);
    expect(lifecycle.registerQueue).toHaveBeenCalledWith(PAYMENT_WEBHOOK_QUEUE, {
      concurrency: 10,
      onConflict: 'update_if_latest_version',
    });
    expect(lifecycle.launch.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.registerQueue.mock.invocationCallOrder[0],
    );

    await service.beforeApplicationShutdown();
    expect(lifecycle.shutdown).toHaveBeenCalledOnce();
  });
});
