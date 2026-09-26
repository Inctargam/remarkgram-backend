import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  type OnModuleInit,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  FILES_SERVICE_NAME,
  REMARKGRAM_FILES_V1_PACKAGE_NAME,
  type InitiateImageUploadsResponse,
  type ImageUploadSession,
  type FilesServiceClient,
} from '@app/files-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../../../common/http/authenticated-request.js';
import { firstValueFrom, type Observable } from 'rxjs';
import { CompleteImageUploadsDto } from '../dto/input/complete-image-uploads.dto.js';
import { InitiateImageUploadsDto } from '../dto/input/initiate-image-uploads.dto.js';
import { InitiateAvatarUploadDto } from '../dto/input/initiate-avatar-upload.dto.js';
import { ApiFilesController } from '../swagger/files-controller.swagger.js';
import { ApiCompleteImageUploads } from '../swagger/post/complete-image-uploads.swagger.js';
import { ApiInitiateImageUploads } from '../swagger/post/initiate-image-uploads.swagger.js';
import { ApiInitiateAvatarUpload } from '../swagger/post/initiate-avatar-upload.swagger.js';
import { GetFileDownloadUrlParamsDto } from '../dto/input/get-public-file-url-params.dto.js';
import { ApiGetFileDownloadUrl } from '../swagger/get/get-public-file-url.swagger.js';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';

@ApiFilesController()
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

  @Post('avatar-upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiInitiateAvatarUpload()
  initiateAvatarUpload(
    @Body() input: InitiateAvatarUploadDto,
    @Req() request: AuthenticatedRequest,
  ): Observable<ImageUploadSession> {
    return this.filesClient.initiateAvatarUpload({
      userId: request.userId,
      clientFileId: input.clientFileId,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      size: input.size,
    });
  }

  @Post('image-uploads')
  @HttpCode(HttpStatus.CREATED)
  @ApiInitiateImageUploads()
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
  @ApiCompleteImageUploads()
  async completeImageUploads(
    @Body() input: CompleteImageUploadsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await firstValueFrom(
      this.filesClient.completeImageUploads({
        userId: request.userId,
        uploadIds: input.uploadIds,
      }),
    );
  }

  @Public()
  @Get('images/:fileId')
  @ApiGetFileDownloadUrl()
  async getFileDownloadUrl(@Param() paramsDto: GetFileDownloadUrlParamsDto, @Res() res: Response) {
    const downloadUrl = await firstValueFrom(
      this.filesClient.getFileDownloadUrl({ fileId: paramsDto.fileId }),
    );

    res.redirect(HttpStatus.FOUND, downloadUrl.url);
  }
}
