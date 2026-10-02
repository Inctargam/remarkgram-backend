import { randomUUID } from 'node:crypto';
import { Currency, PeriodUnit } from '../../plans/domain/plan.entity.js';
import {
  InvalidPaymentAmountError,
  InvalidPaymentCurrencyError,
  InvalidPaymentIdempotentKeyError,
  InvalidPaymentIdError,
  InvalidPaymentProviderError,
  InvalidPaymentReferenceError,
  InvalidPaymentStateError,
  InvalidPaymentSubscriptionIdError,
} from '../application/errors/payment.errors.js';

export enum PaymentProvider {
  STRIPE = 'STRIPE',
}
export enum PaymentStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}
export type PaymentProviderSnapshot = Readonly<Record<string, unknown>>;

export type CreatePaymentProps = {
  userId: number;
  planId: number;
  amount: number;
  currency: Currency;
  periodCount: number;
  periodUnit: PeriodUnit;
  providerType: PaymentProvider;
  idempotentKey: string;
};
export type RestorePaymentProps = CreatePaymentProps & {
  id: string;
  providerCheckoutId: string | null;
  providerPaymentId: string | null;
  providerSnapshot: PaymentProviderSnapshot | null;
  subscriptionId: string | null;
  status: PaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
};

export class Payment {
  readonly id: string;
  readonly userId: number;
  readonly planId: number;
  readonly amount: number;
  readonly currency: Currency;
  readonly periodCount: number;
  readonly periodUnit: PeriodUnit;
  readonly providerType: PaymentProvider;
  readonly idempotentKey: string;
  readonly providerCheckoutId: string | null;
  readonly providerPaymentId: string | null;
  readonly providerSnapshot: PaymentProviderSnapshot | null;
  readonly subscriptionId: string | null;
  readonly status: PaymentStatus;
  readonly createdAt: Date | null;
  readonly paidAt: Date | null;

  private constructor(props: RestorePaymentProps | (CreatePaymentProps & { id: string })) {
    this.id = props.id;
    this.userId = props.userId;
    this.planId = props.planId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.periodCount = props.periodCount;
    this.periodUnit = props.periodUnit;
    this.providerType = props.providerType;
    this.idempotentKey = props.idempotentKey.toLowerCase();
    this.providerCheckoutId = 'providerCheckoutId' in props ? props.providerCheckoutId : null;
    this.providerPaymentId = 'providerPaymentId' in props ? props.providerPaymentId : null;
    this.providerSnapshot = 'providerSnapshot' in props ? props.providerSnapshot : null;
    this.subscriptionId = 'subscriptionId' in props ? (props.subscriptionId?.toLowerCase() ?? null) : null;
    this.status = 'status' in props ? props.status : PaymentStatus.CREATED;
    this.createdAt = 'createdAt' in props ? new Date(props.createdAt) : null;
    this.paidAt = 'paidAt' in props && props.paidAt ? new Date(props.paidAt) : null;
  }

  static create(props: CreatePaymentProps): Payment {
    Payment.assertCommonProps(props);
    return new Payment({ ...props, id: randomUUID() });
  }
  static restore(props: RestorePaymentProps): Payment {
    Payment.assertId(props.id);
    Payment.assertCommonProps(props);
    Payment.assertStatus(props.status);
    Payment.assertDate('createdAt', props.createdAt, false);
    Payment.assertDate('paidAt', props.paidAt, true);
    Payment.assertOptionalString('providerCheckoutId', props.providerCheckoutId);
    Payment.assertOptionalString('providerPaymentId', props.providerPaymentId);
    Payment.assertSubscriptionId(props.subscriptionId);
    if (props.status === PaymentStatus.SUCCEEDED && props.paidAt === null)
      throw new InvalidPaymentStateError('paidAt', props.paidAt);
    return new Payment(props);
  }

  static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    if (from === to) return true;
    return (
      (from === PaymentStatus.CREATED && [PaymentStatus.PENDING, PaymentStatus.FAILED].includes(to)) ||
      (from === PaymentStatus.PENDING &&
        [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED, PaymentStatus.CANCELED].includes(to))
    );
  }

  private static assertCommonProps(props: CreatePaymentProps): void {
    Payment.assertReference('userId', props.userId);
    Payment.assertReference('planId', props.planId);
    if (!Number.isSafeInteger(props.amount) || props.amount <= 0)
      throw new InvalidPaymentAmountError(props.amount);
    if (!Object.values(Currency).includes(props.currency))
      throw new InvalidPaymentCurrencyError(props.currency);
    if (
      !Number.isSafeInteger(props.periodCount) ||
      props.periodCount <= 0 ||
      !Object.values(PeriodUnit).includes(props.periodUnit)
    )
      throw new InvalidPaymentStateError('period', `${props.periodUnit}/${props.periodCount}`);
    if (!Object.values(PaymentProvider).includes(props.providerType))
      throw new InvalidPaymentProviderError(props.providerType, null);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(props.idempotentKey))
      throw new InvalidPaymentIdempotentKeyError(props.idempotentKey);
  }
  private static assertId(id: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      throw new InvalidPaymentIdError(id);
  }
  private static assertReference(reference: 'userId' | 'planId', value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) throw new InvalidPaymentReferenceError(reference, value);
  }
  private static assertStatus(status: PaymentStatus): void {
    if (!Object.values(PaymentStatus).includes(status)) throw new InvalidPaymentStateError('status', status);
  }
  private static assertDate(field: 'createdAt' | 'paidAt', value: Date | null, nullable: boolean): void {
    if ((value === null && !nullable) || (value !== null && Number.isNaN(value.getTime())))
      throw new InvalidPaymentStateError(field, value);
  }
  private static assertOptionalString(
    field: 'providerCheckoutId' | 'providerPaymentId',
    value: string | null,
  ): void {
    if (value !== null && value.trim().length === 0) throw new InvalidPaymentStateError(field, value);
  }
  private static assertSubscriptionId(value: string | null): void {
    if (
      value !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
      throw new InvalidPaymentSubscriptionIdError(value);
  }
}
