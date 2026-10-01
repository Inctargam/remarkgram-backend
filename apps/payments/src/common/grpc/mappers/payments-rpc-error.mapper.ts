import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { type PaymentsError, PaymentsErrorCode } from '../../application/errors/payments.error.js';

const PAYMENTS_ERROR_TO_RPC_EXCEPTION_MAP = {
  [PaymentsErrorCode.INVALID_PAYMENT_METHOD]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_ID]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_PRICE]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_CURRENCY]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_PERIOD]: status.INVALID_ARGUMENT,
} satisfies Record<PaymentsErrorCode, status>;

export const mapPaymentsErrorToRpcException = (error: PaymentsError): RpcException => {
  const appErrorCode = error.code;
  const grpcStatus = PAYMENTS_ERROR_TO_RPC_EXCEPTION_MAP[appErrorCode];

  const metadata = new Metadata();
  metadata.set(APP_ERROR_CODE_METADATA_KEY, appErrorCode);

  return new RpcException({
    code: grpcStatus,
    message: error.message,
    metadata,
  });
};
