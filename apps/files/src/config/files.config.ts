import { registerAs } from '@nestjs/config';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(604800)
  declare readonly downloadUrlExpiresInSeconds: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(604800)
  declare readonly uploadUrlExpiresInSeconds: number;
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
      downloadUrlExpiresInSeconds: process.env.FILES_S3_DOWNLOAD_URL_EXPIRES_IN_SECONDS?.trim() || '300',
      uploadUrlExpiresInSeconds: process.env.FILES_S3_UPLOAD_URL_EXPIRES_IN_SECONDS?.trim() || '300',
    },
  });

  configValidationUtility.validateConfig(config);

  return config;
});
