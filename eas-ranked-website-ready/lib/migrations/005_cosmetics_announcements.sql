-- ============================================================
-- EAS Arena — Cosmetics & Announcements Migration
-- Run this once against your PostgreSQL database after 004.
-- ============================================================

-- ---------------------------------------------------------------------------
-- player_cosmetics — per-user badge gradient and username color selections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_cosmetics (
  user_id        VARCHAR(32) PRIMARY KEY,
  badge_gradient VARCHAR(64),
  username_color VARCHAR(32),
  updated_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- announcements — developer-authored live announcements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(255) NOT NULL,
  message       TEXT         NOT NULL,
  color         VARCHAR(32)  NOT NULL DEFAULT 'blue',
  sound_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
  created_by    VARCHAR(32)  NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  dismissed_by  JSONB        NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
