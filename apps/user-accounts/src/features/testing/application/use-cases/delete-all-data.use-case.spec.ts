import { DeleteAllDataCommand, DeleteAllDataUseCase } from './delete-all-data.use-case.js';

describe('DeleteAllDataUseCase', () => {
  it('deletes all application data', async () => {
    const repository = { deleteAllData: vi.fn().mockResolvedValue(undefined) };
    const useCase = new DeleteAllDataUseCase(repository);

    await expect(useCase.execute(new DeleteAllDataCommand())).resolves.toBeUndefined();
    expect(repository.deleteAllData).toHaveBeenCalledOnce();
  });
});
