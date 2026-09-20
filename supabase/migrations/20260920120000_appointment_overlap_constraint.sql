-- ============================================================================
-- Constraint de exclusão contra agendamento sobreposto (fatia 3)
--
-- check_appointment_conflict é uma CONSULTA: dois pedidos simultâneos passam
-- os dois por ela antes de qualquer um gravar. Só o banco resolve a corrida,
-- e é ela que sustenta o SLOT_TAKEN_MEANTIME do contrato.
--
-- Vale a partir do dia desta migration: em 19/09 produção tinha 2 pares
-- sobrepostos, ambos de janeiro/2026 e nenhum no futuro. Isso é histórico
-- (pode ter registro financeiro), e regra nova não é retroativa.
--
-- Se aparecer sobreposição NOVA entre a medição e este push, a criação da
-- constraint falha e a migration inteira é desfeita. É o sinal para medir de
-- novo — nunca para apagar dado.
-- ============================================================================

set local lock_timeout = '5s';

-- Permite misturar igualdade (professional_id) com sobreposição (&&) no mesmo índice.
create extension if not exists btree_gist;

-- Constraint não enxerga outra tabela: por isso a duração foi congelada na
-- linha (fatia 2).
alter table public.appointments
  add column occupies tsrange
  generated always as (
    public.appointment_window(appointment_date, appointment_time, duration_minutes)
  ) stored;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (professional_id with =, occupies with &&)
  where (status <> 'cancelled' and appointment_date >= date '2026-09-20');

comment on constraint appointments_no_overlap on public.appointments is
  'Mesma profissional não pode ter dois agendamentos ativos que se cruzam. Vale para agendamentos a partir de 2026-09-20; antes disso é histórico.';
