import { Controller, HttpCode, HttpStatus, Inject, type OnModuleInit, Post } from '@nestjs/common';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
  type UploadFileResponse,
} from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Observable } from 'rxjs';
import { Public } from '../../../../../common/presentation/http/decorators/public.decorator.js';

@Controller('files')
export class FilesHttpController implements OnModuleInit {
  private filesClient!: FilesServiceClient;

  constructor(
    @Inject(REMARKGRAM_FILES_V1_PACKAGE_NAME)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.filesClient = this.grpcClient.getService<FilesServiceClient>(FILES_SERVICE_NAME);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  uploadFile(): Observable<UploadFileResponse> {
    return this.filesClient.uploadFile({ originalFilename: 'supper-name-files.png' });
  }
}
