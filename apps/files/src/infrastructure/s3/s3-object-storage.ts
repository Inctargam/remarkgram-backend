import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ObjectStorage,
  type CreatePresignedUploadParams,
  type PresignedUpload,
} from '../../application/ports/object-storage.js';
import { filesConfig } from '../../config/files.config.js';
import { S3_CLIENT } from './s3.constants.js';

@Injectable()
export class S3ObjectStorage extends ObjectStorage {
  constructor(
    @Inject(S3_CLIENT) private readonly s3Client: S3Client,
    @Inject(filesConfig.KEY) private readonly config: ConfigType<typeof filesConfig>,
  ) {
    super();
  }

  async createPresignedUpload(params: CreatePresignedUploadParams): Promise<PresignedUpload> {
    const { objectKey, contentType, size, expiresInSeconds } = params;

    // Локально формирует URL и поля будущего multipart/form-data запроса, не загружая объект в S3.
    // Fields фиксирует Content-Type в подписанной policy, а Conditions ограничивает точный размер файла.
    const { url, fields } = await createPresignedPost(this.s3Client, {
      Bucket: this.config.s3.bucket,
      Key: objectKey,
      Expires: expiresInSeconds,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [['content-length-range', size, size]],
    });

    const policy = JSON.parse(Buffer.from(fields.Policy, 'base64').toString()) as { expiration: string };

    return {
      url,
      fields,
      expiresAt: new Date(policy.expiration),
    };
  }
}
