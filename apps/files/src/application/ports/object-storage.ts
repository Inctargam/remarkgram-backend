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

export type ObjectMetadata = {
  size?: number;
  contentType?: string;
};

export abstract class ObjectStorage {
  abstract createPresignedUpload(params: CreatePresignedUploadParams): Promise<PresignedUpload>;

  abstract getObjectMetadata(objectKey: string): Promise<ObjectMetadata | null>;
}
