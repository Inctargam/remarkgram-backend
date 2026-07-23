import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ResponseBodySuperTest, SupertestApp } from '../supertest-types.ts';
import { API_PREFIX } from '../../src/http-api.constants.js';


export type RegistrationRequest = {
  username: string;
  email: string;
  password: string;
};

export type ConfirmRegistrationRequest = {
  code: string;
};

export class AuthApiHelper {
  private readonly authPath = `/${API_PREFIX}/auth`;

  constructor(private readonly app: INestApplication) {}

  async register(overrides: Partial<RegistrationRequest> = {}): ResponseBodySuperTest<void> {
    return request(this.app.getHttpServer() as SupertestApp)
      .post(`${this.authPath}/registration`)
      .send({
        username: 'e2e_user',
        email: 'e2e_user@example.com',
        password: 'Password1!',
        ...overrides,
      });
  }

  async confirmRegistration(
    overrides: Partial<ConfirmRegistrationRequest> = {},
  ): ResponseBodySuperTest<void> {
    return request(this.app.getHttpServer() as SupertestApp)
      .post(`${this.authPath}/registration/confirmation`)
      .send({
        code: 'confirmation-code',
        ...overrides,
      });
  }

  async githubAuth(): ResponseBodySuperTest<unknown> {
    return request(this.app.getHttpServer() as SupertestApp).get(`${this.authPath}/github`);
  }

  async githubAuthRedirect(): ResponseBodySuperTest<unknown> {
    return request(this.app.getHttpServer() as SupertestApp).get(`${this.authPath}/github/callback`);
  }
}
