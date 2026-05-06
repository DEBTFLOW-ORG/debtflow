-- ================================================================
-- Debtflow — Schema SQL
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ================================================================

create extension if not exists "uuid-ossp";

-- ── USERS ────────────────────────────────────────────────────────
create table if not exists users (
  id                    uuid primary key default uuid_generate_v4(),
  email                 text unique not null,
  role                  text not null default 'user' check (role in ('user','admin')),
  plan                  text not null default 'trial' check (plan in ('trial','silver','gold','enterprise')),
  -- Twilio sub-cuenta (se crea automáticamente al registrarse)
  twilio_account_sid    text,
  twilio_auth_token     text,   -- encriptado con AES-256-GCM antes de guardar
  twilio_phone_number   text,
  -- Vapi asistente
  vapi_assistant_id     text,
  -- Config del agente (JSON)
  agente_config         jsonb default '{}'::jsonb,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ── DEUDORES ─────────────────────────────────────────────────────
create table if not exists deudores (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  nombre          text not null,
  tel             text not null,
  monto           numeric(12,2) not null,
  acreedor        text,
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente','contactado','promesa_pago','no_contesta','cancelado')),
  llamar_auto     boolean not null default false,
  frecuencia      text,
  hora            time,
  dias_semana     text[],
  max_intentos    int not null default 3,
  intentos        int not null default 0,
  ultimo_intento  timestamptz,
  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── LLAMADAS ─────────────────────────────────────────────────────
create table if not exists llamadas (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  deudor_id       uuid references deudores(id) on delete set null,
  vapi_call_id    text unique,
  resultado       text check (resultado in ('contactado','no_contesta','promesa_pago','cancelado','error')),
  sentimiento     text check (sentimiento in ('positivo','neutro','negativo')),
  duracion_seg    int,
  transcripcion   jsonb,
  nota            text,
  iniciada_at     timestamptz default now(),
  finalizada_at   timestamptz,
  created_at      timestamptz default now()
);

-- ── ÍNDICES ──────────────────────────────────────────────────────
create index if not exists idx_deudores_user      on deudores(user_id);
create index if not exists idx_deudores_auto       on deudores(user_id, llamar_auto) where llamar_auto = true;
create index if not exists idx_llamadas_user       on llamadas(user_id);
create index if not exists idx_llamadas_vapi       on llamadas(vapi_call_id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
alter table users    enable row level security;
alter table deudores enable row level security;
alter table llamadas enable row level security;

-- El backend usa service_role key (bypassea RLS)
-- Estas policies son defensa en profundidad

create policy "users_own"     on users    for all using (id = auth.uid());
create policy "deudores_own"  on deudores for all using (user_id = auth.uid());
create policy "llamadas_own"  on llamadas for all using (user_id = auth.uid());

-- ── TRIGGER updated_at ───────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_users_upd    before update on users    for each row execute procedure touch_updated_at();
create trigger trg_deudores_upd before update on deudores for each row execute procedure touch_updated_at();
