import { Controller, HttpCode, HttpStatus, Inject, type OnModuleInit, Post } from '@nestjs/common';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type FilesServiceClient,
  type UploadFileResponse,
} from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadGatewayResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { UploadFileResponseDto } from '../dto/output/upload-file-response.dto.js';

@ApiTags('Files')
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
  @ApiOperation({ summary: 'Upload a file' })
  @ApiCreatedResponse({ type: UploadFileResponseDto })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The files service is unavailable.' })
  uploadFile(): Observable<UploadFileResponse> {
    return this.filesClient.uploadFile({ originalFilename: 'supper-name-files.png' });
  }
}
