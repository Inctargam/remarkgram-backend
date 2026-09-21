export type ImageUploadMetadataInput = {
  clientFileId: string;
  originalFilename: string;
  contentType: string;
  size: number;
};

export type ImageUploadSession = {
  id: string;
  clientFileId: string;
  url: string;
  fields: Record<string, string>;
};
