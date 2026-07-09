import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TestingRepository } from '../ports/testing.repository.js';

export class DeleteAllDataCommand extends Command<void> {}

@CommandHandler(DeleteAllDataCommand)
export class DeleteAllDataUseCase implements ICommandHandler<DeleteAllDataCommand> {
  constructor(private readonly testingRepository: TestingRepository) {}

  async execute() {
    await this.testingRepository.deleteAllData();
  }
}
