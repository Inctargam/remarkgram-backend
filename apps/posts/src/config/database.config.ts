import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

class DatabaseConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'POSTS_DATABASE_URL must be a PostgreSQL connection URL',
  })
  declare readonly url: string;
}

export const databaseConfig = registerAs('postsDatabase', () => {
  const config = plainToInstance(DatabaseConfig, {
    url: process.env.POSTS_DATABASE_URL?.trim(),
  });

  configValidationUtility.validateConfig(config);

  return config;
});
