import { Inject, Injectable } from '@nestjs/common';
import { FILES_SERVICE } from './files-client.constants.js';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { FILES_PATTERNS, type FilesPingResponse } from '../../../../../libs/contracts/files/index.js';

@Injectable()
export class FilesClientService {
  constructor(@Inject(FILES_SERVICE) private client: ClientProxy) {}

  cmdTestPing(): Promise<FilesPingResponse> {
    return firstValueFrom(this.client.send(FILES_PATTERNS.PING, {}));
  }
}
