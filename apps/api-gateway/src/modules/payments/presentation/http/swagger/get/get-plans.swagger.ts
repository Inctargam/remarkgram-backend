import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { PlanResponseDto } from '../../dto/plan-response.dto.js';

export const ApiGetPlans = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get available plans',
      description: 'Returns the public plan catalog ordered by plan ID.',
    }),
    ApiOkResponse({ description: 'Available plans.', type: [PlanResponseDto] }),
  );
