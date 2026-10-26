-- Keep the financial Payment lifecycle independent from webhook recovery state.
ALTER TYPE "WebhookProcessingStatus" ADD VALUE 'RECONCILIATION_REQUIRED';
