import { ApiErrorResponseDto } from '../../common/http/api-error-response.dto.js';

/**
 * Builds Swagger examples for application-level errors that use the shared ApiErrorResponseDto shape.
 */
export const createApiErrorResponseExample = (
  statusCode: number,
  code: string,
  message: string,
): ApiErrorResponseDto => new ApiErrorResponseDto(statusCode, code, message);
