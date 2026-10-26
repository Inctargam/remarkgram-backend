import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { GetPaymentsResponseDto } from '../../dto/get-payments-response.dto.js';

export const ApiGetPayments = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get payment history',
      description:
        'Returns only payments owned by the authenticated user, ordered by creation time and payment ID descending.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'The requested page of the current user payment history.',
      type: GetPaymentsResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'pageNumber or pageSize is outside the supported integer range.',
      type: ValidationErrorResponseDto,
    }),
  );
