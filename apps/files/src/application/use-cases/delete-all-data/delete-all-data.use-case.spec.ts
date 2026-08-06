import { DeleteAllDataUseCase } from './delete-all-data.use-case.js';

describe('DeleteAllDataUseCase', () => {
  it('deletes all files data', async () => {
    const testingRepository = { deleteAllData: vi.fn().mockResolvedValue(undefined) };
    const useCase = new DeleteAllDataUseCase(testingRepository);

    await expect(useCase.execute()).resolves.toBeUndefined();
    expect(testingRepository.deleteAllData).toHaveBeenCalledOnce();
  });
});
