-- Добавляем поле external_id для дедупликации при синхронизации с Bnovo
ALTER TABLE revenue ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS revenue_external_id_idx ON revenue(external_id) WHERE external_id IS NOT NULL;
