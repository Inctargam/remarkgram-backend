import { Controller, Logger } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { FILES_PATTERNS, type FilesPingResponse } from '../../../../libs/contracts/files/index.js';

@Controller()
export class FilesMessageController {
  logger: Logger;
  constructor() {
    this.logger = new Logger(FilesMessageController.name);
  }
  @MessagePattern(FILES_PATTERNS.PING)
  ping(): FilesPingResponse {
    this.logger.debug('Message Ping successfully');
    return {
      service: 'files',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  // @EventPattern(FILES_EVENTS.PING)
  // handle(@Payload() event: FilesTestEventRequest): void {
  //   console.log(`Received test event from ${event.source} at ${event.emittedAt}`);
  // }
}
