import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ResponseBodySuperTest, SupertestApp } from '../supertest-types.ts';
import { API_PREFIX } from '../../src/http-api.constants.js';

export class TestingApiHelper {
  private readonly authPath = `/${API_PREFIX}/testing`;

  constructor(private readonly app: INestApplication) {}

  async deleteAllData(): ResponseBodySuperTest<void> {
    const testingKey = process.env.TESTING_ENDPOINT_KEY;

    if (!testingKey) {
      throw new Error('TESTING_ENDPOINT_KEY is not configured');
    }
    return request(this.app.getHttpServer() as SupertestApp)
      .delete(`${this.authPath}/all-data`)
      .set('X-Testing-Key', testingKey)
      .expect(204);
  }
}
