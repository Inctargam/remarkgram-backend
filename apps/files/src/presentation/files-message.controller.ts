import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  FILES_EVENTS,
  FILES_PATTERNS,
  type FilesPingResponse,
  type FilesTestEventRequest,
} from '../../../../libs/contracts/files/index.js';

@Controller()
export class FilesMessageController {
  @MessagePattern(FILES_PATTERNS.PING)
  ping(): FilesPingResponse {
    return {
      service: 'files',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @EventPattern(FILES_EVENTS.PING)
  handle(@Payload() event: FilesTestEventRequest): void {
    console.log(`Received test event from ${event.source} at ${event.emittedAt}`);
  }
}
