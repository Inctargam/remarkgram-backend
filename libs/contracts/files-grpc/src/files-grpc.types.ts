import type { Observable } from 'rxjs';
import type { ImageContentType } from './image-upload-policy.js';

export interface ImageUploadMetadata {
  originalFilename: string;
  contentType: ImageContentType;
  size: number;
}

export interface CreateImageUploadsRequest {
  userId: string;
  images: ImageUploadMetadata[];
}

export interface ImageUploadSession {
  id: string;
}

export interface CreateImageUploadsResponse {
  uploads: ImageUploadSession[];
}

export interface FilesServiceClient {
  createImageUploads(request: CreateImageUploadsRequest): Observable<CreateImageUploadsResponse>;
}
