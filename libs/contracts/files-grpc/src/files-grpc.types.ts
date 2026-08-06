import type { Observable } from 'rxjs';
import type { ImageContentType } from './image-upload-policy.js';

export interface ImageUploadMetadata {
  clientFileId: string;
  originalFilename: string;
  contentType: ImageContentType;
  size: number;
}

export interface InitiateImageUploadsRequest {
  userId: string;
  images: ImageUploadMetadata[];
}

export interface ImageUploadSession {
  id: string;
  clientFileId: string;
  url: string;
  fields: Record<string, string>;
}

export interface InitiateImageUploadsResponse {
  sessions: ImageUploadSession[];
}

export interface CompleteImageUploadsRequest {
  userId: string;
  uploadIds: string[];
}

export type CompleteImageUploadsResponse = Record<string, never>;

export interface EnsureCompletedImageUploadsRequest {
  userId: string;
  imageIds: string[];
}

export type EnsureCompletedImageUploadsResponse = Record<string, never>;

export interface FilesServiceClient {
  initiateImageUploads(request: InitiateImageUploadsRequest): Observable<InitiateImageUploadsResponse>;
  completeImageUploads(request: CompleteImageUploadsRequest): Observable<CompleteImageUploadsResponse>;
  ensureCompletedImageUploads(
    request: EnsureCompletedImageUploadsRequest,
  ): Observable<EnsureCompletedImageUploadsResponse>;
}
