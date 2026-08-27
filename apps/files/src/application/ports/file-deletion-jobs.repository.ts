export type AddFileDeletionJobRepositoryParams = {
  data: {
    fileId: string;
    objectKey: string;
    availableAt: Date;
  }[];
};

export type FindAvailableFileDeletionJobRepositoryParams = {
  batchSize: number;
  maxAttempts: number;
};
export type FindAvailableFileDeletionJobRepositoryResult =
  | {
      fileId: string;
      objectKey: string;
      leaseUntil: Date;
    }[]
  | null;

export abstract class FileDeletionJobsRepository {
  abstract addMany(params: AddFileDeletionJobRepositoryParams, ctx?: TransactionContext): Promise<void>;
  abstract findAvailableBatch(
    params: FindAvailableFileDeletionJobRepositoryParams,
  ): Promise<FindAvailableFileDeletionJobRepositoryResult>;
  abstract markAsDone(fileId: string, leaseUntil: Date, ctx?: TransactionContext): Promise<boolean>;
  abstract resolveFailedAttempt(
    fileId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean>;
}
import type { TransactionContext } from './unit-of-work.js';
