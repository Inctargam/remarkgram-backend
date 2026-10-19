import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
} from '@app/files-grpc';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { FilesGateway } from '../../application/ports/files.gateway.js';
import type { PostImageAttachmentParams } from '../../application/types/posts.types.js';
import { mapFilesError } from './files-error.mapper.js';

@Injectable()
export class GrpcFilesGateway extends FilesGateway implements OnModuleInit {
  private filesClient!: FilesServiceClient;

  constructor(
    @Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {
    super();
  }

  onModuleInit(): void {
    this.filesClient = this.grpcClient.getService<FilesServiceClient>(FILES_SERVICE_NAME);
  }

  async attachPostImages(params: PostImageAttachmentParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.attachPostImages({
          userId: String(params.userId),
          fileIds: [...params.fileIds],
          operationId: params.operationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }
  async cancelPostImageAttachment(params: PostImageAttachmentParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.cancelPostImageAttachment({
          userId: String(params.userId),
          fileIds: [...params.fileIds],
          operationId: params.operationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }
}
