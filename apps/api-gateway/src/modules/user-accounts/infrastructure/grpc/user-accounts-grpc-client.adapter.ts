import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUTH_SERVICE_NAME,
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  SESSIONS_SERVICE_NAME,
  USERS_SERVICE_NAME,
} from '@app/user-accounts-grpc';
import type {
  AuthServiceClient,
  GetDevicesRequest,
  GetDevicesResponse,
  GetUsersResponse,
  LoginRequest,
  RefreshTokenRequest,
  SessionsServiceClient,
  TokenPairResponse,
  UsersServiceClient,
} from '@app/user-accounts-grpc';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UserAccountsGrpcClientAdapter implements OnModuleInit {
  private usersClient!: UsersServiceClient;
  private authClient!: AuthServiceClient;
  private sessionsClient!: SessionsServiceClient;

  constructor(
    @Inject(REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME)
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.usersClient = this.client.getService<UsersServiceClient>(USERS_SERVICE_NAME);
    this.authClient = this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
    this.sessionsClient = this.client.getService<SessionsServiceClient>(SESSIONS_SERVICE_NAME);
  }

  getUsers(): Promise<GetUsersResponse> {
    return firstValueFrom(this.usersClient.getUsers({}));
  }

  login(request: LoginRequest): Promise<TokenPairResponse> {
    return firstValueFrom(this.authClient.login(request));
  }

  refreshToken(request: RefreshTokenRequest): Promise<TokenPairResponse> {
    return firstValueFrom(this.authClient.refreshToken(request));
  }

  getDevices(request: GetDevicesRequest): Promise<GetDevicesResponse> {
    return firstValueFrom(this.sessionsClient.getDevices(request));
  }
}
