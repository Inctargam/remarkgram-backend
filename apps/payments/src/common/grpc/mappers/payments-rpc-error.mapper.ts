import { APP_ERROR_CODE_METADATA_KEY } from '@app/grpc';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { type PaymentsError, PaymentsErrorCode } from '../../domain/errors/payments.error.js';

const PAYMENTS_ERROR_TO_RPC_EXCEPTION_MAP = {
  [PaymentsErrorCode.INVALID_PAYMENT_METHOD]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_ID]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_PRICE]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_CURRENCY]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PLAN_PERIOD]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_ID]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_REFERENCE]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_AMOUNT]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_CURRENCY]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_PERIOD]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_PROVIDER]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_IDEMPOTENT_KEY]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_SUBSCRIPTION_ID]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.INVALID_PAYMENT_STATE]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.PLAN_NOT_FOUND]: status.NOT_FOUND,
  [PaymentsErrorCode.PAYMENT_NOT_FOUND]: status.NOT_FOUND,
  [PaymentsErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT]: status.ALREADY_EXISTS,
  [PaymentsErrorCode.PAYMENT_INITIAL_RESERVATION_CONFLICT]: status.ALREADY_EXISTS,
  [PaymentsErrorCode.PAYMENT_CHECKOUT_RECONCILIATION_REQUIRED]: status.FAILED_PRECONDITION,
  [PaymentsErrorCode.PAYMENT_ACCESS_DENIED]: status.PERMISSION_DENIED,
  [PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE]: status.UNAVAILABLE,
  [PaymentsErrorCode.PAYMENT_PROVIDER_VALIDATION_FAILED]: status.INVALID_ARGUMENT,
  [PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN]: status.ABORTED,
  [PaymentsErrorCode.PAYMENT_PROVIDER_RESULT_MISMATCH]: status.FAILED_PRECONDITION,
  [PaymentsErrorCode.PAYMENT_WEBHOOK_ENQUEUE_UNAVAILABLE]: status.UNAVAILABLE,
  [PaymentsErrorCode.PAYMENT_CUSTOMER_PROVIDER_FAILED]: status.UNAVAILABLE,
  [PaymentsErrorCode.PAYMENT_SUBSCRIPTION_CONTEXT_FAILED]: status.UNAVAILABLE,
  [PaymentsErrorCode.PAYMENT_SUBSCRIPTION_APPLICATION_CONFLICT]: status.FAILED_PRECONDITION,
  [PaymentsErrorCode.PAYMENT_PLAN_UNAVAILABLE]: status.UNAVAILABLE,
  [PaymentsErrorCode.PAYMENT_PERSISTENCE_FAILED]: status.INTERNAL,
  [PaymentsErrorCode.RENEWAL_PAYMENT_CONTEXT_UNAVAILABLE]: status.FAILED_PRECONDITION,
  [PaymentsErrorCode.PAYMENT_INCONSISTENT_STATE]: status.FAILED_PRECONDITION,
  [PaymentsErrorCode.INVALID_PROVIDER_EVENT]: status.INVALID_ARGUMENT,
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
