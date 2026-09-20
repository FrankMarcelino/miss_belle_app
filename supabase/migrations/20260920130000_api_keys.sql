-- ============================================================================
-- Chave por integração (fatia 4)
--
-- A API não tem usuário logado: sem auth.uid(), toda a RLS baseada em
-- auth_tenant_id() nega. A chave é o que diz de qual clínica é o pedido.
--
-- Uma chave global obrigaria o pedido a informar a clínica, e quem tivesse a
-- chave acessaria qualquer uma. É o modelo que a LIVIA está aposentando no
-- gateway#100.
-- ============================================================================

set local lock_timeout = '5s';

create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,              -- "Agent Builder LIVIA", "Sandbox"
  key_hash     text not null unique,       -- SHA-256 em hex; a chave em texto NUNCA é gravada
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);

create index api_keys_tenant_idx on public.api_keys (tenant_id);

-- RLS ligada e NENHUMA policy: nem a dona da clínica lê as chaves pelo app.
-- Só service_role (que ignora RLS) enxerga, e é quem a Edge Function usa.
alter table public.api_keys enable row level security;

comment on table public.api_keys is
  'Chaves da API pública, uma por integração. Guarda só o hash: se a tabela vazar, as chaves não vazam.';

-- ----------------------------------------------------------------------------
-- Emissão
--
-- Devolve a chave em texto UMA vez — não há como recuperá-la depois, só emitir
-- outra. Rodar pelo SQL Editor do dashboard e copiar de lá: assim a chave não
-- passa por log de terminal nem por conversa.
-- ----------------------------------------------------------------------------
create function public.api_issue_key(p_tenant_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  -- 32 bytes aleatórios em base64url (sem +, / ou =, que atrapalham em header e URL).
  v_key := 'mb_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.api_keys (tenant_id, name, key_hash)
  values (p_tenant_id, p_name, encode(extensions.digest(v_key, 'sha256'), 'hex'));

  return v_key;
end;
$$;

-- ----------------------------------------------------------------------------
-- Autenticação
--
-- Recebe o HASH, nunca a chave: a Edge Function calcula o SHA-256 do header e
-- manda só isso, então a chave em texto não entra em log de query.
--
-- Chave inexistente, revogada ou de clínica desativada devolvem a MESMA coisa
-- (nulo). A função não conta ao chamador qual dos três é.
-- ----------------------------------------------------------------------------
create function public.api_authenticate(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select k.tenant_id into v_tenant
  from public.api_keys k
  join public.tenants t on t.id = k.tenant_id
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and t.is_active;

  if v_tenant is null then
    return null;
  end if;

  update public.api_keys set last_used_at = now() where key_hash = p_key_hash;

  return v_tenant;
end;
$$;

revoke execute on function public.api_issue_key(uuid, text)  from public, anon, authenticated;
revoke execute on function public.api_authenticate(text)     from public, anon, authenticated;
grant  execute on function public.api_issue_key(uuid, text)  to service_role;
grant  execute on function public.api_authenticate(text)     to service_role;
