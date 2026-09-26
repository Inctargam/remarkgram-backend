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
  it('initializes transaction checkpoints before launching DBOS and shuts DBOS down', async () => {
    const prisma = {};
    lifecycle.isInitialized.mockReturnValue(true);
    const service = new DbosLifecycleService(prisma as never);
    await service.onApplicationBootstrap();
    expect(lifecycle.initializeDBOSSchema).toHaveBeenCalledWith(prisma);
    expect(lifecycle.initializeDBOSSchema.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.launch.mock.invocationCallOrder[0],
    );
    await service.beforeApplicationShutdown();
    expect(lifecycle.shutdown).toHaveBeenCalledOnce();
  });
});
