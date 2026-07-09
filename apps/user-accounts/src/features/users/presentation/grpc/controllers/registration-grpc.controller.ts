import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  RegistrationServiceControllerMethods,
  type ConfirmRegistrationRequest,
  type ConfirmRegistrationResponse,
  type RegisterUserRequest,
  type RegisterUserResponse,
  type ResendRegistrationConfirmationRequest,
  type ResendRegistrationConfirmationResponse,
} from '@app/user-accounts-grpc';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import { ConfirmRegistrationCommand } from '../../../application/use-cases/confirm-registration.use-case.js';
import { RegisterUserCommand } from '../../../application/use-cases/register-user.use-case.js';
import { ResendRegistrationConfirmationCommand } from '../../../application/use-cases/resend-registration-confirmation.use-case.js';

@Controller()
@RegistrationServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class RegistrationGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  async registerUser(request: RegisterUserRequest): Promise<RegisterUserResponse> {
    await this.commandBus.execute(
      new RegisterUserCommand({
        username: request.username,
        email: request.email,
        password: request.password,
      }),
    );

    return {};
  }

  async confirmRegistration(request: ConfirmRegistrationRequest): Promise<ConfirmRegistrationResponse> {
    await this.commandBus.execute(new ConfirmRegistrationCommand(request.code));

    return {};
  }

  async resendRegistrationConfirmation(
    request: ResendRegistrationConfirmationRequest,
  ): Promise<ResendRegistrationConfirmationResponse> {
    await this.commandBus.execute(new ResendRegistrationConfirmationCommand(request.email));

    return {};
  }
}
