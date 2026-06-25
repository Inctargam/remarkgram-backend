import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module.js';
import { FilesGrpcClientAdapter } from '../src/modules/files/infrastructure/grpc/files-grpc-client.adapter.js';

type SupertestApp = Parameters<typeof request>[0];

describe('ApiGateway (e2e)', () => {
  let app: INestApplication;
  const uploadFile = vi.fn();

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'testing');
    vi.stubEnv('GATEWAY_PORT', '0');
    vi.stubEnv('FILES_GRPC_URL', 'localhost:50051');
    uploadFile.mockResolvedValue({ id: 'file-id' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(FilesGrpcClientAdapter)
      .useValue({ uploadFile })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /files', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/files')
      .expect(201)
      .expect({ id: 'file-id' });

    expect(uploadFile).toHaveBeenCalledWith({ originalFilename: 'supper-name-files.png' });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
});
