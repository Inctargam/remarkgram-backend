import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export const PAYMENTS_DBOS_APPLICATION_NAME = 'remarkgram-payments';
export const PAYMENTS_DBOS_APPLICATION_VERSION = 'payment-webhook-v1';
export const PAYMENTS_DBOS_EXECUTOR_ID = 'remarkgram-payments-singleton';
export const PAYMENTS_DBOS_SYSTEM_DATABASE_POOL_SIZE = 10;

class DbosEnvironmentConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'PAYMENTS_DBOS_SYSTEM_DATABASE_URL must be a PostgreSQL connection URL',
  })
  declare readonly systemDatabaseUrl: string;
}

export const dbosConfig = registerAs('paymentsDbos', () => {
  const environment = plainToInstance(DbosEnvironmentConfig, {
    systemDatabaseUrl: process.env.PAYMENTS_DBOS_SYSTEM_DATABASE_URL?.trim(),
  });

  configValidationUtility.validateConfig(environment);

  return {
    ...environment,
    name: PAYMENTS_DBOS_APPLICATION_NAME,
    applicationVersion: PAYMENTS_DBOS_APPLICATION_VERSION,
    executorId: PAYMENTS_DBOS_EXECUTOR_ID,
    systemDatabasePoolSize: PAYMENTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
    runMigrations: true as const,
  };
});
