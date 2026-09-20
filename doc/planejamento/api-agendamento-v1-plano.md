# API de agendamento v1 — plano de implementação

> Spec: `doc/planejamento/api-agendamento-v1.md` · Contrato: `doc/api/agendamento-v1.md`
> Cada fatia termina com teste passando e commit. Ordem importa: o banco vem
> antes da função, porque a função é fina e só traduz.

## Fatias

### 1. Normalização de telefone
- **Cria:** migration `normalize_br_phone()` + `patients.phone_e164` (coluna gerada) + índice `(tenant_id, phone_e164)`
- **Testes:** tabela de casos — com/sem `+`, com/sem máscara, celular sem o 9, fixo, sem DDD (`NULL`), vazio, lixo. Dois cadastros com formatos diferentes do mesmo número casam no `phone_e164`.
- **Prova extra:** rodar a contagem por caso em produção e comparar com a medição do spec (2.974 / 766 / 2 / 2 / 41).

### 2. Colunas do contrato + duração congelada
- **Cria:** migration com `procedures.description`/`synonyms`, `profiles.min_notice_hours`/`max_reschedules`, `appointments.notes`/`cancelled_at`/`duration_minutes` + trigger que copia a duração + backfill
- **Altera:** `get_available_slots` e `check_appointment_conflict` passam a ler `appointments.duration_minutes`
- **Testes:** os 39 testes de banco atuais continuam verdes; mudar a duração de um procedimento **não** move agendamento já marcado; agendamento novo pega a duração do momento.

### 3. Constraint de exclusão
- **Cria:** migration com `appointments.occupies` (gerada) + `EXCLUDE USING gist ... WHERE (status <> 'cancelled' AND appointment_date >= DATE '<dia da migration>')`
- **Testes:** dois agendamentos sobrepostos → `23P01`; encostados → ok; cancelado não conflita; um antes da data de corte não impede.

### 4. Chave por integração
- **Cria:** migration `api_keys` (RLS sem policy) + `api_authenticate(p_key_hash)`; script `scripts/issue-api-key.ts` que imprime a chave **uma vez**
- **Testes:** hash certo devolve tenant; hash errado, chave revogada e chave de outra clínica não devolvem; `last_used_at` atualiza.

### 5. Idempotência
- **Cria:** migration `api_idempotency` + limpeza por `pg_cron` (24h)
- **Testes:** mesma chave + mesmo corpo devolve a resposta guardada sem criar outro agendamento; mesma chave + corpo diferente → `IDEMPOTENCY_KEY_REUSED`. (Depende da fatia 6 para ter o que repetir; testar junto.)

### 6. `api_create_appointment` + `api_suggest_slots`
- **Testes:** horário válido cria; fora do expediente / fora da grade / passado → `SLOT_NOT_AVAILABLE`; ocupado depois do `availabilityCheckedAt` → `SLOT_TAKEN_MEANTIME` com `wasAvailableUntil`; ocupado antes → `SLOT_NOT_AVAILABLE`; cliente existente é reutilizada e **o nome do cadastro vence**; cliente nova é criada; `suggestedSlots` traz no máximo 5, mesma data primeiro, mais próximos do horário pedido; procedimento que a profissional não faz → `PROCEDURE_NOT_OFFERED`; id de outra clínica → `not found`.

### 7. `api_cancel_appointment`
- **Testes:** cancela e grava `cancelled_at`; dentro de `minNoticeHours` → `CANCELLATION_NOT_ALLOWED`; com pagamento → `CANCELLATION_REQUIRES_STAFF`; já cancelado → mesma resposta (idempotente); concluído → `APPOINTMENT_NOT_ACTIVE`; de outra clínica → `not found`.

### 8. `api_reschedule_appointment`
- **Testes:** remarca, soma `reschedule_count`, grava `rescheduled_from_*`; limite atingido → `RESCHEDULE_NOT_ALLOWED`; em cima da hora → `CANCELLATION_NOT_ALLOWED`; o próprio agendamento não bloqueia o horário novo; mesmas regras de horário da fatia 6.

### 9. Edge Function: autenticação e leituras (endpoints 1, 2, 3)
- **Cria:** `supabase/functions/api/{index,auth,validate,format}.ts`; `[functions.api] verify_jwt = false` no `config.toml`
- **Testes (HTTP de verdade, `supabase functions serve` + `fetch`):** sem chave, chave inválida e chave revogada → `401` com o mesmo corpo; chave de outra clínica não vê nada desta; `days` > 60 → `MAX_RANGE_EXCEEDED`; dia sem horário aparece com `slots: []`; `PROCEDURE_NOT_OFFERED`; `variablePrice`; `avatarUrl`/`specialty` nulos.

### 10. Edge Function: escritas (endpoints 4, 5, 6, 7)
- **Testes HTTP:** POST cria e devolve `201` no formato do contrato; `Idempotency-Key` repetida não cria outro; `dateTime` sem offset → `VALIDATION_ERROR`; DELETE e PATCH com seus códigos; busca por telefone com e sem o 9 acha o mesmo agendamento; sem agendamento → `{ "data": [] }`.

### 11. Telas
- **Altera:** `src/pages/Procedures.tsx` (descrição e sinônimos), `src/pages/Expediente.tsx` (antecedência mínima e limite de remarcações)
- **Testes:** lógica pura de sinônimos (texto separado por vírgula ↔ `text[]`); typecheck, lint e build sem erro novo.

### 12. Rollout
1. `db push` das migrations (1 a 5) — a constraint da fatia 3 falha se houver sobreposição ativa nova; medir de novo se falhar
2. `supabase functions deploy api`
3. clínica de sandbox + chave de sandbox → AB
4. conferir expediente das 5 profissionais (consulta)
5. chave de produção → AB, por canal seguro

## O que fica para outra hora
- Domínio `api.missbele.com` (rewrite na Vercel).
- Webhooks de evento para o serviço de notificação.
- Issue #3 (`procedures.name` único no sistema inteiro).
- `seed.sql` quebrado desde a multi-tenancy.
