import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { Environments } from '@app/config';
import type { TestingServiceClient } from '@app/user-accounts-grpc';
import { of } from 'rxjs';
import type { apiGatewayConfig } from '../../../../../config/api-gateway.config.js';
import { TestingHttpController } from './testing-http.controller.js';

describe('TestingHttpController', () => {
  const testingEndpointKey = 'testing-key-with-at-least-32-characters';
  const deleteAllData = vi.fn<TestingServiceClient['deleteAllData']>();
  const grpcClient = { getService: vi.fn(() => ({ deleteAllData })) };

  const createController = (testingEndpointsEnabled: boolean) => {
    const config = {
      env: Environments.PRODUCTION,
      port: 0,
      testingEndpointsEnabled,
      testingEndpointKey,
    } as ConfigType<typeof apiGatewayConfig>;
    const controller = new TestingHttpController(grpcClient as unknown as ClientGrpc, config);
    controller.onModuleInit();
    return controller;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    deleteAllData.mockReturnValue(of({}));
  });

  it('deletes data in production when explicitly enabled', async () => {
    await expect(createController(true).deleteAllData(testingEndpointKey)).resolves.toBeUndefined();
    expect(deleteAllData).toHaveBeenCalledWith({});
  });

  it('hides the endpoint when it is disabled', async () => {
    await expect(createController(false).deleteAllData(testingEndpointKey)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deleteAllData).not.toHaveBeenCalled();
  });

  it.each([undefined, 'wrong-testing-key'])('rejects an invalid testing key', async (key) => {
    await expect(createController(true).deleteAllData(key)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteAllData).not.toHaveBeenCalled();
  });
});
