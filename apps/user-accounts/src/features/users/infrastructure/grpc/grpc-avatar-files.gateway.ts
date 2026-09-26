import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
} from '@app/files-grpc';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AvatarFilesGateway, type AttachAvatarParams } from '../../application/ports/avatar-files.gateway.js';
import { mapFilesError } from './files-error.mapper.js';

@Injectable()
export class GrpcAvatarFilesGateway extends AvatarFilesGateway implements OnModuleInit {
  private filesClient!: FilesServiceClient;
  constructor(@Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc) {
    super();
  }

  onModuleInit(): void {
    this.filesClient = this.grpcClient.getService<FilesServiceClient>(FILES_SERVICE_NAME);
  }

  async attachAvatarUpload(params: AttachAvatarParams): Promise<void> {
    try {
      await firstValueFrom(
        this.filesClient.attachAvatarUpload({
          userId: String(params.userId),
          fileId: params.fileId,
          operationId: params.operationId,
        }),
      );
    } catch (error) {
      throw mapFilesError(error);
    }
  }
}
