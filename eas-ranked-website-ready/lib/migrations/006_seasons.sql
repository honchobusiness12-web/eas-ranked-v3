-- ============================================================
-- EAS Arena — Seasons Migration
-- Run this once against your PostgreSQL database after 005.
-- ============================================================

-- ---------------------------------------------------------------------------
-- seasons — season management table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasons (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT         NOT NULL DEFAULT '',
  status      VARCHAR(32)  NOT NULL DEFAULT 'upcoming'
                           CHECK (status IN ('active', 'paused', 'ended', 'upcoming')),
  start_date  TIMESTAMP,
  end_date    TIMESTAMP,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  created_by  VARCHAR(32)  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seasons_status     ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_start_date ON seasons(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_seasons_created_at ON seasons(created_at DESC);
