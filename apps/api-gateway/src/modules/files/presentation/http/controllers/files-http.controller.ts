import { Body, Controller, HttpCode, HttpStatus, Inject, type OnModuleInit, Post, Req } from '@nestjs/common';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type CreateImageUploadsResponse,
  type FilesServiceClient,
} from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { CreateImageUploadsDto } from '../dto/input/create-image-uploads.dto.js';
import { CreateImageUploadsResponseDto } from '../dto/output/create-image-uploads-response.dto.js';

type AuthenticatedRequest = Request & { userId: string };

@ApiTags('Files')
@ApiBearerAuth('accessToken')
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

  @Post('image-uploads')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request image upload sessions' })
  @ApiCreatedResponse({ type: CreateImageUploadsResponseDto })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The files service is unavailable.' })
  createImageUploads(
    @Body() input: CreateImageUploadsDto,
    @Req() request: AuthenticatedRequest,
  ): Observable<CreateImageUploadsResponse> {
    // NestJS сам подписывается на возвращаемый Observable; firstValueFrom для прямого proxy-вызова не нужен.
    return this.filesClient.createImageUploads({
      userId: request.userId,
      images: input.images,
    });
  }
}
