import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { FILES_SERVICE_NAME, REMARKGRAM_FILES_V1_PACKAGE_NAME } from '@app/files-grpc';
import type { FilesServiceClient, UploadFileRequest, UploadFileResponse } from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FilesGrpcClientAdapter implements OnModuleInit {
  private filesClient!: FilesServiceClient;

  constructor(@Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.filesClient = this.client.getService<FilesServiceClient>(FILES_SERVICE_NAME);
  }

  uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    return firstValueFrom(this.filesClient.uploadFile(request));
  }
}
