import type { CommandBus } from '@nestjs/cqrs';
import { ConfirmRegistrationCommand } from '../../../application/use-cases/confirm-registration.use-case.js';
import { RegisterUserCommand } from '../../../application/use-cases/register-user.use-case.js';
import { ResendRegistrationConfirmationCommand } from '../../../application/use-cases/resend-registration-confirmation.use-case.js';
import { RegistrationGrpcController } from './registration-grpc.controller.js';

describe('RegistrationGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const controller = new RegistrationGrpcController(commandBus as unknown as CommandBus);

  beforeEach(() => {
    vi.clearAllMocks();
    commandBus.execute.mockResolvedValue(undefined);
  });

  it('delegates registration data to RegisterUserCommand', async () => {
    await expect(
      controller.registerUser({
        username: 'user_123',
        email: 'user@example.com',
        password: 'Password1!',
      }),
    ).resolves.toEqual({});

    const command = commandBus.execute.mock.calls[0][0] as RegisterUserCommand;
    expect(command).toBeInstanceOf(RegisterUserCommand);
    expect(command.params).toEqual({
      username: 'user_123',
      email: 'user@example.com',
      password: 'Password1!',
    });
  });

  it('delegates a confirmation code to ConfirmRegistrationCommand', async () => {
    await expect(controller.confirmRegistration({ code: 'confirmation-code' })).resolves.toEqual({});

    const command = commandBus.execute.mock.calls[0][0] as ConfirmRegistrationCommand;
    expect(command).toBeInstanceOf(ConfirmRegistrationCommand);
    expect(command.code).toBe('confirmation-code');
  });

  it('delegates an email to ResendRegistrationConfirmationCommand', async () => {
    await expect(controller.resendRegistrationConfirmation({ email: 'user@example.com' })).resolves.toEqual(
      {},
    );

    const command = commandBus.execute.mock.calls[0][0] as ResendRegistrationConfirmationCommand;
    expect(command).toBeInstanceOf(ResendRegistrationConfirmationCommand);
    expect(command.email).toBe('user@example.com');
  });
});
