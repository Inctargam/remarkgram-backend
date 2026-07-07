export class ApiErrorResponseDto {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly message: string,
  ) {}
}
