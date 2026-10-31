export type ChangeProviderSubscriptionAutoRenewalParams = {
  provider: 'STRIPE';
  providerSubscriptionId: string;
  autoRenewalChangeId: string;
};

export type ChangeProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};

/** D1 validates the provider confirmation before returning a successful result. */
export abstract class ProviderSubscriptionAutoRenewalGateway {
  abstract enable(
    params: ChangeProviderSubscriptionAutoRenewalParams,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;
  abstract disable(
    params: ChangeProviderSubscriptionAutoRenewalParams,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;
}
