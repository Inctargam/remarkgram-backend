import { Inject, Injectable } from '@nestjs/common';
import { FILES_SERVICE } from './files-client.constants.js';
import { ClientProxy } from '@nestjs/microservices';
import type { FilesPingResponse, FilesTestEventRequest } from '@libs/contracts/files/index.js';
import { FILES_EVENTS, FILES_PATTERNS } from '@libs/contracts/files/index.js';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FilesClientService {
  constructor(@Inject(FILES_SERVICE) private client: ClientProxy) {}

  cmdTestPing(): Promise<FilesPingResponse> {
    return firstValueFrom(this.client.send(FILES_PATTERNS.PING, {}));
  }

  emitTestEvent(): Promise<void> {
    const event: FilesTestEventRequest = {
      source: 'api-gateway',
      emittedAt: new Date().toISOString(),
    };

    return firstValueFrom(this.client.emit(FILES_EVENTS.PING, event));
  }
}
