# Agenda de trabalho — expediente e exceções por profissional

> Design fechado em 2026-09-18. Projeto 1 de 2.
> O projeto 2 (API pública de agendamento, consumida pelo Agent Builder do
> ecossistema LIVIA) depende deste e tem spec próprio.

## Por que existe

Hoje o Miss Belle não tem nenhuma noção de expediente. A grade de horários é
gerada no frontend, em `src/components/agenda/forms/TimeSlotPicker.tsx:79-85`,
por um loop fixo de 24 horas em passos de 15 minutos — 96 slots por dia, todo
dia, das 00:00 às 23:45. O único filtro é "tem agendamento em cima?". Não
existe dia da semana, folga, almoço, feriado nem hora de abrir e fechar, e
nenhuma tabela do banco guarda isso.

Isso é inofensivo enquanto quem lê a tela é a profissional: ela sabe que não
atende às 3h de domingo, e o software não precisa saber. Deixa de ser
inofensivo no momento em que um bot passa a ler a mesma agenda para oferecer
horário a um cliente — o conhecimento tácito some e o sistema oferece o
impossível.

Disponibilidade, portanto, não é um dado que o Miss Belle tem e basta expor.
É um dado que ele precisa passar a ter.

## Decisões

| # | Decisão | Alternativa recusada |
|---|---|---|
| D-1 | Expediente **por profissional**, com tela para ela mesma configurar | config só por SQL, sem UI |
| D-2 | Exceções **bidirecionais**: bloqueiam e também abrem horário fora do padrão | só bloqueio |
| D-3 | Bloqueio **vence** extra quando se sobrepõem (fail-closed) | extra vence |
| D-4 | Expediente **não é retroativo** — não invalida agendamento já existente | validar o passado |
| D-5 | O cálculo de disponibilidade vive numa **função no Postgres**, consumida por app e API | módulo TS compartilhado; cada lado calcula o seu |
| D-6 | Passo da grade **configurável por profissional** (15/30/60) | fixo |
| D-7 | Faixa pode **virar a meia-noite** (`ends_at < starts_at`); o motor resolve o transbordo | cadastrar as duas pontas na mão |
| D-8 | Não-sobreposição por **trigger**, não por constraint de exclusão (D-7 a inviabiliza) | duas regras, uma por caso |

## Modelo de dados

```sql
-- o padrão que se repete toda semana
create table professional_schedules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  professional_id uuid not null references profiles(id),
  day_of_week     smallint not null check (day_of_week between 0 and 6), -- 0 = domingo
  starts_at       time not null,
  ends_at         time not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- ends_at < starts_at é VÁLIDO: a faixa vira a meia-noite (D-7).
  -- Só o intervalo de comprimento zero é proibido.
  check (ends_at <> starts_at)
);

-- o que foge do padrão, nos dois sentidos
create table schedule_exceptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  professional_id uuid not null references profiles(id),
  exception_date  date not null,
  kind            text not null check (kind in ('block','extra')),
  starts_at       time,          -- null só é válido em block = folga o dia inteiro
  ends_at         time,
  reason          text,
  created_at      timestamptz not null default now(),
  check (kind = 'block' or (starts_at is not null and ends_at is not null)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table profiles
  add column slot_step_minutes smallint not null default 30
    check (slot_step_minutes in (15, 30, 60));
```

### O intervalo de almoço não é um campo

Não existe `break_start`/`break_end`. Quem atende 09:00–12:00 e 13:00–18:00 tem
**duas linhas** na terça, e o almoço é o buraco entre elas. Como campo, o
modelo quebra no primeiro caso de dois intervalos ou de pausa de 20 minutos.
Como faixa, N pausas saem de graça.

### `day_of_week` em vez de data

Uma linha descreve *todas* as terças, não uma terça. É a separação entre a
regra e a instância — e a exceção é o que permite mexer na instância sem
mentir sobre a regra.

### Não-sobreposição: por que é trigger e não constraint de exclusão

Nada acima impede gravar 09:00–12:00 **e** 11:00–15:00 na mesma terça, o que
faria o motor contar 11:00–12:00 duas vezes. Checar isso no app significa
depender de todo caminho de escrita lembrar de checar.

A ferramenta natural seria uma **constraint de exclusão** — o parente do
`UNIQUE` que compara por sobreposição (`&&`) em vez de igualdade. Ela não
sobrevive a D-7: o Postgres recusa construir um range cujo fim é menor que o
início, e `timerange('20:00','02:00')` estoura na construção. Cobrir só as
faixas normais com a constraint e as que viram a noite com outra coisa criaria
duas definições de "sobrepõe" — exatamente a dívida que este spec declara
querer evitar.

Fica então **um trigger de validação**, definição única, que normaliza cada
faixa numa linha do tempo da semana (minuto 0 = domingo 00:00, minuto 10080 =
fim de sábado, com o comprimento calculado por `(ends - starts + 1440) % 1440`).
Nessa linha, a faixa que vira a noite é só um intervalo mais longo, sem caso
especial, e a comparação volta a ser sobreposição de intervalos comuns.

**O que se perde:** trigger não protege contra corrida. Dois `INSERT`
simultâneos podem passar os dois, coisa que a constraint impediria no nível do
índice. Aceitável aqui porque expediente é configurado por uma pessoa numa
tela — duas escritas conflitantes no mesmo profissional, no mesmo instante, não
é cenário real.

No projeto 2 a decisão se inverte: dois clientes agendando ao mesmo tempo **é**
o cenário, e lá a constraint de exclusão (com `btree_gist` e `tstzrange`) é o
instrumento certo — é ela que resolve a sobreposição que o índice UNIQUE
parcial atual não pega, por só comparar horário de início idêntico.

### RLS

Segue o padrão já vigente em `appointments`
(`20260221000004_update_all_rls_policies.sql:114-129`):

```
tenant_id = auth_tenant_id() AND (professional_id = auth.uid() OR is_super_admin())
```

O trigger `auto_set_tenant_id` já existente preenche o `tenant_id`.

## O motor

```sql
get_available_slots(
  p_professional_id uuid,
  p_procedure_id    uuid,
  p_start_date      date default current_date,
  p_days            int  default 7
) returns table (slot_date date, slot_time time)
```

Devolve linhas soltas. Quem chama agrupa: a tela monta a grade do dia, a API do
projeto 2 monta o `{ "date": ..., "slots": [...] }`. Uma definição, duas
apresentações — é o que impede o bot e o app divergirem sobre o mesmo horário.

Por dia da janela:

1. faixas do `day_of_week` ∪ faixas `extra` daquela data, **mais a cauda das
   faixas do dia anterior que viraram a meia-noite** (D-7)
2. menos os `block`:
   - `block` **de dia inteiro** mata o turno que *começa* naquele dia, cauda
     inclusa — folga na sexta tem que levar junto o cliente da 01:00 de sábado,
     senão ela folga e continua com gente marcada
   - `block` **com horário** mata só aquela janela, naquela data de calendário
3. dentro de cada faixa restante, candidatos de `slot_step_minutes` em `slot_step_minutes`
4. mantém só o que **cabe inteiro**: `candidato + duração ≤ fim da faixa`
5. remove o que colide com agendamento não-cancelado, pela duração de cada um
6. se a data for hoje, remove o que já passou

O passo 4 é a regra que gera dúvida depois: procedimento de 60 min com
expediente até 19:00 **não** oferece 18:30.

### Por que `SECURITY DEFINER` — e o portão que vem junto

A RLS de `appointments` é `professional_id = auth.uid() OR is_super_admin()`:
**uma profissional não enxerga os agendamentos da colega**. Se a função rodasse
com a permissão de quem chama, perguntar a disponibilidade de uma colega
retornaria zero agendamentos e a resposta seria "agenda inteira livre". Não é
erro nem permissão negada — é uma resposta plausível e errada, o modo de falha
silencioso.

Logo, `SECURITY DEFINER`, com o portão explícito dentro:

```sql
select tenant_id into v_tenant_id from profiles where id = p_professional_id;
if v_tenant_id is null then
  raise exception 'professional not found';
end if;
if auth.uid() is not null and auth_tenant_id() is distinct from v_tenant_id then
  raise exception 'cross-tenant access denied';
end if;
```

`is distinct from` e não `<>`: com `<>`, NULL devolve NULL, que não é
verdadeiro, e a checagem passaria batido justamente no caso do perfil sem
tenant. Com `is distinct from`, NULL conta como diferente e o portão fecha.

E `revoke execute ... from anon`. Sobram `authenticated` (que sempre tem
`auth.uid()`, logo sempre passa pelo portão) e `service_role` — a via da API,
a única que pula o portão. **Regra número um do projeto 2: a API verifica o
tenant ela mesma; a RLS não a protege.**

### Dívida declarada

A matemática de sobreposição vai existir aqui e já existe em
`check_appointment_conflict` (`20260303100000_fix_appointment_conflict_rpc.sql`).
Duas definições de "colide" divergem no primeiro refactor. Extrair o predicado
num helper único que os dois chamam faz parte deste projeto.

## Consumidores

### `TimeSlotPicker` (agora)

O loop de 24h sai; a fronteira da grade passa a vir do RPC. A tela vira o
primeiro cliente do motor, em produção, antes de o AB encostar nele.

**Regressão a evitar:** o picker hoje mostra *quem* ocupa o horário
(`patient.full_name`, linha 40). O RPC devolve só o livre, então o picker
mantém a consulta própria para o nome e o que muda é só a fronteira da grade.

### API do projeto 2 (depois)

Mesmo RPC, agrupando por data. Não muda nada deste spec.

## Testes

O repo não tem nenhum teste hoje. Aqui teste mocado não serve: o que se afirma
é o comportamento do **Postgres** — precedência, sobreposição, `is distinct
from`, constraint de exclusão. Mock confirmaria a intenção e calaria sobre a
opinião do banco.

Vitest chamando o RPC via `supabase-js` contra Supabase local. Casos-âncora,
escritos antes do motor:

- dia sem expediente → vazio
- 09–12 e 13–18, procedimento 60 min, passo 30 → **11:30 não aparece**
- `block` parcial tira só a faixa dele
- `extra` em dia sem expediente cria slots
- `block` e `extra` sobrepostos → bloqueio vence (D-3)
- agendamento de 60 min às 14:00, passo 30 → somem 13:30, 14:00 e 14:30
- agendamento `cancelled` **não** bloqueia
- data de hoje → horário já passado não aparece
- profissional consultando colega da mesma clínica → ocupação real, não "tudo livre"
- profissional de outra clínica → exceção, não lista vazia
- faixas sobrepostas no mesmo dia → recusadas pelo trigger

Virando a meia-noite (D-7):

- sexta 20:00–02:00 → **sábado 00:30 aparece**
- `block` de dia inteiro na sexta → a madrugada de sábado **também some**
- `block` com horário no sábado 00:00–01:00 → tira só isso; 01:30 continua
- sábado 20:00–02:00 → a cauda cai no **domingo**, atravessando a virada da semana
- faixa que vira a noite sobrepondo a primeira faixa do dia seguinte → recusada

## Entrada em produção

No instante em que o motor entra, ninguém tem expediente cadastrado, e
fail-closed faz o que promete: zero horário para todo mundo. Front subindo
antes do dado é apagão auto-infligido.

1. **Uma migration só** com tabelas, trigger, motor **e backfill** para cada
   profissional existente: **00:00–23:59, nos sete dias da semana**. No mesmo
   arquivo: o que precisa ser atômico não pode ficar em arquivos que sobem em
   transações separadas.
2. **Depois** o deploy do front. No intervalo, o app segue no loop de 24h e
   continua funcionando.
3. Cada profissional corrige o próprio horário na tela nova.

O padrão é o dia inteiro de propósito: é **exatamente o que o app oferece
hoje**, então a migration não tira horário de ninguém. Cogitou-se 05:00–22:00,
descartado em 2026-09-18 — há profissionais que atendem de madrugada, e o
backfill teria apagado a agenda delas até que abrissem a tela. Restringir é
papel da UI, não do backfill.

**Esse padrão é seguro enquanto o único consumidor é a tela**, onde a
profissional vê e julga o que o sistema oferece. Quando a API do projeto 2
entrar, quem lê é um bot, que vai oferecer 05:30 sem hesitar. Cada profissional
ajustar o próprio expediente deixa de ser higiene e passa a ser **pré-requisito
de entrada do projeto 2**.

## Pré-requisito: baseline do schema

**O banco não sobe do zero hoje.** `20260207000000_setup_complete_rls.sql:121`
faz `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`, e nenhuma migration do
repo cria `profiles`, `appointments`, `procedures`, `patients`,
`professional_procedures` ou `cash_register_*`. O `seed.sql` só insere. Não há
`supabase/config.toml`. As tabelas nasceram no dashboard; o git tem só o delta.

Sem banco local não há teste de contrato, então o baseline vem antes de tudo:
`supabase db dump` (leitura pura) de produção vira a migration inicial única, as
migrations antigas são arquivadas (o histórico permanece no git log), e o
baseline é marcado como já aplicado em produção via `supabase migration repair`
— sem isso, o próximo `db push` tentaria aplicá-lo em cima do banco que já o
contém.

## Fora de escopo

Projeto 2 — API pública: hospedagem (Edge Function é a candidata), autenticação
por `Bearer` sem `auth.uid()`, idempotência, `minNoticeHours`, `maxReschedules`,
e a corrida de agendamento sobreposto que o índice UNIQUE parcial atual não
pega (só pega início idêntico; a solução é a mesma constraint de exclusão usada
aqui).
