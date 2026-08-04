import type { TestingServiceClient as FilesTestingServiceClient } from '@app/files-grpc';
import type { TestingServiceClient as PostsTestingServiceClient } from '@app/posts-grpc';
import type { TestingServiceClient as UserAccountsTestingServiceClient } from '@app/user-accounts-grpc';
import { Environments } from '@app/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import type { apiGatewayConfig } from '../../../../../config/api-gateway.config.js';
import { TestingHttpController } from './testing-http.controller.js';

describe('TestingHttpController', () => {
  const testingEndpointKey = 'testing-key-with-at-least-32-characters';
  const filesDeleteAllData = vi.fn<FilesTestingServiceClient['deleteAllData']>();
  const postsDeleteAllData = vi.fn<PostsTestingServiceClient['deleteAllData']>();
  const userAccountsDeleteAllData = vi.fn<UserAccountsTestingServiceClient['deleteAllData']>();
  const filesGrpcClient = { getService: vi.fn(() => ({ deleteAllData: filesDeleteAllData })) };
  const postsGrpcClient = { getService: vi.fn(() => ({ deleteAllData: postsDeleteAllData })) };
  const userAccountsGrpcClient = {
    getService: vi.fn(() => ({ deleteAllData: userAccountsDeleteAllData })),
  };

  const createController = (testingEndpointsEnabled: boolean) => {
    const config = {
      env: Environments.PRODUCTION,
      port: 0,
      testingEndpointsEnabled,
      testingEndpointKey,
    } as ConfigType<typeof apiGatewayConfig>;
    const controller = new TestingHttpController(
      filesGrpcClient as unknown as ClientGrpc,
      postsGrpcClient as unknown as ClientGrpc,
      userAccountsGrpcClient as unknown as ClientGrpc,
      config,
    );
    controller.onModuleInit();
    return controller;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    filesDeleteAllData.mockReturnValue(of({}));
    postsDeleteAllData.mockReturnValue(of({}));
    userAccountsDeleteAllData.mockReturnValue(of({}));
  });

  it('deletes data in all microservices when explicitly enabled', async () => {
    await expect(createController(true).deleteAllData(testingEndpointKey)).resolves.toBeUndefined();
    expect(filesDeleteAllData).toHaveBeenCalledWith({});
    expect(postsDeleteAllData).toHaveBeenCalledWith({});
    expect(userAccountsDeleteAllData).toHaveBeenCalledWith({});
  });

  it('hides the endpoint when it is disabled', async () => {
    await expect(createController(false).deleteAllData(testingEndpointKey)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(filesDeleteAllData).not.toHaveBeenCalled();
    expect(postsDeleteAllData).not.toHaveBeenCalled();
    expect(userAccountsDeleteAllData).not.toHaveBeenCalled();
  });

  it.each([undefined, 'wrong-testing-key'])('rejects an invalid testing key', async (key) => {
    await expect(createController(true).deleteAllData(key)).rejects.toBeInstanceOf(ForbiddenException);
    expect(filesDeleteAllData).not.toHaveBeenCalled();
    expect(postsDeleteAllData).not.toHaveBeenCalled();
    expect(userAccountsDeleteAllData).not.toHaveBeenCalled();
  });
});
