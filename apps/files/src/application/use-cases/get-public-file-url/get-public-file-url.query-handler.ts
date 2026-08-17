import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { ObjectStorage } from '../../ports/object-storage.js';
import { FileNotFoundError, FilePublicAccessDeniedError } from '../../errors/get-public-file-url.errors.js';
import { FilesRepository } from '../../ports/files.repository.js';

type GetPublicFileUrlResult = {
  url: string;
};

export class GetPublicFileUrlQuery extends Query<GetPublicFileUrlResult> {
  constructor(public fileId: string) {
    super();
  }
}

@QueryHandler(GetPublicFileUrlQuery)
export class GetPublicFileUrlQueryHandler implements IQueryHandler<GetPublicFileUrlQuery> {
  private readonly logger = new Logger(GetPublicFileUrlQueryHandler.name);

  constructor(
    private readonly storage: ObjectStorage,
    private readonly filesRepository: FilesRepository,
  ) {}
  async execute(query: GetPublicFileUrlQuery): Promise<GetPublicFileUrlResult> {
    const { fileId } = query;
    this.logger.log(`Getting public URL for file with ID: ${fileId}`);
    const findFile = await this.filesRepository.findAvailableById({ id: fileId });

    if (!findFile) {
      throw new FileNotFoundError();
    }

    try {
      return {
        url: this.storage.getPublicUrl(findFile.objectKey),
      };
    } catch (error) {
      this.logger.error(error);
      throw new FilePublicAccessDeniedError();
    }
  }
}
