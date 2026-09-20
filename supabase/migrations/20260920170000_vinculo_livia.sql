-- ============================================================================
-- Vínculo com o tenant da LIVIA + identidade da clínica (fatia 1)
-- Spec: doc/planejamento/vinculo-livia-missbelle.md
--
-- O vínculo vai existir dos DOIS lados — é inevitável: a LIVIA não tem a chave
-- para perguntar, e o diagnóstico nasce aqui. Dois ponteiros divergem, então o
-- que este arquivo entrega não é "evitar a divergência" e sim TORNÁ-LA
-- DETECTÁVEL: a API passa a saber responder de quem ela é.
-- ============================================================================

set local lock_timeout = '5s';

alter table public.api_keys
  add column livia_tenant_id uuid;

comment on column public.api_keys.livia_tenant_id is
  'Tenant da LIVIA que esta chave atende. Ponteiro para outro sistema: não há FK, e divergir é possível — por isso existe o /v1/clinic.';

create index api_keys_livia_tenant_idx on public.api_keys (livia_tenant_id)
  where livia_tenant_id is not null;

-- ----------------------------------------------------------------------------
-- Emissão passa a gravar o vínculo (opcional: chave sem LIVIA continua válida,
-- é o caso do sandbox).
-- ----------------------------------------------------------------------------
drop function public.api_issue_key(uuid, text);

create function public.api_issue_key(
  p_tenant_id       uuid,
  p_name            text,
  p_livia_tenant_id uuid default null
)
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

  v_key := 'mb_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.api_keys (tenant_id, name, key_hash, livia_tenant_id)
  values (p_tenant_id, p_name, encode(extensions.digest(v_key, 'sha256'), 'hex'), p_livia_tenant_id);

  return v_key;
end;
$$;

-- ----------------------------------------------------------------------------
-- A autenticação passa a devolver TAMBÉM qual chave entrou.
--
-- O vínculo mora na chave, não no tenant: uma clínica pode ter mais de uma
-- integração. Devolver o id (e nunca o hash) é o que permite responder "de quem
-- é esta chave?" sem passear com o segredo pelo código.
-- ----------------------------------------------------------------------------
drop function public.api_authenticate(text);

create function public.api_authenticate(p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_key    uuid;
begin
  select k.tenant_id, k.id into v_tenant, v_key
  from public.api_keys k
  join public.tenants t on t.id = k.tenant_id
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and t.is_active;

  if v_tenant is null then
    return null;
  end if;

  update public.api_keys set last_used_at = now() where id = v_key;

  return jsonb_build_object('tenantId', v_tenant, 'apiKeyId', v_key);
end;
$$;

-- ----------------------------------------------------------------------------
-- Identidade da clínica: a resposta do GET /v1/clinic.
--
-- Fala só sobre a chave que autenticou a chamada. Nunca devolve a chave nem o
-- hash dela.
-- ----------------------------------------------------------------------------
create function public.api_clinic_identity(p_tenant_id uuid, p_api_key_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'liviaTenantId', k.livia_tenant_id,
    'timezone', 'America/Sao_Paulo'
  )
  from public.tenants t
  join public.api_keys k on k.id = p_api_key_id and k.tenant_id = t.id
  where t.id = p_tenant_id;
$$;

revoke execute on function public.api_issue_key(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.api_authenticate(text) from public, anon, authenticated;
revoke execute on function public.api_clinic_identity(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.api_issue_key(uuid, text, uuid) to service_role;
grant  execute on function public.api_authenticate(text) to service_role;
grant  execute on function public.api_clinic_identity(uuid, uuid) to service_role;
