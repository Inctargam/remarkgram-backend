import { Controller, UseFilters } from '@nestjs/common';
import { UserAccountsRpcExceptionFilter } from '../../../../../common/grpc/filters/user-accounts-rpc-exception.filter.js';
import {
  ConfirmPasswordResetRequest,
  ConfirmPasswordResetResponse,
  PasswordResetServiceController,
  PasswordResetServiceControllerMethods,
  RequestPasswordResetRequest,
  RequestPasswordResetResponse,
} from '@app/user-accounts-grpc';
import { CommandBus } from '@nestjs/cqrs';
import { RequestPasswordResetCommand } from '../../../application/use-cases/request-password-reset.use-case.js';
import { ConfirmPasswordResetCommand } from '../../../application/use-cases/confirm-password-reset.use-case.js';

@Controller()
@PasswordResetServiceControllerMethods()
@UseFilters(UserAccountsRpcExceptionFilter)
export class PasswordResetGrpcController implements PasswordResetServiceController {
  constructor(private readonly commandBus: CommandBus) {}

  async requestPasswordReset(request: RequestPasswordResetRequest): Promise<RequestPasswordResetResponse> {
    await this.commandBus.execute(new RequestPasswordResetCommand({ email: request.email }));
    return { accepted: true };
  }

  async confirmPasswordReset(request: ConfirmPasswordResetRequest): Promise<ConfirmPasswordResetResponse> {
    await this.commandBus.execute(
      new ConfirmPasswordResetCommand({
        token: request.token,
        newPassword: request.newPassword,
      }),
    );

    return {};
  }
}
