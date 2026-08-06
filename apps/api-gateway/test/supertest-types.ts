import request, { Response as STResponse } from 'supertest';
export type TypedResponse<T> = Omit<STResponse, 'body'> & { body: T };

export type ResponseBodySuperTest<T = null> = Promise<TypedResponse<T>>;

export type SupertestApp = Parameters<typeof request>[0];
