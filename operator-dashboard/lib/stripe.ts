import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function getRequiredEnv(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type StripeEnv = 'NEXT_PUBLIC_APP_URL';

function getRequiredAppEnv(name: StripeEnv) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getStripeServer() {
  if (!stripeClient) {
    stripeClient = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'));
  }
  return stripeClient;
}

export function getStripeWebhookSecret() {
  return getRequiredEnv('STRIPE_WEBHOOK_SECRET');
}

export function getAppBaseUrl() {
  return getRequiredAppEnv('NEXT_PUBLIC_APP_URL').replace(/\/$/, '');
}

export type StripeConnectStatus = 'unconnected' | 'pending_verification' | 'active' | 'restricted';
export type StripePayoutUiStatus = 'scheduled' | 'in_transit' | 'paid' | 'failed';

export function mapPayoutStatus(status: string | null | undefined): StripePayoutUiStatus {
  if (status === 'paid') return 'paid';
  if (status === 'in_transit') return 'in_transit';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'scheduled';
}

export function resolveConnectStatus(account: Stripe.Account | null | undefined): StripeConnectStatus {
  if (!account) return 'unconnected';
  if (account.requirements?.disabled_reason) return 'restricted';
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) return 'active';
  return 'pending_verification';
}
