-- Migration 007: tabela de usuários da aplicação
-- Substitui os usuários hard-coded do user-store por persistência real.
-- Em modo de desenvolvimento (DB_ENABLED=false) o user-store em memória continua ativo.

CREATE TABLE IF NOT EXISTS usuarios (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email       TEXT        NOT NULL UNIQUE,
  senha_hash  TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION atualizar_updated_at_usuarios()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_usuarios();
