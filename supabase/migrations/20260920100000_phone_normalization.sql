-- ============================================================================
-- Normalização de telefone (API v1, fatia 1)
--
-- O app grava o telefone como a pessoa digitou. Medição de 19/09 (3.785
-- clientes): 78,6% "DDD + 9 dígitos", 20,2% celular SEM o 9 — o formato que o
-- WhatsApp costuma usar —, 1,1% com erro de digitação, nenhum sem DDD.
-- Busca exata por telefone erraria 1 em cada 5 clientes.
-- ============================================================================

set local lock_timeout = '5s';

-- IMMUTABLE porque uma coluna gerada só aceita função imutável: para a mesma
-- entrada, sempre a mesma saída, sem consultar nada.
create function public.normalize_br_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_ddd    text;
  v_local  text;
begin
  -- 55 + DDD + 9 dígitos (celular atual)
  if v_digits ~ '^55[1-9][1-9]9[0-9]{8}$' then
    return '+' || v_digits;
  end if;

  -- 55 + DDD + 8 dígitos
  if v_digits ~ '^55[1-9][1-9][0-9]{8}$' then
    v_ddd := substr(v_digits, 3, 2);
    v_local := substr(v_digits, 5);
  -- DDD + 9 dígitos (celular atual)
  elsif v_digits ~ '^[1-9][1-9]9[0-9]{8}$' then
    return '+55' || v_digits;
  -- DDD + 8 dígitos
  elsif v_digits ~ '^[1-9][1-9][0-9]{8}$' then
    v_ddd := substr(v_digits, 1, 2);
    v_local := substr(v_digits, 3);
  else
    -- Sem DDD, com dígito a mais ou a menos, ou lixo: não dá para adivinhar.
    return null;
  end if;

  -- Celular antigo começa com 6-9 e ganha o 9 que o Brasil acrescentou.
  -- Fixo começa com 2-5 e fica como está. As duas faixas não se cruzam, então
  -- inserir o 9 nunca transforma um número no de outra pessoa.
  if v_local ~ '^[6-9]' then
    return '+55' || v_ddd || '9' || v_local;
  elsif v_local ~ '^[2-5]' then
    return '+55' || v_ddd || v_local;
  end if;

  return null;
end;
$$;

revoke execute on function public.normalize_br_phone(text) from public, anon;
grant  execute on function public.normalize_br_phone(text) to authenticated, service_role;

-- Coluna GERADA: o Postgres recalcula a cada gravação. Nenhum caminho de
-- escrita — app, API ou SQL na mão — precisa lembrar de normalizar.
alter table public.patients
  add column phone_e164 text generated always as (public.normalize_br_phone(phone)) stored;

create index patients_tenant_phone_e164_idx
  on public.patients (tenant_id, phone_e164)
  where phone_e164 is not null;

comment on column public.patients.phone_e164 is
  'Telefone em E.164 com o 9º dígito, calculado de phone. NULL = formato irrecuperável.';
