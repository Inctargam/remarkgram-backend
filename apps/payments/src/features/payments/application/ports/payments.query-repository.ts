export type PaymentStatusView = {
  paymentId: string;
  status: string;
  paidAt?: string;
};

export type PaymentListItemView = {
  paymentId: string;
  planId: number;
  amount: number;
  currency: string;
  periodCount: number;
  periodUnit: string;
  provider: string;
  type: string;
  status: string;
  createdAt: string;
  paidAt?: string;
};

export type FindUserPaymentsPageParams = {
  userId: number;
  pageNumber: number;
  pageSize: number;
};

export type FindUserPaymentsPageResult = {
  items: PaymentListItemView[];
  totalCount: number;
};

export abstract class PaymentsQueryRepository {
  abstract findStatusByUserAndId(userId: number, paymentId: string): Promise<PaymentStatusView | null>;
  abstract findUserPaymentsPage(params: FindUserPaymentsPageParams): Promise<FindUserPaymentsPageResult>;
}
