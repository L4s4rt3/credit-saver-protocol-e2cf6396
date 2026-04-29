-- Crear enums
DO $$ BEGIN
  CREATE TYPE public.parte_estado AS ENUM ('Borrador', 'Enviado', 'Analizado', 'Validado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.archivo_tipo AS ENUM ('gstocks', 'produccion', 'foto_lotes', 'GSTOCK', 'Produccion', 'FotoLotes', 'Otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Crear partes_diarios
CREATE TABLE IF NOT EXISTS public.partes_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fecha date NOT NULL,
  estado public.parte_estado NOT NULL DEFAULT 'Borrador',
  kg_produccion_total numeric NOT NULL DEFAULT 0,
  kg_mujeres_l numeric NOT NULL DEFAULT 0,
  kg_podrido_calibrador numeric NOT NULL DEFAULT 0,
  kg_podrido_calibrador_auto numeric NOT NULL DEFAULT 0,
  kg_palets_alta numeric NOT NULL DEFAULT 0,
  kg_palets_brutos numeric NOT NULL DEFAULT 0,
  kg_mujeres_calibrador numeric NOT NULL DEFAULT 0,
  kg_produccion_calibrador numeric NOT NULL DEFAULT 0,
  reciclado_manual numeric NOT NULL DEFAULT 0,
  malla_z1 numeric NOT NULL DEFAULT 0,
  malla_z2 numeric NOT NULL DEFAULT 0,
  podrido_manual numeric NOT NULL DEFAULT 0,
  inventario_final numeric NOT NULL DEFAULT 0,
  kg_industria_manual numeric NOT NULL DEFAULT 0,
  kg_podrido_bolsa_basura numeric NOT NULL DEFAULT 0,
  kg_inventario_sin_alta numeric NOT NULL DEFAULT 0,
  kg_inventario_anterior_sin_alta numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Crear partes_archivos
CREATE TABLE IF NOT EXISTS public.partes_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.partes_diarios(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type public.archivo_tipo,
  mime_type text,
  file_size bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.partes_diarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_partes" ON public.partes_diarios;
CREATE POLICY "users_own_partes" ON public.partes_diarios
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.partes_archivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_archivos" ON public.partes_archivos;
CREATE POLICY "users_own_archivos" ON public.partes_archivos
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
