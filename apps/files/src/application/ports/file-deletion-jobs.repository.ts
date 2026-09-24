import type { TransactionContext } from './unit-of-work.js';

export type AddFileDeletionJobRepositoryParams = {
  data: {
    fileId: string;
    objectKey: string;
    availableAt: Date;
  }[];
};

export type ClaimFileDeletionJobsParams = {
  batchSize: number;
  maxAttempts: number;
};
export type ClaimedFileDeletionJob = {
  fileId: string;
  objectKey: string;
  leaseUntil: Date;
};

export abstract class FileDeletionJobsRepository {
  abstract addMany(params: AddFileDeletionJobRepositoryParams, ctx?: TransactionContext): Promise<void>;
  abstract claimBatch(params: ClaimFileDeletionJobsParams): Promise<ClaimedFileDeletionJob[]>;
  abstract markAsDone(fileId: string, leaseUntil: Date, ctx?: TransactionContext): Promise<boolean>;
  abstract recordFailure(
    fileId: string,
    leaseUntil: Date,
    lastError: string,
    maxAttempts: number,
  ): Promise<boolean>;
}
