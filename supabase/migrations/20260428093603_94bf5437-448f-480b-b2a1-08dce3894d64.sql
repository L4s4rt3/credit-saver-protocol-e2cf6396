-- Alinear enum archivo_tipo con el spec: GSTOCK, Produccion, FotoLotes, Otro.
-- Los valores actuales ('gstocks','produccion','foto_lotes') siguen existiendo para
-- compatibilidad, pero a partir de ahora la app escribe los nuevos.
ALTER TYPE public.archivo_tipo ADD VALUE IF NOT EXISTS 'GSTOCK';
ALTER TYPE public.archivo_tipo ADD VALUE IF NOT EXISTS 'Produccion';
ALTER TYPE public.archivo_tipo ADD VALUE IF NOT EXISTS 'FotoLotes';
ALTER TYPE public.archivo_tipo ADD VALUE IF NOT EXISTS 'Otro';