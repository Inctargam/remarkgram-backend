import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const appDirectory = import.meta.dirname;
const environment = process.env.NODE_ENV ?? 'development';

dotenv.config({
  path: [
    resolve(appDirectory, `.env.${environment}.local`),
    resolve(appDirectory, `.env.${environment}`),
    resolve(appDirectory, '.env'),
  ],
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
