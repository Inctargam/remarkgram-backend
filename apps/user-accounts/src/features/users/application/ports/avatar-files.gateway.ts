export type AvatarFileParams = { userId: number; fileId: string };
export type AttachAvatarParams = AvatarFileParams & { operationId: string };

export abstract class AvatarFilesGateway {
  abstract attachAvatarUpload(params: AttachAvatarParams): Promise<void>;
  abstract scheduleAttachedFileDeletion(params: AvatarFileParams): Promise<void>;
}
