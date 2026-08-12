import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import { IsDefined, IsEnum, IsNotEmpty, IsString, IsUrl, ValidateNested } from 'class-validator';
import { configValidationUtility, Environments } from '@app/config';

class S3Config {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
  })
  declare readonly endpoint: string;

  @IsString()
  @IsNotEmpty()
  declare readonly region: string;

  @IsString()
  @IsNotEmpty()
  declare readonly bucket: string;

  @IsString()
  @IsNotEmpty()
  declare readonly accessKeyId: string;

  @IsString()
  @IsNotEmpty()
  declare readonly secretAccessKey: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: false,
  })
  declare readonly publicUrl: string;
}

class FilesConfig {
  @IsString({ message: 'Set env variable FILES_GRPC_URL, example: localhost:50051' })
  @IsNotEmpty()
  declare readonly url: string;

  @IsEnum(Environments)
  declare readonly env: Environments;

  @ValidateNested()
  @Type(() => S3Config)
  @IsDefined()
  declare readonly s3: S3Config;
}

export const filesConfig = registerAs('files', () => {
  const config = plainToInstance(FilesConfig, {
    url: process.env.FILES_GRPC_URL?.trim(),
    env: process.env.NODE_ENV ?? Environments.DEVELOPMENT,
    s3: {
      endpoint: process.env.FILES_S3_ENDPOINT?.trim(),
      region: process.env.FILES_S3_REGION?.trim(),
      bucket: process.env.FILES_S3_BUCKET?.trim(),
      accessKeyId: process.env.FILES_S3_ACCESS_KEY_ID?.trim(),
      secretAccessKey: process.env.FILES_S3_SECRET_ACCESS_KEY?.trim(),
      publicUrl: process.env.FILES_S3_PUBLIC_URL?.trim(),
    },
  });

  configValidationUtility.validateConfig(config);

  return config;
});
