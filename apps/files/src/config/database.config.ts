import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { configValidationUtility } from '@app/config';

class DatabaseConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'DATABASE_URL must be a PostgreSQL connection URL',
  })
  declare readonly url: string;
}

export const databaseConfig = registerAs('database', () => {
  const config = plainToInstance(DatabaseConfig, {
    url: process.env.DATABASE_URL,
  });

  configValidationUtility.validateConfig(config);

  return config;
});
