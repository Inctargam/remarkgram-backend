import { applyDecorators } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';

export const ApiTestingController = () => applyDecorators(ApiTags('Testing'), ApiSecurity('testingKey'));
