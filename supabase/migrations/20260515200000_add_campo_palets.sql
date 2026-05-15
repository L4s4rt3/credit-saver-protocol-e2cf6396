-- Palets de campo (duplicados) deben excluirse de todo analisis
ALTER TABLE public.palets_dia
  ADD COLUMN IF NOT EXISTS campo boolean NOT NULL DEFAULT false;

ALTER TABLE public.partes_diarios
  ADD COLUMN IF NOT EXISTS kg_palets_campo numeric NOT NULL DEFAULT 0;
