# API de agendamento v1 — desenho interno

> Design fechado em 2026-09-19. Projeto 2 de 2 (issue #2).
> Contrato público (o que o Agent Builder lê): `doc/api/agendamento-v1.md`.
> Depende do projeto 1 (`doc/planejamento/agenda-de-trabalho.md`), em produção
> desde 19/09.

## Decisões

| # | Decisão | Alternativa recusada |
|---|---|---|
| A-1 | **Edge Function `api`** no Supabase, `verify_jwt = false`, roteador `/v1/...` | Vercel Functions (service_role fora do Supabase; deploy acoplado ao front) |
| A-2 | Autenticação por **chave por integração** (`api_keys`, só o hash) | usuário-robô (vira super_admin); chave global (acessa qualquer clínica) |
| A-3 | **Função fina, regra no banco:** um RPC por operação de escrita, numa transação | orquestrar várias chamadas pela função |
| A-4 | `409` só com **`availabilityCheckedAt`** enviado pelo AB | janela de tempo; separar por natureza do erro |
| A-5 | `minNoticeHours` / `maxReschedules` **por profissional**, em `profiles` | por clínica; tabela `professional_settings` (mover `slot_step_minutes` recém-lançado não compensa) |
| A-6 | Duração **congelada no agendamento** (`appointments.duration_minutes`) | ler do procedimento (mudar a duração dele mexia em todo agendamento já marcado) |
| A-7 | **Constraint de exclusão** em `appointments`, a partir da data de corte | só a checagem prévia (corrida entre dois pedidos simultâneos passa) |
| A-8 | Bot **não cancela agendamento com pagamento** (`CANCELLATION_REQUIRES_STAFF`) | cancelar e deixar o dinheiro pendurado |
| A-9 | `minNoticeHours` vale também para **remarcar** | só para cancelar |
| A-10 | Sandbox = **clínica de teste em produção** com chave própria | projeto Supabase separado |

## Medições que embasam (produção, 19/09)

**Telefone** — 3.785 clientes:

| Caso | Qtde |
|---|---|
| DDD + 9 dígitos | 2.974 (78,6%) |
| DDD + celular **sem o 9** | 766 (20,2%) |
| DDD + fixo | 2 |
| vazio | 2 |
| outro formato (digitação) | 41 (1,1%) |

Nenhum sem DDD, nenhum com 55. **98,9% normalizáveis.** Um em cada cinco
cadastros está sem o 9 — busca exata nunca os acharia.

**Sobreposição** — 646 agendamentos ativos, **2 pares sobrepostos**, mesma
profissional, janeiro/2026, nenhum no futuro. A constraint de exclusão vale a
partir da data de corte para não mexer em histórico.

## Banco

### Normalização de telefone

`public.normalize_br_phone(text) returns text`, `IMMUTABLE`:

1. só dígitos;
2. `55` + DDD + 9 dígitos começando com 9 → como está;
3. `55` + DDD + 8 dígitos começando com 6–9 → insere o 9 (celular antigo);
4. `55` + DDD + 8 dígitos começando com 2–5 → como está (fixo);
5. DDD + 9 ou 8 dígitos → prefixa `55` e aplica 2–4;
6. qualquer outra coisa → `NULL`.

Resultado com `+` na frente. Fixo com 8 dígitos (2–5) e celular antigo (6–9)
não se confundem, então inserir o 9 não funde pessoas diferentes.

`patients.phone_e164` = **coluna gerada** (`generated always as
(normalize_br_phone(phone)) stored`) + índice `(tenant_id, phone_e164)`. Nenhum
caminho de escrita precisa lembrar de normalizar.

### Tabelas e colunas

- `api_keys (id, tenant_id, name, key_hash, created_at, revoked_at, last_used_at)` —
  `key_hash` = SHA-256 hex, único. RLS ligada **sem nenhuma policy**: só
  `service_role` lê.
- `api_idempotency (tenant_id, key, request_hash, response jsonb, http_status, created_at)`,
  PK `(tenant_id, key)`; `pg_cron` apaga o que tiver mais de 24h.
- `procedures.description text not null default ''`,
  `procedures.synonyms text[] not null default '{}'`.
- `profiles.min_notice_hours smallint not null default 2`,
  `profiles.max_reschedules smallint not null default 1` (checks ≥ 0).
- `appointments.duration_minutes integer` — trigger `BEFORE INSERT OR UPDATE OF
  procedure_id` copia de `procedures`; backfill copia a duração atual.
- `appointments.notes text`, `appointments.cancelled_at timestamptz`.
- `appointments.occupies tsrange` gerada por `appointment_window(date, time,
  duration_minutes)` + `EXCLUDE USING gist (professional_id WITH =, occupies WITH &&)
  WHERE (status <> 'cancelled' AND appointment_date >= DATE 'AAAA-MM-DD')`, onde a
  data é **o dia em que a migration roda**, escrita como literal (constraint não
  aceita data calculada). Se até lá surgir sobreposição nova em agendamento
  ativo — o app atual ainda permite a corrida —, a criação da constraint **falha
  e a migration inteira é desfeita**: sinal para medir de novo, nunca para
  apagar dado.

O motor (`get_available_slots`) e `check_appointment_conflict` passam a ler
`appointments.duration_minutes` em vez do `JOIN` com `procedures`.

### RPCs da API (todos `SECURITY DEFINER`, `search_path = ''`, EXECUTE só para `service_role`)

Recebem `p_tenant_id` resolvido pela função a partir da chave e **filtram tudo
por ele** — é a regra nº 1: service_role pula a RLS e o portão do motor.

Devolvem `jsonb` `{ ok, http, code, message, details, body }` em vez de lançar
exceção: cada erro de contrato é um dado testável. `23P01` (constraint de
exclusão) é capturado dentro do RPC e vira `SLOT_TAKEN_MEANTIME` /
`SLOT_NOT_AVAILABLE` pela regra de `availabilityCheckedAt`.

| RPC | Faz |
|---|---|
| `api_authenticate(p_key_hash)` | devolve `tenant_id` se a chave existe e não foi revogada; atualiza `last_used_at` |
| `api_create_appointment(...)` | idempotência → valida horário contra o motor → acha/cria cliente por `phone_e164` → insere → grava idempotência |
| `api_cancel_appointment(...)` | políticas → `cancelled`, `cancelled_at`, `cancellation_reason` |
| `api_reschedule_appointment(...)` | políticas → valida horário (excluindo o próprio) → atualiza + `rescheduled_from_*` + `reschedule_count` |
| `api_suggest_slots(...)` | até 5 horários pela regra do contrato; usado pelos três acima |

Leituras (profissionais, procedimentos, disponibilidade, busca por telefone) são
consultas diretas da função com `service_role`, **sempre** com
`.eq('tenant_id', tenantId)`.

### Horário válido

Um `dateTime` é válido se, convertido para hora de parede de Brasília, estiver
na lista que `get_available_slots` devolveria para aquela data e procedimento.
Isso cobre expediente, exceções, caber inteiro, passado **e** estar na grade.

## Edge Function

`supabase/functions/api/`:

- `index.ts` — roteador, CORS mínimo, tradução RPC → HTTP.
- `auth.ts` — `Bearer` → SHA-256 → `api_authenticate`. Falha sempre `401
  UNAUTHORIZED` com o mesmo corpo (não revela se a chave existe).
- `validate.ts` — UUID, ISO com offset, `days` 1–60.
- `format.ts` — hora de parede ↔ `-03:00`, status do banco ↔ contrato.

## Testes

- **RPCs:** Vitest contra Postgres local (mesma bateria do projeto 1).
- **HTTP de verdade:** Vitest sobe `supabase functions serve` e chama `/v1/...`
  com `fetch` — chave válida, revogada, de outra clínica, sem chave. Testar o RPC
  não basta: o AB chama a URL.
- **Normalização:** tabela de casos, incluindo os formatos medidos em produção.

## Rollout

1. Migration (compatível com o app atual: colunas novas com default, duração
   preenchida por trigger nos inserts do app).
2. `supabase functions deploy api --no-verify-jwt`.
3. Clínica de sandbox + chave de sandbox → AB.
4. Profissionais configuram o expediente (pré-requisito).
5. Chave de produção → AB, por canal seguro, nunca pelo chat.

A chave é gerada por um script local que imprime a chave **uma vez** e grava só
o hash.
