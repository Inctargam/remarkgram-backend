import type { Observable } from 'rxjs';
import type { ImageContentType } from './image-upload-policy.js';

export interface ImageUploadMetadata {
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
}

export interface InitiateImageUploadsResponse {
  sessions: ImageUploadSession[];
}

export interface FilesServiceClient {
  initiateImageUploads(request: InitiateImageUploadsRequest): Observable<InitiateImageUploadsResponse>;
}
