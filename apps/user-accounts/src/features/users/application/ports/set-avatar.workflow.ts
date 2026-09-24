export type SetAvatarParams = { userId: number; fileId: string; idempotencyKey: string };
export type SetAvatarWorkflowParams = { workflowId: string; userId: number; fileId: string };

export abstract class SetAvatarWorkflow {
  abstract execute(params: SetAvatarWorkflowParams): Promise<void>;
}
