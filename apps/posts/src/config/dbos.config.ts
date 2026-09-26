import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export const POSTS_DBOS_APPLICATION_NAME = 'remarkgram-posts';
export const POSTS_DBOS_APPLICATION_VERSION = 'create-post-v1';
export const POSTS_DBOS_EXECUTOR_ID = 'remarkgram-posts-singleton';
export const POSTS_DBOS_SYSTEM_DATABASE_POOL_SIZE = 10;

class DbosEnvironmentConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'POSTS_DBOS_SYSTEM_DATABASE_URL must be a PostgreSQL connection URL',
  })
  declare readonly systemDatabaseUrl: string;
}

export const dbosConfig = registerAs('postsDbos', () => {
  const environment = plainToInstance(DbosEnvironmentConfig, {
    systemDatabaseUrl: process.env.POSTS_DBOS_SYSTEM_DATABASE_URL?.trim(),
  });

  configValidationUtility.validateConfig(environment);

  return {
    ...environment,
    name: POSTS_DBOS_APPLICATION_NAME,
    applicationVersion: POSTS_DBOS_APPLICATION_VERSION,
    executorId: POSTS_DBOS_EXECUTOR_ID,
    systemDatabasePoolSize: POSTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
    // На стажировочной платформе нет отдельного шага для DBOS CLI. Поэтому DBOS
    // создаёт и обновляет только свою внутреннюю схему при запуске Posts.
    runMigrations: true as const,
  };
});
