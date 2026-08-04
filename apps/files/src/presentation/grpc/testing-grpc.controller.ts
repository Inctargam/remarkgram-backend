import { TestingServiceControllerMethods, type DeleteAllDataResponse } from '@app/files-grpc';
import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DeleteAllDataCommand } from '../../application/use-cases/delete-all-data/delete-all-data.use-case.js';

@Controller()
@TestingServiceControllerMethods()
export class TestingGrpcController {
  constructor(private readonly commandBus: CommandBus) {}

  async deleteAllData(): Promise<DeleteAllDataResponse> {
    await this.commandBus.execute(new DeleteAllDataCommand());
    return {};
  }
}
