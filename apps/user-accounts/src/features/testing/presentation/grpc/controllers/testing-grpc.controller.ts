import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { TestingServiceControllerMethods, type DeleteAllDataResponse } from '@app/user-accounts-grpc';
import { DeleteAllDataCommand } from '../../../application/use-cases/delete-all-data.use-case.js';

@Controller()
@TestingServiceControllerMethods()
export class TestingGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  async deleteAllData(): Promise<DeleteAllDataResponse> {
    await this.commandBus.execute(new DeleteAllDataCommand());
    return {};
  }
}
