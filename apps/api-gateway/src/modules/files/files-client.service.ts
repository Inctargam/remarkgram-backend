import { Inject, Injectable, Logger } from '@nestjs/common';
import { FILES_SERVICE } from './files-client.constants.js';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { FILES_PATTERNS, type FilesPingResponse } from '../../../../../libs/contracts/files/index.js';

@Injectable()
export class FilesClientService {
  logger: Logger;
  constructor(@Inject(FILES_SERVICE) private client: ClientProxy) {
    this.logger = new Logger(FilesClientService.name);
  }

  cmdTestPing(): Promise<FilesPingResponse> {
    this.logger.debug('Gateway send cmd to files services');
    return firstValueFrom(this.client.send(FILES_PATTERNS.PING, {}));
  }
}
