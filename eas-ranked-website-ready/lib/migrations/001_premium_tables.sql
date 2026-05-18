-- ============================================================
-- EAS Arena Premium System — Database Migration
-- Run this once against your PostgreSQL database.
-- Tables are also auto-created on first API call via ensurePremiumTables().
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      BIGINT NOT NULL UNIQUE,
  lemonsqueezy_customer_id     VARCHAR(255),
  lemonsqueezy_subscription_id VARCHAR(255),
  subscription_status          VARCHAR(50),   -- 'active', 'canceled', 'past_due', 'expired'
  current_period_end           TIMESTAMP,
  created_at                   TIMESTAMP DEFAULT NOW(),
  updated_at                   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(subscription_status);

CREATE TABLE IF NOT EXISTS cosmetics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           BIGINT NOT NULL UNIQUE,
  theme             VARCHAR(50)  DEFAULT 'dark',
  profile_banner    VARCHAR(255),
  rank_badge_style  VARCHAR(50)  DEFAULT 'default',
  player_title      VARCHAR(100),
  profile_color     VARCHAR(50)  DEFAULT '#FF6B6B',
  achievement_frame VARCHAR(50)  DEFAULT 'default',
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetics_user_id ON cosmetics(user_id);
