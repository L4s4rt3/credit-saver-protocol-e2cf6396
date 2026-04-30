-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'operario');
CREATE TYPE public.parte_estado AS ENUM ('Borrador', 'Analizado', 'Con descuadre', 'Validado');
CREATE TYPE public.parte_archivo_tipo AS ENUM ('GSTOCK', 'Produccion', 'BoxAzules', 'FotoLotes', 'Otro');
CREATE TYPE public.data_source AS ENUM ('manual', 'ia');

-- =========================================================================
-- HELPER: updated_at trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- USER ROLES
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- AUTO-CREATE profile + operario role on signup
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operario');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- PARTES DIARIOS
-- =========================================================================
CREATE TABLE public.partes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  estado public.parte_estado NOT NULL DEFAULT 'Borrador',
  -- Manuales (5)
  kg_industria_manual NUMERIC NOT NULL DEFAULT 0,
  kg_reciclado_malla_z1 NUMERIC NOT NULL DEFAULT 0,
  kg_reciclado_malla_z2 NUMERIC NOT NULL DEFAULT 0,
  kg_inventario_sin_alta NUMERIC NOT NULL DEFAULT 0,
  kg_podrido_bolsa_basura NUMERIC NOT NULL DEFAULT 0,
  -- Automáticos (IA / archivos)
  kg_produccion_calibrador NUMERIC NOT NULL DEFAULT 0,
  kg_mujeres_calibrador NUMERIC NOT NULL DEFAULT 0,
  kg_palets_brutos NUMERIC NOT NULL DEFAULT 0,
  kg_podrido_calibrador_auto NUMERIC NOT NULL DEFAULT 0,
  -- Arrastre
  kg_inventario_anterior_sin_alta NUMERIC NOT NULL DEFAULT 0,
  -- Notas e IA
  notas_generales TEXT,
  notas_inventario TEXT,
  resumen_ia JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX idx_partes_diarios_user_date ON public.partes_diarios(user_id, date DESC);
ALTER TABLE public.partes_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own partes" ON public.partes_diarios
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own partes" ON public.partes_diarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own partes" ON public.partes_diarios
  FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete own partes" ON public.partes_diarios
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER partes_diarios_updated_at
  BEFORE UPDATE ON public.partes_diarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- PARTES ARCHIVOS
-- =========================================================================
CREATE TABLE public.partes_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partes_archivos_part ON public.partes_archivos(part_id);
ALTER TABLE public.partes_archivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own files" ON public.partes_archivos
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own files" ON public.partes_archivos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own files" ON public.partes_archivos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own files" ON public.partes_archivos
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- PRODUCTION RUNS (detalle por producto/calibre)
-- =========================================================================
CREATE TABLE public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source public.data_source NOT NULL DEFAULT 'manual',
  product TEXT,
  size_range TEXT,
  kg_produced NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_runs_part ON public.production_runs(part_id);
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own runs" ON public.production_runs
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own runs" ON public.production_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own runs" ON public.production_runs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own runs" ON public.production_runs
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- GSTOCK ENTRIES
-- =========================================================================
CREATE TABLE public.gstock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source public.data_source NOT NULL DEFAULT 'manual',
  product TEXT,
  size_range TEXT,
  kg_expected NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gstock_entries_part ON public.gstock_entries(part_id);
ALTER TABLE public.gstock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gstock" ON public.gstock_entries
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own gstock" ON public.gstock_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gstock" ON public.gstock_entries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gstock" ON public.gstock_entries
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- LOTES DIA
-- =========================================================================
CREATE TABLE public.lotes_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source public.data_source NOT NULL DEFAULT 'manual',
  producto TEXT,
  lote_codigo TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lotes_dia_part ON public.lotes_dia(part_id);
ALTER TABLE public.lotes_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lotes" ON public.lotes_dia
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own lotes" ON public.lotes_dia
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lotes" ON public.lotes_dia
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lotes" ON public.lotes_dia
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- COSTES DIARIOS
-- =========================================================================
CREATE TABLE public.costes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  zona_id TEXT,
  tipo TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 0,
  unidad TEXT,
  coste_unitario NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costes_diarios_user_date ON public.costes_diarios(user_id, date DESC);
ALTER TABLE public.costes_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own costes" ON public.costes_diarios
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own costes" ON public.costes_diarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own costes" ON public.costes_diarios
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own costes" ON public.costes_diarios
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- ASISTENCIA DIARIA
-- =========================================================================
CREATE TABLE public.asistencia_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  zona_id TEXT,
  plantilla_total INTEGER NOT NULL DEFAULT 0,
  presentes INTEGER NOT NULL DEFAULT 0,
  ausentes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_asistencia_user_date ON public.asistencia_diaria(user_id, date DESC);
ALTER TABLE public.asistencia_diaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own asistencia" ON public.asistencia_diaria
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own asistencia" ON public.asistencia_diaria
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own asistencia" ON public.asistencia_diaria
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own asistencia" ON public.asistencia_diaria
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- STORAGE BUCKET (privado)
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('partes-archivos', 'partes-archivos', false);

CREATE POLICY "Users can view own files in storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'partes-archivos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own files in storage"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'partes-archivos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own files in storage"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'partes-archivos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own files in storage"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'partes-archivos' AND auth.uid()::text = (storage.foldername(name))[1]);