import { Module } from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { FilesModule } from './files/files.module.js';

@Module({
  imports: [FilesModule],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayService],
})
export class ApiGatewayModule {}
