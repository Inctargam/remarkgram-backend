import type * as DbosSdk from '@dbos-inc/dbos-sdk';

const dbos = vi.hoisted(() => ({
  workflow: () => (_target: object, _key: string, descriptor: PropertyDescriptor) => descriptor,
  step: () => (_target: object, _key: string, descriptor: PropertyDescriptor) => descriptor,
  randomUUID: vi.fn(),
  startWorkflow: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
  workflowID: 'test-workflow',
}));
vi.mock('@dbos-inc/dbos-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof DbosSdk>()),
  ConfiguredInstance: class {},
  DBOS: dbos,
}));

import { DbosSetAvatarWorkflow } from './dbos-set-avatar.workflow.js';
import type { UserAccountsDbosDataSource } from './user-accounts-dbos.datasource.js';
import {
  AvatarFileStateConflictError,
  AvatarFileNotFoundError,
  AvatarFilesUnavailableError,
  InvalidAvatarImageError,
} from '../../application/errors/avatar.errors.js';
import { UserAccountsErrorCode as Code } from '../../../../common/application/errors/user-accounts.error.js';

describe('DbosSetAvatarWorkflow', () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const input = { userId: 42, fileId: '11111111-1111-4111-8111-111111111111' };
  const previousFileId = '22222222-2222-4222-8222-222222222222';
  const profile = { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  const source = {
    client: { profile, $queryRaw: vi.fn() },
    runTransaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  };
  const files = { attachAvatarUpload: vi.fn() };
  const events = { add: vi.fn() };
  const worker = { publish: vi.fn() };
  const workflow = new DbosSetAvatarWorkflow(
    source as unknown as UserAccountsDbosDataSource,
    files,
    events as never,
    worker as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    dbos.randomUUID.mockResolvedValue(operationId);
    events.add.mockResolvedValue(undefined);
    worker.publish.mockResolvedValue(undefined);
    source.client.$queryRaw.mockResolvedValue([{ id: 42 }]);
    profile.findUnique.mockResolvedValue({ avatarFileId: previousFileId, avatarUpdateId: null });
    profile.upsert.mockResolvedValue({});
    profile.update.mockResolvedValue({});
    profile.updateMany.mockResolvedValue({ count: 1 });
    for (const mock of Object.values(files)) mock.mockResolvedValue(undefined);
    dbos.startWorkflow.mockReturnValue({
      setAvatar: () =>
        Promise.resolve({
          getStatus: () => Promise.resolve({ input: [input] }),
          getResult: () => workflow.setAvatar(input),
        }),
    });
  });
  afterEach(() => vi.useRealTimers());

  it('attaches, updates only avatarFileId, schedules the previous file and unlocks in order', async () => {
    await workflow.setAvatar(input);
    expect(files.attachAvatarUpload).toHaveBeenCalledExactlyOnceWith({ ...input, operationId });
    expect(profile.upsert).toHaveBeenCalledWith({
      where: { userId: 42 },
      create: { userId: 42, avatarUpdateId: operationId },
      update: { avatarUpdateId: operationId },
    });
    expect(profile.update).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarFileId: input.fileId },
    });
    expect(profile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarUpdateId: null },
    });
    expect(files.attachAvatarUpload.mock.invocationCallOrder[0]).toBeLessThan(
      profile.update.mock.invocationCallOrder[0],
    );
    expect(events.add).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 42, fileId: previousFileId } }),
      source.client,
    );
    expect(worker.publish).toHaveBeenCalledWith((events.add.mock.calls[0][0] as { eventId: string }).eventId);
    expect(profile.update.mock.invocationCallOrder[0]).toBeLessThan(events.add.mock.invocationCallOrder[0]);
    expect(events.add.mock.invocationCallOrder[0]).toBeLessThan(
      profile.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('does not wait for broker publication before releasing the profile lock', async () => {
    worker.publish.mockReturnValueOnce(new Promise(() => {}));
    await workflow.setAvatar(input);
    expect(events.add).toHaveBeenCalledOnce();
    expect(profile.updateMany).toHaveBeenCalledOnce();
  });

  it('retains the lock if persisting the deletion request fails', async () => {
    events.add.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(workflow.setAvatar(input)).rejects.toThrow('database unavailable');
    expect(worker.publish).not.toHaveBeenCalled();
    expect(profile.updateMany).not.toHaveBeenCalled();
  });

  it('creates a profile before personal information exists', async () => {
    profile.findUnique.mockResolvedValue(null);
    await workflow.setAvatar(input);
    expect(profile.upsert).toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
  });

  it('returns without Files calls for the current avatar', async () => {
    profile.findUnique.mockResolvedValue({ avatarFileId: input.fileId, avatarUpdateId: null });
    await workflow.setAvatar(input);
    expect(files.attachAvatarUpload).not.toHaveBeenCalled();
    expect(profile.upsert).not.toHaveBeenCalled();
  });

  it('rejects a concurrent operation even when requesting the current file', async () => {
    profile.findUnique.mockResolvedValue({ avatarFileId: input.fileId, avatarUpdateId: 'other-operation' });
    await expect(workflow.setAvatar(input)).rejects.toMatchObject({ code: Code.AVATAR_UPDATE_CONFLICT });
    expect(files.attachAvatarUpload).not.toHaveBeenCalled();
    expect(profile.updateMany).not.toHaveBeenCalled();
  });

  it.each([new AvatarFileNotFoundError(), new AvatarFileStateConflictError(), new InvalidAvatarImageError()])(
    'unlocks on definitive attach failure $code without deleting any file',
    async (error) => {
      files.attachAvatarUpload.mockRejectedValueOnce(error);
      await expect(workflow.setAvatar(input)).rejects.toMatchObject({ code: error.code });
      expect(profile.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { userId: 42, avatarUpdateId: operationId },
        data: { avatarUpdateId: null },
      });
      expect(events.add).not.toHaveBeenCalled();
    },
  );

  it.each([
    { code: Code.AVATAR_FILE_NOT_FOUND },
    { code: Code.AVATAR_FILE_STATE_CONFLICT },
    { code: Code.INVALID_AVATAR_IMAGE },
    Object.assign(new Error('not found'), { name: 'AvatarFileNotFoundError' }),
    Object.assign(new Error('state conflict'), { name: 'AvatarFileStateConflictError' }),
    Object.assign(new Error('invalid image'), { name: 'InvalidAvatarImageError' }),
  ])('compensates a replayed attach rejection without replacing it: %j', async (error) => {
    files.attachAvatarUpload.mockRejectedValueOnce(error);

    await expect(workflow.setAvatar(input)).rejects.toBe(error);

    expect(profile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarUpdateId: null },
    });
    expect(profile.update).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
  });

  it('does not compensate an unknown code even when the name matches a business error', async () => {
    const error = Object.assign(new Error('unexpected'), {
      code: 'UNKNOWN',
      name: 'AvatarFileNotFoundError',
    });
    files.attachAvatarUpload.mockRejectedValueOnce(error);

    await expect(workflow.setAvatar(input)).rejects.toBe(error);

    expect(profile.updateMany).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
  });

  it('accepts an already released lock without another profile read', async () => {
    const error = new InvalidAvatarImageError();
    files.attachAvatarUpload.mockRejectedValueOnce(error);
    profile.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(workflow.setAvatar(input)).rejects.toBe(error);

    expect(profile.findUnique).toHaveBeenCalledTimes(1);
    expect(profile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarUpdateId: null },
    });
  });

  it('does not compensate an unrelated application error while updating the profile', async () => {
    const error = new InvalidAvatarImageError();
    profile.update.mockRejectedValueOnce(error);

    await expect(workflow.setAvatar(input)).rejects.toBe(error);

    expect(events.add).not.toHaveBeenCalled();
    expect(profile.update).toHaveBeenCalledTimes(1);
    expect(profile.updateMany).not.toHaveBeenCalled();
  });

  it('replays the previous avatar from the transaction checkpoint', async () => {
    source.runTransaction.mockResolvedValueOnce({
      alreadyCurrent: false,
      previousAvatarFileId: previousFileId,
    });

    await workflow.setAvatar(input);

    expect(profile.upsert).not.toHaveBeenCalled();
    expect(events.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: { userId: input.userId, fileId: previousFileId } }),
      source.client,
    );
  });

  it('publishes the event ID replayed from the combined transaction checkpoint', async () => {
    const eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    source.runTransaction
      .mockResolvedValueOnce({ alreadyCurrent: false, previousAvatarFileId: previousFileId })
      .mockResolvedValueOnce({ deletionEventId: eventId });

    await workflow.setAvatar(input);

    expect(profile.update).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
    expect(worker.publish).toHaveBeenCalledExactlyOnceWith(eventId);
    expect(profile.updateMany).toHaveBeenCalledOnce();
  });

  it('replays an unchanged avatar from the transaction checkpoint', async () => {
    source.runTransaction.mockResolvedValueOnce({ alreadyCurrent: true, previousAvatarFileId: input.fileId });

    await workflow.setAvatar(input);

    expect(files.attachAvatarUpload).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
    expect(profile.updateMany).not.toHaveBeenCalled();
  });

  it('deletes the new attached file if the user was deleted before commit', async () => {
    source.client.$queryRaw.mockResolvedValueOnce([{ id: 42 }]).mockResolvedValueOnce([]);
    await expect(workflow.setAvatar(input)).rejects.toMatchObject({ code: Code.USER_NOT_FOUND });
    expect(events.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: input }),
      source.client,
    );
    expect(profile.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each(['attachAvatarUpload'] as const)(
    'does not retry a lost %s response or compensate an unknown outcome',
    async (method) => {
      files[method].mockRejectedValueOnce(new AvatarFilesUnavailableError());
      await expect(workflow.setAvatar(input)).rejects.toMatchObject({ code: Code.AVATAR_FILES_UNAVAILABLE });
      expect(files[method]).toHaveBeenCalledTimes(1);
      expect(
        profile.updateMany.mock.calls.some(
          ([args]: [{ data: { avatarUpdateId?: string | null } }]) => args.data.avatarUpdateId === null,
        ),
      ).toBe(false);
    },
  );

  it('compensates a user rejection replayed without its original class or code', async () => {
    const replay = Object.assign(new Error('User Not Found'), { name: 'UserNotFoundError' });
    profile.update.mockRejectedValueOnce(replay);

    await expect(workflow.setAvatar(input)).rejects.toBe(replay);

    expect(events.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: input }),
      source.client,
    );
    expect(profile.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarUpdateId: null },
    });
  });

  it('restores an attach rejection from DBOS and unlocks without logging a technical failure', async () => {
    const replay = Object.assign(new Error('Avatar file was not found'), {
      code: Code.AVATAR_FILE_NOT_FOUND,
    });
    files.attachAvatarUpload.mockRejectedValueOnce(replay);

    await expect(workflow.execute({ ...input, workflowId: 'test-workflow' })).rejects.toBeInstanceOf(
      AvatarFileNotFoundError,
    );

    expect(profile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: 42, avatarUpdateId: operationId },
      data: { avatarUpdateId: null },
    });
    expect(dbos.logger.error).not.toHaveBeenCalled();
  });

  it('restores a stored workflow error in execute without running workflow steps', async () => {
    const replay = Object.assign(new Error('Avatar file was not found'), {
      code: Code.AVATAR_FILE_NOT_FOUND,
    });
    dbos.startWorkflow.mockReturnValue({
      setAvatar: () =>
        Promise.resolve({
          getStatus: () => Promise.resolve({ input: [input] }),
          getResult: () => Promise.reject(replay),
        }),
    });

    await expect(workflow.execute({ ...input, workflowId: 'test-workflow' })).rejects.toBeInstanceOf(
      AvatarFileNotFoundError,
    );

    expect(source.runTransaction).not.toHaveBeenCalled();
    expect(files.attachAvatarUpload).not.toHaveBeenCalled();
    expect(dbos.logger.error).not.toHaveBeenCalled();
  });

  it('logs Files unavailability and retains the lock', async () => {
    files.attachAvatarUpload.mockRejectedValueOnce(new AvatarFilesUnavailableError());

    await expect(workflow.execute({ ...input, workflowId: 'test-workflow' })).rejects.toBeInstanceOf(
      AvatarFilesUnavailableError,
    );

    expect(profile.updateMany).not.toHaveBeenCalled();
    expect(dbos.logger.error).toHaveBeenCalledWith(expect.stringContaining('workflowId=test-workflow'));
  });

  it('propagates a temporary application DB error without retrying or compensating', async () => {
    profile.update.mockRejectedValueOnce(Object.assign(new Error('disconnected'), { code: 'P1017' }));
    await expect(workflow.setAvatar(input)).rejects.toMatchObject({ code: 'P1017' });
    expect(profile.update).toHaveBeenCalledTimes(1);
    expect(profile.updateMany).not.toHaveBeenCalled();
    expect(files.attachAvatarUpload).toHaveBeenCalledTimes(1);
    expect(events.add).not.toHaveBeenCalled();
  });

  it('retains the lock and logs unexpected failures for recovery', async () => {
    files.attachAvatarUpload.mockRejectedValueOnce(new Error('unexpected failure'));
    await expect(workflow.execute({ ...input, workflowId: 'test-workflow' })).rejects.toThrow(
      'unexpected failure',
    );
    expect(profile.updateMany).not.toHaveBeenCalled();
    expect(dbos.logger.error).toHaveBeenCalled();
  });

  it('rejects a reused key whose stored input differs', async () => {
    dbos.startWorkflow.mockReturnValue({
      setAvatar: () =>
        Promise.resolve({
          getStatus: () => Promise.resolve({ input: [{ ...input, fileId: previousFileId }] }),
        }),
    });
    await expect(workflow.execute({ ...input, workflowId: 'same-key' })).rejects.toMatchObject({
      code: Code.AVATAR_IDEMPOTENCY_KEY_CONFLICT,
    });
    expect(files.attachAvatarUpload).not.toHaveBeenCalled();
  });

  it('waits for the workflow result without imposing a timeout', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    const running = new Promise<void>((resolve) => {
      complete = resolve;
    });
    dbos.startWorkflow.mockReturnValue({
      setAvatar: () =>
        Promise.resolve({ getStatus: () => Promise.resolve({ input: [input] }), getResult: () => running }),
    });
    const settled = vi.fn();
    const result = workflow.execute({ ...input, workflowId: 'same-key' }).then(settled);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    complete();
    await result;
    expect(settled).toHaveBeenCalledTimes(1);
    await expect(workflow.execute({ ...input, workflowId: 'same-key' })).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
