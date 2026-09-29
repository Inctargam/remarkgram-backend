import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export const USER_ACCOUNTS_DBOS_APPLICATION_NAME = 'remarkgram-user-accounts';
export const USER_ACCOUNTS_DBOS_APPLICATION_VERSION = 'set-avatar-v1';
export const USER_ACCOUNTS_DBOS_EXECUTOR_ID = 'remarkgram-user-accounts-singleton';
export const USER_ACCOUNTS_DBOS_SYSTEM_DATABASE_POOL_SIZE = 10;

class DbosEnvironmentConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'USER_ACCOUNTS_DBOS_SYSTEM_DATABASE_URL must be a PostgreSQL connection URL',
  })
  declare readonly systemDatabaseUrl: string;
}

export const dbosConfig = registerAs('userAccountsDbos', () => {
  const environment = plainToInstance(DbosEnvironmentConfig, {
    systemDatabaseUrl: process.env.USER_ACCOUNTS_DBOS_SYSTEM_DATABASE_URL?.trim(),
  });

  configValidationUtility.validateConfig(environment);

  return {
    ...environment,
    name: USER_ACCOUNTS_DBOS_APPLICATION_NAME,
    applicationVersion: USER_ACCOUNTS_DBOS_APPLICATION_VERSION,
    executorId: USER_ACCOUNTS_DBOS_EXECUTOR_ID,
    systemDatabasePoolSize: USER_ACCOUNTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
    // На стажировочной платформе нет отдельного шага для DBOS CLI. Поэтому DBOS
    // создаёт и обновляет только свою внутреннюю схему при запуске user-accounts.
    runMigrations: true as const,
  };
});
