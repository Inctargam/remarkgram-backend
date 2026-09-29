import type { PostsRepository } from '../../ports/posts.repository.js';
import { beforeEach, expect, vi } from 'vitest';
import { ClearSorfDeletedPostsCommand, ClearSorfDeletedPostsUseCase } from './clear-soft-deleted-posts.js';
import { clearSoftDeletedPostsPolicy } from './clear-soft-deleted-posts.policy.js';

describe('ClearSoftDeletedPosts', () => {
  const respository = {
    clearSoftDeleted: vi.fn<PostsRepository['clearSoftDeleted']>(),
  };
  const useCase = new ClearSorfDeletedPostsUseCase(respository as unknown as PostsRepository);

  beforeEach(() => {
    respository.clearSoftDeleted.mockReset();
  });

  it('process not broken if repository throws', async () => {
    respository.clearSoftDeleted.mockRejectedValueOnce(new Error('Repository error')).mockResolvedValue(1);
    await expect(useCase.execute(new ClearSorfDeletedPostsCommand(5))).resolves.toBeUndefined();
    await expect(useCase.execute(new ClearSorfDeletedPostsCommand(5))).resolves.toBeUndefined();
  });

  it('delegate call to repository', async () => {
    respository.clearSoftDeleted.mockResolvedValue(1);
    await useCase.execute(new ClearSorfDeletedPostsCommand(5));
    expect(respository.clearSoftDeleted).toHaveBeenCalledOnce();
    expect(respository.clearSoftDeleted).toHaveBeenCalledWith(5);
  });

  it.each([clearSoftDeletedPostsPolicy.minLimit, clearSoftDeletedPostsPolicy.maxLimit])(
    'accepts inclusive policy boundary %s',
    async (limit) => {
      respository.clearSoftDeleted.mockResolvedValue(0);

      await expect(useCase.execute(new ClearSorfDeletedPostsCommand(limit))).resolves.toBeUndefined();

      expect(respository.clearSoftDeleted).toHaveBeenCalledWith(limit);
    },
  );

  it('Boundary-case validation check BatchLimit', async () => {
    respository.clearSoftDeleted.mockResolvedValue(1);
    const cmdInvalidMin = new ClearSorfDeletedPostsCommand(clearSoftDeletedPostsPolicy.minLimit - 1);
    await expect(useCase.execute(cmdInvalidMin)).resolves.toBeUndefined();
    expect(respository.clearSoftDeleted).not.toHaveBeenCalledOnce();

    const cmdInvalidMax = new ClearSorfDeletedPostsCommand(clearSoftDeletedPostsPolicy.maxLimit + 1);
    await expect(useCase.execute(cmdInvalidMax)).resolves.toBeUndefined();
    expect(respository.clearSoftDeleted).not.toHaveBeenCalledOnce();

    const cmdNaN = new ClearSorfDeletedPostsCommand('0d9' as unknown as number);
    await expect(useCase.execute(cmdNaN)).resolves.toBeUndefined();
    expect(respository.clearSoftDeleted).not.toHaveBeenCalledOnce();
  });
});
