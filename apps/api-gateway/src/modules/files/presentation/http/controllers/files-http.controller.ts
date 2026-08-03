import { Body, Controller, HttpCode, HttpStatus, Inject, type OnModuleInit, Post, Req } from '@nestjs/common';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type CompleteImageUploadsResponse,
  type InitiateImageUploadsResponse,
  type FilesServiceClient,
} from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { CompleteImageUploadsDto } from '../dto/input/complete-image-uploads.dto.js';
import { InitiateImageUploadsDto } from '../dto/input/initiate-image-uploads.dto.js';
import { InitiateImageUploadsResponseDto } from '../dto/output/initiate-image-uploads-response.dto.js';

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
  @ApiOperation({ summary: 'Initiate image uploads' })
  @ApiCreatedResponse({ type: InitiateImageUploadsResponseDto })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The files service is unavailable.' })
  initiateImageUploads(
    @Body() input: InitiateImageUploadsDto,
    @Req() request: AuthenticatedRequest,
  ): Observable<InitiateImageUploadsResponse> {
    // NestJS сам подписывается на возвращаемый Observable; firstValueFrom для прямого proxy-вызова не нужен.
    return this.filesClient.initiateImageUploads({
      userId: request.userId,
      images: input.images,
    });
  }

  @Post('image-uploads/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete image uploads' })
  @ApiNoContentResponse({ description: 'The image uploads were completed.' })
  @ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' })
  @ApiServiceUnavailableResponse({ description: 'The files service is unavailable.' })
  completeImageUploads(
    @Body() input: CompleteImageUploadsDto,
    @Req() request: AuthenticatedRequest,
  ): Observable<CompleteImageUploadsResponse> {
    return this.filesClient.completeImageUploads({
      userId: request.userId,
      uploadIds: input.uploadIds,
    });
  }
}
