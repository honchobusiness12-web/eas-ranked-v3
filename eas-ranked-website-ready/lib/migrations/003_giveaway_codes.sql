-- ============================================================
-- EAS Arena Premium Giveaway Code System — Database Migration
-- Run this once against your PostgreSQL database after 002.
-- ============================================================

-- ---------------------------------------------------------------------------
-- premium_codes — stores giveaway codes created by owners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS premium_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(64) NOT NULL UNIQUE,
  duration_days INT        NOT NULL,
  max_uses     INT         NOT NULL DEFAULT 1,
  uses         INT         NOT NULL DEFAULT 0,
  expires_at   TIMESTAMP,                        -- NULL = never expires
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by   VARCHAR(32) NOT NULL,             -- Discord user ID of owner
  created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_codes_code      ON premium_codes(code);
CREATE INDEX IF NOT EXISTS idx_premium_codes_active    ON premium_codes(active);
CREATE INDEX IF NOT EXISTS idx_premium_codes_expires   ON premium_codes(expires_at);

-- ---------------------------------------------------------------------------
-- premium_code_redemptions — tracks who redeemed which code
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS premium_code_redemptions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id            UUID        NOT NULL REFERENCES premium_codes(id) ON DELETE CASCADE,
  user_id            VARCHAR(32) NOT NULL,        -- Discord user ID
  redeemed_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
  premium_expires_at TIMESTAMP   NOT NULL,        -- when their giveaway premium ends
  UNIQUE (code_id, user_id)                       -- one redemption per user per code
);

CREATE INDEX IF NOT EXISTS idx_pcr_code_id ON premium_code_redemptions(code_id);
CREATE INDEX IF NOT EXISTS idx_pcr_user_id ON premium_code_redemptions(user_id);

-- ---------------------------------------------------------------------------
-- players table — add giveaway premium columns (safe to run multiple times)
-- ---------------------------------------------------------------------------
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS premium_source      VARCHAR(32);
-- premium_source values: 'discord_role' | 'giveaway_code' | 'staff' | 'owner' | 'developer'

CREATE INDEX IF NOT EXISTS idx_players_premium_expires ON players(premium_expires_at)
  WHERE premium_expires_at IS NOT NULL;
