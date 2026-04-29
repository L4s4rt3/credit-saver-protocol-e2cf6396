
-- Add DSJ-model columns to partes_diarios
ALTER TABLE public.partes_diarios
  ADD COLUMN IF NOT EXISTS kg_industria_manual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_podrido_bolsa_basura numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_inventario_sin_alta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_inventario_anterior_sin_alta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_produccion_calibrador numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_mujeres_calibrador numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_palets_brutos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kg_podrido_calibrador_auto numeric NOT NULL DEFAULT 0;

-- Storage policies for partes-archivos bucket (user-scoped via folder = user_id)
DO $$ BEGIN
  CREATE POLICY "partes_archivos_select_own"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'partes-archivos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "partes_archivos_insert_own"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'partes-archivos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "partes_archivos_delete_own"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'partes-archivos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
