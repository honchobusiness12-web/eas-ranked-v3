-- ============================================================
-- EAS Arena Premium System — Developer Premium Migration
-- Grants permanent premium access to the developer account.
-- Run this once against your PostgreSQL database after 001.
-- ============================================================

-- Ensure the subscriptions table exists before inserting
-- (safe to run even if 001 has already been applied)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      BIGINT NOT NULL UNIQUE,
  lemonsqueezy_customer_id     VARCHAR(255),
  lemonsqueezy_subscription_id VARCHAR(255),
  subscription_status          VARCHAR(50),
  current_period_end           TIMESTAMP,
  created_at                   TIMESTAMP DEFAULT NOW(),
  updated_at                   TIMESTAMP DEFAULT NOW()
);

-- Insert developer user with a far-future expiry (permanent premium).
-- ON CONFLICT ensures this is idempotent — safe to re-run at any time.
INSERT INTO subscriptions (
  user_id,
  subscription_status,
  current_period_end,
  created_at,
  updated_at
)
VALUES (
  733871667788644445,
  'active',
  '2099-12-31 23:59:59',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
  subscription_status = 'active',
  current_period_end  = '2099-12-31 23:59:59',
  updated_at          = NOW();
