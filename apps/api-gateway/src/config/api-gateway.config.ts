import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { configValidationUtility, Environments } from '@app/config';

@Injectable()
export class ApiGatewayConfig {
  @IsInt({ message: 'Set env variable GATEWAY_PORT, example: 3000' })
  @Min(0)
  @Max(65535)
  readonly port: number;

  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  readonly env: Environments;

  constructor(configService: ConfigService) {
    this.port = configValidationUtility.convertToNumber(configService.getOrThrow<string>('GATEWAY_PORT'));
    this.env = configService.get<Environments>('NODE_ENV', Environments.DEVELOPMENT);

    configValidationUtility.validateConfig(this);
  }
}
