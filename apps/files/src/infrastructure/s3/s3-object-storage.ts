import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ObjectStorage,
  type CreatePresignedDownloadUrlParams,
  type CreatePresignedUploadParams,
  type ObjectMetadata,
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

  async getObjectMetadata(objectKey: string): Promise<ObjectMetadata | null> {
    try {
      // HeadObject не скачивает тело объекта. При успешном ответе ContentLength содержит полный
      // размер объекта в байтах, а ContentType — MIME-тип, сохранённый при его загрузке.
      const { ContentLength, ContentType } = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.config.s3.bucket,
          Key: objectKey,
        }),
      );

      return {
        size: ContentLength,
        contentType: ContentType,
      };
    } catch (error) {
      // Для отсутствующего объекта SDK отклоняет Promise ошибкой с HTTP 404, а не возвращает
      // успешный ответ с пустыми метаданными. Остальные ошибки означают проблемы доступа,
      // конфигурации или доступности S3, поэтому их нельзя трактовать как отсутствие объекта.
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        return null;
      }

      throw error;
    }
  }
  async deleteObject(objectKey: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.config.s3.bucket,
        Key: objectKey,
      }),
    );
  }

  async createPresignedDownloadUrl(params: CreatePresignedDownloadUrlParams): Promise<string> {
    return await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.config.s3.bucket,
        Key: params.objectKey,
      }),
      { expiresIn: params.expiresInSeconds },
    );
  }
}
