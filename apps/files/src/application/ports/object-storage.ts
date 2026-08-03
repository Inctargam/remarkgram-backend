export type CreatePresignedUploadParams = {
  objectKey: string;
  contentType: string;
  size: number;
  expiresInSeconds: number;
};

export type PresignedUpload = {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
};

export abstract class ObjectStorage {
  abstract createPresignedUpload(params: CreatePresignedUploadParams): Promise<PresignedUpload>;
}
