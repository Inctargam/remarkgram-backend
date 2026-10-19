export const PAYMENT_STATUS_DESCRIPTION = `Current payment lifecycle status. Possible values:

- CREATED — the local payment exists, but a provider checkout has not been attached yet.
- PENDING — checkout exists; financial success has not been confirmed.
- SUCCEEDED — financial success was confirmed; paidAt contains the confirmation time.
- FAILED — a terminal provider failure was proven.
- CANCELED — the provider terminally canceled an unpaid payment attempt.`;
