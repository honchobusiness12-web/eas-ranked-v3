-- ============================================================
-- EAS Arena CR Audit Log System — Database Migration
-- Run this once against your PostgreSQL database after 003.
-- ============================================================

-- ---------------------------------------------------------------------------
-- cr_audit_logs — immutable record of every CR change made by an admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cr_audit_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  VARCHAR(32) NOT NULL,             -- Discord user ID of the player edited
  old_cr     INT         NOT NULL,             -- CR value before the edit
  new_cr     INT         NOT NULL,             -- CR value after the edit
  edited_by  VARCHAR(32) NOT NULL,             -- Discord user ID of the admin who made the change
  edited_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  reason     TEXT        NOT NULL,             -- Required justification for the change
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_audit_logs_player_id ON cr_audit_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_cr_audit_logs_edited_by ON cr_audit_logs(edited_by);
CREATE INDEX IF NOT EXISTS idx_cr_audit_logs_edited_at ON cr_audit_logs(edited_at DESC);
