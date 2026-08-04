import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { FilesError } from '../../../application/errors/files.error.js';
import { mapFilesErrorToRpcException } from './files-rpc-error.mapper.js';

@Catch(FilesError)
export class FilesRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: FilesError, host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    return super.catch(mapFilesErrorToRpcException(error), host);
  }
}
