import { AvatarUpdateConflictError } from '../errors/avatar.errors.js';
import { UserNotFoundError } from '../errors/users.errors.js';
import { DeleteAvatarCommand, DeleteAvatarUseCase } from './delete-avatar.use-case.js';

describe('DeleteAvatarUseCase', () => {
  const ctx = {};
  const unitOfWork = { run: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) => fn(ctx)) };
  const users = { lockActiveById: vi.fn(), clearAvatar: vi.fn() };
  const deletionRequests = { exists: vi.fn(), add: vi.fn() };
  const queue = { enqueue: vi.fn(), wake: vi.fn() };
  const useCase = new DeleteAvatarUseCase(unitOfWork as never, users as never, deletionRequests, queue);
  const params = { userId: 42, idempotencyKey: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' };
  beforeEach(() => {
    vi.resetAllMocks();
    users.lockActiveById.mockResolvedValue(true);
    deletionRequests.exists.mockResolvedValue(false);
    users.clearAvatar.mockResolvedValue('11111111-1111-4111-8111-111111111111');
    queue.enqueue.mockResolvedValue(undefined);
  });

  it('stores deletion and queue job in one transaction, normalizes the key, then publishes without waiting', async () => {
    queue.wake.mockReturnValue(new Promise(() => {}));
    await useCase.execute(new DeleteAvatarCommand(params));
    const request = { ...params, idempotencyKey: params.idempotencyKey.toLowerCase() };
    expect(users.lockActiveById).toHaveBeenCalledWith(params.userId, ctx);
    expect(deletionRequests.exists).toHaveBeenCalledWith(request, ctx);
    expect(users.clearAvatar).toHaveBeenCalledWith(params.userId, ctx);
    expect(deletionRequests.add).toHaveBeenCalledWith(request, ctx);
    expect(users.lockActiveById.mock.invocationCallOrder[0]).toBeLessThan(
      deletionRequests.exists.mock.invocationCallOrder[0],
    );
    expect(deletionRequests.exists.mock.invocationCallOrder[0]).toBeLessThan(
      users.clearAvatar.mock.invocationCallOrder[0],
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      {
        eventId: expect.any(String) as string,
        eventType: 'files.avatar-deletion-requested.v1',
        data: { userId: 42, fileId: '11111111-1111-4111-8111-111111111111' },
      },
      ctx,
    );
    expect(queue.wake).toHaveBeenCalledWith();
    expect(queue.enqueue.mock.invocationCallOrder[0]).toBeLessThan(queue.wake.mock.invocationCallOrder[0]);
  });
  it('records the request even without an avatar, without publishing', async () => {
    users.clearAvatar.mockResolvedValue(null);
    await useCase.execute(new DeleteAvatarCommand(params));
    expect(deletionRequests.add).toHaveBeenCalledWith(
      { ...params, idempotencyKey: params.idempotencyKey.toLowerCase() },
      ctx,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.wake).not.toHaveBeenCalled();
  });
  it('does not clear a new avatar when an old request is repeated', async () => {
    deletionRequests.exists.mockResolvedValue(true);
    await useCase.execute(new DeleteAvatarCommand(params));
    expect(users.clearAvatar).not.toHaveBeenCalled();
    expect(deletionRequests.add).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.wake).not.toHaveBeenCalled();
  });
  it('rejects a missing user before checking the request journal', async () => {
    users.lockActiveById.mockResolvedValue(false);
    await expect(useCase.execute(new DeleteAvatarCommand(params))).rejects.toThrow(UserNotFoundError);
    expect(deletionRequests.exists).not.toHaveBeenCalled();
    expect(users.clearAvatar).not.toHaveBeenCalled();
    expect(deletionRequests.add).not.toHaveBeenCalled();
  });
  it('does not record a request or publish when avatar installation is active', async () => {
    users.clearAvatar.mockRejectedValue(new AvatarUpdateConflictError());
    await expect(useCase.execute(new DeleteAvatarCommand(params))).rejects.toThrow(AvatarUpdateConflictError);
    expect(deletionRequests.add).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.wake).not.toHaveBeenCalled();
  });
  it('does not publish if saving the request journal fails', async () => {
    deletionRequests.add.mockRejectedValue(new Error('journal failure'));
    await expect(useCase.execute(new DeleteAvatarCommand(params))).rejects.toThrow('journal failure');
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.wake).not.toHaveBeenCalled();
  });
  it('does not publish if the transaction fails', async () => {
    queue.enqueue.mockRejectedValueOnce(new Error('database failure'));
    await expect(useCase.execute(new DeleteAvatarCommand(params))).rejects.toThrow('database failure');
    expect(queue.wake).not.toHaveBeenCalled();
  });
  it.each([
    { ...params, userId: 0 },
    { ...params, userId: 1.5 },
    { ...params, idempotencyKey: 'bad' },
  ])('rejects invalid input before DB calls: %j', async (input) => {
    await expect(useCase.execute(new DeleteAvatarCommand(input))).rejects.toThrow();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });
});
