---
name: MVP CRUD Agenda + Caixa
overview: Evoluir o MVP atual fortalecendo o CRUD de agendamentos e do caixa (consistência de totais, regras de conflito, campos faltantes como motivo de cancelamento) sem incluir ainda agenda pública nem a aplicação do agente WhatsApp.
source_plan_file: /home/frank/.cursor/plans/mvp_crud_agenda_+_caixa_a285dc06.plan.md
---

## MVP: amadurecer CRUD de Agenda e Caixa

## Objetivo

- Deixar **Agenda** e **Caixa** confiáveis para uso real: menos erros de regra de negócio, menos inconsistência de totais, melhor modelagem de dados e UX.

## Estado atual (o que o código faz hoje)

- **Agendamentos**: criados/atualizados diretamente do frontend via Supabase em `[src/pages/Agenda.tsx](../../src/pages/Agenda.tsx)`, com status `'scheduled'|'confirmed'|'completed'|'cancelled'`. Checagem de conflito hoje é por **mesmo profissional + mesma data + mesmo horário**.
- **Caixa**: fechamentos e transações em `[src/pages/CashRegister.tsx](../../src/pages/CashRegister.tsx)`. Total do fechamento é recalculado no frontend.
- **Schema/RLS**: migrations em `[supabase/migrations/20251122115011_create_initial_schema.sql](../../supabase/migrations/20251122115011_create_initial_schema.sql)` e ajuste de RLS em `[supabase/migrations/20251122134702_fix_rls_recursion.sql](../../supabase/migrations/20251122134702_fix_rls_recursion.sql)`.

## Problemas/risco que vamos endereçar

- **Conflito de agenda incompleto**: só bloqueia horário idêntico; não detecta sobreposição considerando `procedures.duration_minutes`.
- **Cancelamento sem motivo**: existe `appointments.cancellation_reason`, mas o fluxo de UI não coleta/grava.
- **Total do caixa inconsistente**: hoje há lógica de soma no frontend que é frágil para concorrência e tem risco de cálculo incorreto (ex.: somar duas vezes ou recalcular com lista desatualizada).
- **Integridade**: depender do frontend para manter `cash_register_closings.total_amount` é propenso a erro; o banco deve ser a fonte de verdade.

## Abordagem proposta

### 1) Agenda (agendamentos)

- **Conflito por sobreposição**:
  - Ao criar/alterar horário do agendamento, validar conflito por intervalo: novo_inicio/novo_fim vs agendamentos existentes (mesmo profissional e data, status != 'cancelled').
  - Implementação preferida: uma **função SQL (RPC)** no Supabase para checar conflito (evita depender do relógio do cliente e reduz roundtrips). Alternativa: checar no cliente carregando agendamentos do dia e calculando overlaps, mas isso é menos robusto.
- **Cancelar com motivo**:
  - Atualizar modal de detalhes para, ao cancelar, exigir/permitir `cancellation_reason` e salvar junto com `status='cancelled'`.
- **Pequenas melhorias de CRUD/UX**:
  - Filtros básicos (por status, por paciente) e mensagens de erro mais claras vindas do Supabase.

### 2) Caixa (fechamentos e transações)

- **Total como fonte de verdade no banco**:
  - Adicionar trigger/função no Postgres para manter `cash_register_closings.total_amount` sempre igual à soma das transações do closing.
  - Ajustar `CashRegister.tsx` para **parar de calcular total manualmente** (ou usar apenas como display) e confiar no total persistido.
- **Concorrência**:
  - Com trigger, múltiplas transações em paralelo não quebram o total.
- **Regras de finalização**:
  - Garantir que INSERT/DELETE de transação não aconteça quando `is_finalized=true` (já existe policy para INSERT; vamos revisar se DELETE também precisa de policy/constraint).

## Arquivos que serão tocados

- Frontend:
  - `[src/pages/Agenda.tsx](../../src/pages/Agenda.tsx)`: conflito por duração, cancelamento com motivo.
  - `[src/pages/CashRegister.tsx](../../src/pages/CashRegister.tsx)`: remover/reduzir lógica frágil de total; alinhar com regra do banco.
- Banco/Supabase:
  - Nova migration em `supabase/migrations/` para:
    - Função/RPC de checagem de conflito por sobreposição (ou view auxiliar).
    - Trigger para recalcular `cash_register_closings.total_amount` a cada INSERT/UPDATE/DELETE em `cash_register_transactions`.
    - (Opcional) ajustar policies para transações/closings conforme necessidade.

## Testes/validação (manual)

- Criar agendamento com procedimento de 60 min às 09:00 e tentar criar outro às 09:30 para o mesmo profissional → deve bloquear.
- Cancelar agendamento → deve salvar `cancellation_reason`.
- Criar fechamento do dia, adicionar 2 transações, excluir 1 → total deve sempre bater com a soma no banco.
- Finalizar fechamento → UI bloqueia novas transações e o banco também.

