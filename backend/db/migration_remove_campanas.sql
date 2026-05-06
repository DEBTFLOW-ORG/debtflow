-- ================================================================
-- Migration: Sacar campanas, agregar max_intentos a deudores
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================

-- 1. Agregar max_intentos a deudores (si no existe)
alter table deudores add column if not exists max_intentos int not null default 3;

-- 2. Sacar campana_id de llamadas
alter table llamadas drop column if exists campana_id;

-- 3. Sacar índice de campanas
drop index if exists idx_campanas_user;

-- 4. Sacar tabla campanas
drop table if exists campanas cascade;
