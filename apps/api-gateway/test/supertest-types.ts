import type { Response as STResponse } from 'supertest';
import type request from 'supertest';
export type TypedResponse<T> = Omit<STResponse, 'body'> & { body: T };

export type ResponseBodySuperTest<T = null> = Promise<TypedResponse<T>>;

export type SupertestApp = Parameters<typeof request>[0];
