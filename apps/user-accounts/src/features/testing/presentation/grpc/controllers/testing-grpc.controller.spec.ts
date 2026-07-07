import type { CommandBus } from '@nestjs/cqrs';
import { DeleteAllDataCommand } from '../../../application/use-cases/delete-all-data.use-case.js';
import { TestingGrpcController } from './testing-grpc.controller.js';

describe('TestingGrpcController', () => {
  it('dispatches deletion through CQRS', async () => {
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const controller = new TestingGrpcController(commandBus as unknown as CommandBus);

    await expect(controller.deleteAllData()).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(new DeleteAllDataCommand());
  });
});
