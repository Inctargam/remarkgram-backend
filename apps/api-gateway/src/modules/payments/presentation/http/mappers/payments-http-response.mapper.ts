import type {
  CreateCheckoutResponse,
  GetPaymentStatusResponse,
  GetPaymentsResponse,
  GetPlansResponse,
} from '@app/payments-grpc';
import type { CreateCheckoutResponseDto } from '../dto/create-checkout-response.dto.js';
import type { GetPaymentsResponseDto } from '../dto/get-payments-response.dto.js';
import type { PaymentStatusResponseDto } from '../dto/payment-status-response.dto.js';
import type { PlanResponseDto } from '../dto/plan-response.dto.js';

export class PaymentsHttpResponseMapper {
  static toCreateCheckout(response: CreateCheckoutResponse): CreateCheckoutResponseDto {
    return {
      ...response,
      checkoutUrl: response.checkoutUrl ?? null,
    };
  }

  static toPlans(response: GetPlansResponse): PlanResponseDto[] {
    return response.items;
  }

  static toPaymentStatus(response: GetPaymentStatusResponse): PaymentStatusResponseDto {
    return {
      ...response,
      paidAt: response.paidAt ?? null,
    };
  }

  static toPayments(response: GetPaymentsResponse): GetPaymentsResponseDto {
    return {
      ...response,
      items: response.items.map((payment) => ({
        ...payment,
        paidAt: payment.paidAt ?? null,
      })),
    };
  }
}
