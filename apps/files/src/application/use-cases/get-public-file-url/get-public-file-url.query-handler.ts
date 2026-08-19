import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ObjectStorage } from '../../ports/object-storage.js';
import {
  FileDownloadUrlGenerationError,
  FileNotFoundError,
} from '../../errors/get-public-file-url.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';
import { filesConfig } from '../../../config/files.config.js';

type GetFileDownloadUrlResult = {
  url: string;
};

export class GetFileDownloadUrlQuery extends Query<GetFileDownloadUrlResult> {
  constructor(public fileId: string) {
    super();
  }
}

@QueryHandler(GetFileDownloadUrlQuery)
export class GetFileDownloadUrlQueryHandler implements IQueryHandler<GetFileDownloadUrlQuery> {
  private readonly logger = new Logger(GetFileDownloadUrlQueryHandler.name);

  constructor(
    private readonly storage: ObjectStorage,
    private readonly filesRepository: FilesRepository,
    @Inject(filesConfig.KEY) private readonly config: ConfigType<typeof filesConfig>,
  ) {}
  async execute(query: GetFileDownloadUrlQuery): Promise<GetFileDownloadUrlResult> {
    const { fileId } = query;
    this.logger.log(`Creating signed download URL for file with ID: ${fileId}`);
    const findFile = await this.filesRepository.findAvailableById({ id: fileId });

    if (!findFile) {
      throw new FileNotFoundError();
    }

    try {
      return {
        url: await this.storage.createPresignedDownloadUrl({
          objectKey: findFile.objectKey,
          expiresInSeconds: this.config.s3.downloadUrlExpiresInSeconds,
        }),
      };
    } catch (error) {
      this.logger.error(error);
      throw new FileDownloadUrlGenerationError();
    }
  }
}
