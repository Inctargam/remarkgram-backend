import { InvalidAvatarFileIdError, InvalidIdempotencyKeyError } from '../errors/avatar.errors.js';
import { InvalidUserIdError } from '../errors/users.errors.js';
import { SetAvatarCommand, SetAvatarUseCase } from './set-avatar.use-case.js';
import { UserAccountsErrorCode as Code } from '../../../../common/application/errors/user-accounts.error.js';

describe('SetAvatarUseCase', () => {
  const workflow = { execute: vi.fn() };
  const useCase = new SetAvatarUseCase(workflow);
  const params = {
    userId: 42,
    fileId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    idempotencyKey: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
  };
  beforeEach(() => vi.clearAllMocks());
  it('normalizes UUIDs and isolates idempotency by user', async () => {
    await useCase.execute(new SetAvatarCommand(params));
    expect(workflow.execute).toHaveBeenCalledWith({
      userId: 42,
      fileId: params.fileId.toLowerCase(),
      workflowId: `set-avatar:42:${params.idempotencyKey.toLowerCase()}`,
    });
  });
  it.each([
    { patch: { userId: 0 }, ErrorType: InvalidUserIdError, code: Code.INVALID_USER_ID },
    { patch: { userId: 1.5 }, ErrorType: InvalidUserIdError, code: Code.INVALID_USER_ID },
    { patch: { fileId: 'bad' }, ErrorType: InvalidAvatarFileIdError, code: Code.INVALID_AVATAR_FILE_ID },
    {
      patch: { idempotencyKey: '' },
      ErrorType: InvalidIdempotencyKeyError,
      code: Code.INVALID_IDEMPOTENCY_KEY,
    },
  ])('rejects $code before starting a workflow', async ({ patch, code, ErrorType }) => {
    const result = useCase.execute(new SetAvatarCommand({ ...params, ...patch }));
    await expect(result).rejects.toBeInstanceOf(ErrorType);
    await expect(result).rejects.toMatchObject({ code });
    expect(workflow.execute).not.toHaveBeenCalled();
  });
});
