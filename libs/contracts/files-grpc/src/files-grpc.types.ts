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

export interface ReserveImageUploadsRequest {
  userId: string;
  uploadIds: string[];
  reservationId: string;
}

export type ReserveImageUploadsResponse = Record<string, never>;

export interface AttachReservedImageUploadsRequest {
  userId: string;
  reservationId: string;
}

export type AttachReservedImageUploadsResponse = Record<string, never>;

export interface ReleaseReservedImageUploadsRequest {
  userId: string;
  reservationId: string;
}

export type ReleaseReservedImageUploadsResponse = Record<string, never>;

export interface FilesServiceClient {
  initiateImageUploads(request: InitiateImageUploadsRequest): Observable<InitiateImageUploadsResponse>;
  completeImageUploads(request: CompleteImageUploadsRequest): Observable<CompleteImageUploadsResponse>;
  reserveImageUploads(request: ReserveImageUploadsRequest): Observable<ReserveImageUploadsResponse>;
  attachReservedImageUploads(
    request: AttachReservedImageUploadsRequest,
  ): Observable<AttachReservedImageUploadsResponse>;
  releaseReservedImageUploads(
    request: ReleaseReservedImageUploadsRequest,
  ): Observable<ReleaseReservedImageUploadsResponse>;
}
