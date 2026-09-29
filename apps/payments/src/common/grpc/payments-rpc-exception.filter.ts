import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { PaymentsError } from '../application/errors/payments.error.ts';
import { mapPaymentsErrorToRpcException } from './mappers/payments-rpc-error.mapper.ts';

@Catch(PaymentsError)
export class PaymentsRpcExceptionFilter extends BaseRpcExceptionFilter {
  override catch(error: PaymentsError, _host: ArgumentsHost): ReturnType<BaseRpcExceptionFilter['catch']> {
    // Mapper оборачивает доменную ошибку в RpcException, а BaseRpcExceptionFilter извлекает из него payload
    // и завершает RPC error-событием. Далее grpc-js превращает payload.code в trailer grpc-status,
    // payload.message — в grpc-message, а payload.metadata отправляет как trailing metadata.
    return super.catch(mapPaymentsErrorToRpcException(error), _host);
  }
}
