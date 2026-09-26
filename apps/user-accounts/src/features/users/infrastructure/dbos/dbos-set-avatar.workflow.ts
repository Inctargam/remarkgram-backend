import { OutboxEventsRepository } from '../../../outbox/application/ports/outbox-events.repository.js';
import { OutboxWorker } from '../../../outbox/application/workers/outbox.worker.js';
import { createAvatarDeletionEvent } from '../../application/integration-events/avatar-deletion-requested.event.js';
import { ConfiguredInstance, DBOS } from '@dbos-inc/dbos-sdk';
import { Injectable } from '@nestjs/common';
import {
  UserAccountsError,
  UserAccountsErrorCode as Code,
} from '../../../../common/application/errors/user-accounts.error.js';
import {
  AvatarFilesUnavailableError,
  AvatarIdempotencyKeyConflictError,
  AvatarUpdateConflictError,
} from '../../application/errors/avatar.errors.js';
import { UserNotFoundError } from '../../application/errors/users.errors.js';
import {
  AvatarFilesGateway,
  type AvatarFileParams,
  type AttachAvatarParams,
} from '../../application/ports/avatar-files.gateway.js';
import {
  SetAvatarWorkflow,
  type SetAvatarWorkflowParams,
} from '../../application/ports/set-avatar.workflow.js';
import { getAvatarErrorCode, restoreAvatarError } from './avatar-error.mapper.js';
import { UserAccountsDbosDataSource } from './user-accounts-dbos.datasource.js';

type WorkflowInput = Omit<SetAvatarWorkflowParams, 'workflowId'>;

type AvatarUpdateLockResult = {
  alreadyCurrent: boolean;
  previousAvatarFileId: string | null;
};

@Injectable()
export class DbosSetAvatarWorkflow extends ConfiguredInstance implements SetAvatarWorkflow {
  constructor(
    private readonly dataSource: UserAccountsDbosDataSource,
    private readonly filesGateway: AvatarFilesGateway,
    private readonly events: OutboxEventsRepository,
    private readonly outboxWorker: OutboxWorker,
  ) {
    super('set-avatar-workflow');
  }

  async execute({ workflowId, ...input }: SetAvatarWorkflowParams): Promise<void> {
    try {
      const handle = await DBOS.startWorkflow(this, { workflowID: workflowId }).setAvatar(input);
      const status = await handle.getStatus();

      if (!status?.input) {
        throw new Error(`Workflow ${workflowId} has no stored input`);
      }

      const [storedInput] = status.input as [WorkflowInput];
      if (storedInput.userId !== input.userId || storedInput.fileId !== input.fileId) {
        throw new AvatarIdempotencyKeyConflictError();
      }

      await handle.getResult();
    } catch (cause) {
      const error = restoreAvatarError(cause);
      // Логируем технические сбои. Недоступность Files — тоже технический сбой,
      // хотя её ошибка наследуется от UserAccountsError. Ожидаемые бизнес-отказы не логируем.
      if (!(error instanceof UserAccountsError) || error instanceof AvatarFilesUnavailableError) {
        DBOS.logger.error(`SetAvatar failed; workflowId=${workflowId}: ${String(cause)}`);
      }
      throw error;
    }
  }

  @DBOS.workflow({ name: 'setAvatarV1', maxRecoveryAttempts: 100 })
  async setAvatar(input: WorkflowInput): Promise<void> {
    // UUID сохраняется в DBOS: повтор RPC использует тот же operationId в Files.
    const operationId = await DBOS.randomUUID();
    const lockResult = await this.acquireAvatarUpdate(input, operationId);
    if (lockResult.alreadyCurrent) {
      return;
    }

    try {
      await this.attachAvatar({ ...input, operationId });
    } catch (error) {
      const code = getAvatarErrorCode(error);
      // При неизвестном результате RPC файл мог прикрепиться: сохраняем блокировку.
      if (
        code === Code.AVATAR_FILE_NOT_FOUND ||
        code === Code.AVATAR_FILE_STATE_CONFLICT ||
        code === Code.INVALID_AVATAR_IMAGE
      ) {
        await this.releaseAvatarUpdate(input.userId, operationId);
      }
      throw error;
    }

    let deletionEventId: string | null;
    try {
      const result = await this.updateAvatarAndScheduleDeletion(
        input,
        operationId,
        lockResult.previousAvatarFileId,
      );
      deletionEventId = result.deletionEventId;
    } catch (error) {
      const code = getAvatarErrorCode(error);
      if (code === Code.USER_NOT_FOUND) {
        await this.scheduleNewAvatarDeletion(input);
        await this.releaseAvatarUpdate(input.userId, operationId);
      }
      throw error;
    }

    if (deletionEventId) {
      await this.startFileDeletionPublication(deletionEventId);
    }

    await this.releaseAvatarUpdate(input.userId, operationId);
  }

  @DBOS.step({
    retriesAllowed: true,
    maxAttempts: 5,
    intervalSeconds: 1,
    backoffRate: 2,
    shouldRetry: (error: unknown) => getAvatarErrorCode(error) === Code.AVATAR_FILES_UNAVAILABLE,
  })
  private async attachAvatar(params: AttachAvatarParams): Promise<void> {
    // Через gRPC просим Files проверить владельца, статус, размер и MIME файла
    // и атомарно перевести его из COMPLETED в ATTACHED.
    await this.filesGateway.attachAvatarUpload(params);
  }

  private async scheduleNewAvatarDeletion(params: AvatarFileParams): Promise<void> {
    // Сохраняем запрос удаления вместе с checkpoint. Брокер не участвует в транзакции.
    const eventId = await this.dataSource.runTransaction(
      async () => {
        const event = createAvatarDeletionEvent(params.userId, params.fileId);
        await this.events.add(event, this.dataSource.client);
        return event.eventId;
      },
      { name: 'scheduleNewAvatarDeletion' },
    );
    await this.startFileDeletionPublication(eventId);
  }

  @DBOS.step()
  private startFileDeletionPublication(eventId: string): Promise<void> {
    // Если процесс упадёт до отправки, сохранённое событие подхватит scheduler.
    void this.outboxWorker.publish(eventId);
    return Promise.resolve();
  }

  private acquireAvatarUpdate(input: WorkflowInput, operationId: string): Promise<AvatarUpdateLockResult> {
    // В транзакции проверяем пользователя, при необходимости создаём профиль
    // и захватываем блокировку через avatarUpdateId, сохраняя прежний avatarFileId.
    // Если выбран текущий аватар и другой операции нет, возвращаем alreadyCurrent.
    // runTransaction атомарно сохраняет данные и checkpoint; @DBOS.step() не нужен.
    return this.dataSource.runTransaction(
      async () => {
        // Блокируем User, поскольку Profile может ещё не существовать.
        const users = await this.dataSource.client.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM users WHERE id = ${input.userId} AND "deletedAt" IS NULL FOR UPDATE`;
        if (users.length === 0) {
          throw new UserNotFoundError();
        }

        // avatarUpdateId удерживает право замены между транзакциями и RPC.
        const profile = await this.dataSource.client.profile.findUnique({ where: { userId: input.userId } });
        if (profile?.avatarUpdateId) {
          throw new AvatarUpdateConflictError();
        }
        if (profile?.avatarFileId === input.fileId) {
          return { alreadyCurrent: true, previousAvatarFileId: profile.avatarFileId };
        }

        await this.dataSource.client.profile.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, avatarUpdateId: operationId },
          update: { avatarUpdateId: operationId },
        });
        // Прежний ID останется в checkpoint даже после переключения ссылки в профиле.
        return { alreadyCurrent: false, previousAvatarFileId: profile?.avatarFileId ?? null };
      },
      { name: 'acquireAvatarUpdate' },
    );
  }

  private updateAvatarAndScheduleDeletion(
    input: WorkflowInput,
    operationId: string,
    previousAvatarFileId: string | null,
  ): Promise<{ deletionEventId: string | null }> {
    // Новый avatarFileId, событие удаления прежнего файла и checkpoint фиксируются вместе.
    // Блокировку снимаем отдельным шагом после commit.
    return this.dataSource.runTransaction(
      async () => {
        // После RPC пользователь мог быть удалён; проверяем его снова под блокировкой.
        const users = await this.dataSource.client.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM users WHERE id = ${input.userId} AND "deletedAt" IS NULL FOR UPDATE`;

        if (users.length === 0) {
          throw new UserNotFoundError();
        }

        await this.dataSource.client.profile.update({
          where: { userId: input.userId, avatarUpdateId: operationId },
          data: { avatarFileId: input.fileId },
        });

        if (!previousAvatarFileId) return { deletionEventId: null };
        const event = createAvatarDeletionEvent(input.userId, previousAvatarFileId);
        await this.events.add(event, this.dataSource.client);
        return { deletionEventId: event.eventId };
      },
      { name: 'updateAvatarAndScheduleDeletion' },
    );
  }

  private releaseAvatarUpdate(userId: number, operationId: string): Promise<void> {
    // Отдельной транзакцией очищаем avatarUpdateId, если блокировка принадлежит
    // этой операции, разрешая следующую замену аватара.
    return this.dataSource.runTransaction(
      async () => {
        // Ноль строк допустим: своей блокировки уже нет. Чужую не снимаем.
        await this.dataSource.client.profile.updateMany({
          where: { userId, avatarUpdateId: operationId },
          data: { avatarUpdateId: null },
        });
      },
      { name: 'releaseAvatarUpdate' },
    );
  }
}
