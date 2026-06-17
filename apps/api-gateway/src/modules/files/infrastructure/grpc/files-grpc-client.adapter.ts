import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  FilesServiceClient,
  UploadFileRequest,
  UploadFileResponse,
} from '../../../../../../../libs/contracts/files-grpc/index.js';
import { filesGrpcContract } from '../../../../../../../libs/contracts/files-grpc/index.js';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FilesGrpcClientAdapter implements OnModuleInit {
  private filesClient!: FilesServiceClient;

  constructor(@Inject(filesGrpcContract.clientToken) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.filesClient = this.client.getService<FilesServiceClient>(filesGrpcContract.serviceName);
  }
  async uploadFile(upload: UploadFileRequest): Promise<UploadFileResponse> {
    return firstValueFrom(this.filesClient.uploadFile(upload));
  }
}
