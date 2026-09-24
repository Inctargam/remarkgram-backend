const lifecycle = vi.hoisted(() => ({
  initializeDBOSSchema: vi.fn(),
  launch: vi.fn(),
  shutdown: vi.fn(),
  isInitialized: vi.fn(),
}));
vi.mock('@dbos-inc/dbos-sdk', () => ({ DBOS: lifecycle }));
vi.mock('@dbos-inc/prisma-datasource', () => ({ PrismaDataSource: lifecycle }));
import { DbosLifecycleService } from './dbos-lifecycle.service.js';

describe('DbosLifecycleService', () => {
  it('starts the deletion queue before DBOS recovery and shuts it down after DBOS', async () => {
    const queue = { start: vi.fn(), stop: vi.fn() };
    const prisma = {};
    lifecycle.isInitialized.mockReturnValue(true);
    const service = new DbosLifecycleService(prisma as never, queue as never);
    await service.onApplicationBootstrap();
    expect(lifecycle.initializeDBOSSchema).toHaveBeenCalledWith(prisma);
    expect(queue.start.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.launch.mock.invocationCallOrder[0],
    );
    await service.beforeApplicationShutdown();
    expect(lifecycle.shutdown.mock.invocationCallOrder[0]).toBeLessThan(
      queue.stop.mock.invocationCallOrder[0],
    );
  });
});
