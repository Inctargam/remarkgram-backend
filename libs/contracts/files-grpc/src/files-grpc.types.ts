import type { Observable } from 'rxjs';

export interface UploadFileRequest {
  originalFilename: string;
}

export interface UploadFileResponse {
  id: string;
}

export interface FilesServiceClient {
  uploadFile(request: UploadFileRequest): Observable<UploadFileResponse>;
}
