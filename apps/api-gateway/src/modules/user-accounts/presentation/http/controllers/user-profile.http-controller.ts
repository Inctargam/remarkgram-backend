import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  OnModuleInit,
  Put,
  Req,
} from '@nestjs/common';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USERS_SERVICE_NAME,
  UsersServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { UpdateUserProfileDto } from '../dto/input/update-user-profile.dto.js';
import { type RequestWithUserId } from '../auth-request.types.js';
import { firstValueFrom } from 'rxjs';
import { ApiTags } from '@nestjs/swagger';
import { ApiUpdateProfile } from '../swagger/user-profile/put/update-profile.swagger.js';
import { CountriesApi } from '@app/countries';

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

  @Put('me/profile')
  @ApiUpdateProfile()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateProfile(@Body() dto: UpdateUserProfileDto, @Req() request: RequestWithUserId): Promise<void> {
    console.debug('updateProfile', dto);
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
      this.usersGrpcClient.updateUserProfile({
        userId: request.userId.toString(),
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
}
