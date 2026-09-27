export type AvatarFileParams = { userId: number; fileId: string };
export type AttachAvatarParams = AvatarFileParams & { operationId: string };

export abstract class AvatarFilesGateway {
  abstract attachAvatarFile(params: AttachAvatarParams): Promise<void>;
}
