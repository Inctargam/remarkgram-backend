export type ImageUploadMetadata = {
  contentType: string;
  size: number;
};

export type ImageUploadMetadataInput = ImageUploadMetadata & {
  clientFileId: string;
  originalFilename: string;
};

export type ImageUploadSession = {
  id: string;
  clientFileId: string;
  url: string;
  fields: Record<string, string>;
};
