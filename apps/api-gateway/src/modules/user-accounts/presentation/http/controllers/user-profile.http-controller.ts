import { IdempotencyKey } from '../../../../../common/http/decorators/idempotency-key.decorator.js';
import { SetAvatarDto } from '../dto/input/set-avatar.dto.js';
import { ApiDeleteAvatar } from '../swagger/user-profile/delete/delete-avatar.swagger.js';
import { ApiSetAvatar } from '../swagger/user-profile/put/set-avatar.swagger.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USERS_SERVICE_NAME,
  UsersServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { UpdateProfileInfoDto } from '../dto/input/update-profile-info.dto.js';
import { type RequestWithUserId } from '../auth-request.types.js';
import { firstValueFrom } from 'rxjs';
import { ApiTags } from '@nestjs/swagger';
import { ApiUpdateProfileInfo } from '../swagger/user-profile/put/update-profile-info.swagger.js';
import { CountriesApi, type Country } from '@app/countries';
import { Public } from '../../../../../common/http/decorators/public.decorator.js';
import { GetPublicProfileParamsDto } from '../dto/input/get-public-profile-params.dto.js';
import { ApiGetMyProfile } from '../swagger/user-profile/get/get-my-profile.swagger.js';
import { ApiGetPublicProfile } from '../swagger/user-profile/get/get-public-profile.swagger.js';
import { MyProfileResponseDto } from '../dto/output/my-profile-response.dto.js';
import { PublicProfileResponseDto } from '../dto/output/public-profile-response.dto.js';
import { CountryResponseDto } from '../../../../countries/presentation/http/dto/output/country-response.dto.js';

@ApiTags('Profile')
@Controller('users')
export class UserProfileHttpController implements OnModuleInit {
  private usersGrpcClient!: UsersServiceClient;
  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME) private readonly grpcClient: ClientGrpc,
    private readonly countriesApi: CountriesApi,
  ) {}
  onModuleInit() {
    this.usersGrpcClient = this.grpcClient.getService<UsersServiceClient>(USERS_SERVICE_NAME);
  }

  @Delete('me/profile/avatar')
  @ApiDeleteAvatar()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(
    @Req() request: RequestWithUserId,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.usersGrpcClient.deleteAvatar({
        userId: Number(request.userId),
        idempotencyKey: idempotencyKey.toLowerCase(),
      }),
    );
  }

  @Put('me/profile/avatar')
  @ApiSetAvatar()
  @HttpCode(HttpStatus.NO_CONTENT)
  async setAvatar(
    @Body() dto: SetAvatarDto,
    @Req() request: RequestWithUserId,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.usersGrpcClient.setAvatar({
        userId: Number(request.userId),
        fileId: dto.fileId.toLowerCase(),
        idempotencyKey: idempotencyKey.toLowerCase(),
      }),
    );
  }

  @Put('me/profile')
  @ApiUpdateProfileInfo()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProfileInfo(
    @Body() dto: UpdateProfileInfoDto,
    @Req() request: RequestWithUserId,
  ): Promise<void> {
    const countryCode = (dto?.countryCode ?? '').trim();
    if (countryCode && countryCode.length > 0) {
      const existing = await this.countriesApi.exists(countryCode);
      if (!existing) {
        throw new BadRequestException(['The country code is not listed among the available countries.'], {
          cause: new Error('The country code is not listed among the available countries'),
        });
      }
    }

    await firstValueFrom(
      this.usersGrpcClient.updateProfileInfo({
        userId: Number(request.userId),
        username: dto.username,
        personalInfo: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          dateOfBirth: dto.dateOfBirth,
          aboutMe: dto.aboutMe,
          countryCode: countryCode,
          city: dto.city,
        },
      }),
    );
  }

  @Get('me/profile')
  @ApiGetMyProfile()
  async getMyProfile(@Req() request: RequestWithUserId): Promise<MyProfileResponseDto> {
    const profile = await firstValueFrom(
      this.usersGrpcClient.getMyProfile({
        userId: Number(request.userId),
      }),
    );
    let existCountry: Country | null = null;
    if (profile.countryCode) {
      existCountry = await this.countriesApi.findByCode(profile.countryCode);
    }

    return new MyProfileResponseDto({
      userId: Number(profile.userId),
      username: profile.username,
      country: existCountry ? new CountryResponseDto(existCountry) : null,
      city: profile.city ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      dateOfBirth: profile.dateOfBirth ?? null,
      aboutMe: profile.aboutMe ?? null,
      avatarFileId: profile.avatarFileId ?? null,
    });
  }

  @Public()
  @Get('/:userId/profile')
  @ApiGetPublicProfile()
  async getPublicProfile(@Param() paramsDto: GetPublicProfileParamsDto): Promise<PublicProfileResponseDto> {
    const profile = await firstValueFrom(
      this.usersGrpcClient.getPublicProfile({
        userId: Number(paramsDto.userId),
      }),
    );
    return new PublicProfileResponseDto({
      userId: Number(profile.userId),
      username: profile.username,
      aboutMe: profile.aboutMe ?? null,
      avatarFileId: profile.avatarFileId ?? null,
    });
  }
}
