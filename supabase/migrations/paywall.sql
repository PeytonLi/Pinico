-- Paywall: store Stripe subscription status on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
