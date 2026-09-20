# API de Agendamento — Miss Belle — v1

Contrato para o time do Agent Builder (LIVIA). Permite consultar profissionais,
procedimentos e horários livres, e criar, consultar, cancelar e remarcar
agendamentos.

> Versão do contrato: 2026-09-19. Mudanças em relação ao rascunho original estão
> marcadas com **(novo)** ou **(alterado)**. A numeração dos endpoints 1–6 é a
> original; o 7 é o pedido do time AB.

## Convenções

- **Base URL:** `https://otzaauwiziyoxlvttgsb.supabase.co/functions/v1/api/v1` **(alterado)** — o domínio
  `api.missbele.com` ainda não existe; quando existir, só a base URL muda.
- **Auth:** `Authorization: Bearer {chave}`. A chave pertence a **uma** clínica e
  só enxerga os dados dela. Chave ausente, inválida ou revogada → `401`.
- **Content-Type:** `application/json`.
- **IDs:** string (UUID).
- **Datas/horas:** ISO 8601 **com offset obrigatório** (ex.: `2026-09-20T14:30:00-03:00`).
  Sem offset → `422`. Respostas saem sempre em `-03:00` (horário de Brasília).
- Listagens sem paginação: `{ "data": [...] }`.
- **Erro padrão:**

```json
{ "error": { "code": "SLOT_NOT_AVAILABLE", "message": "Texto legível.", "details": {} } }
```

- **Status de agendamento:** `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED` **(novo)**.
  Agendamentos criados pela API nascem `CONFIRMED`. Agendamentos marcados pela
  profissional no app nascem `SCHEDULED`.

### Telefone **(novo)**

- Aceito com ou sem `+`, máscara ou espaços. A API normaliza para E.164 **com o
  9º dígito** de celular brasileiro (`+5588999990000`); o número antigo sem o 9,
  como o WhatsApp costuma mandar, casa com o mesmo cliente.
- **Requisito do integrador:** o `phone` usado para buscar, cancelar ou remarcar
  tem que ser o **do contato da conversa, vindo do canal** — nunca um número
  digitado pelo cliente no chat. O telefone é a chave de acesso à agenda da
  cliente.
- Cadastros antigos com telefone inválido (~1%) não são encontrados pela busca.
  Contato sem telefone (identificador `@lid` do WhatsApp) não pode ser buscado.

---

## 1) `GET /professionals`

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `available` | boolean | não (default `true`) | `true`: só profissionais ativos. `false`: todos. |

```json
{
  "data": [
    { "id": "9f1c…", "name": "Ana Souza", "avatarUrl": null, "specialty": null, "available": true }
  ]
}
```

`avatarUrl` e `specialty` **(alterado)** vêm `null` no v1 — o cadastro ainda não
tem esses campos.

## 2) `GET /professionals/{professionalId}/procedures`

```json
{
  "data": [
    {
      "id": "3ab2…",
      "name": "Corte + Escova",
      "description": "Corte personalizado seguido de escova modeladora.",
      "synonyms": ["corte e escova", "escova modeladora"],
      "durationMinutes": 60,
      "price": 120.00,
      "variablePrice": false
    }
  ]
}
```

- `description`: sempre presente (pode ser `""`).
- `synonyms`: array, default `[]`. Uso interno para casar linguagem natural.
- `variablePrice` **(novo)**: quando `true`, `price` é o **mínimo** — o bot deve
  dizer "a partir de", nunca prometer o valor exato.
- `404 PROFESSIONAL_NOT_FOUND` se o profissional não existir nesta clínica.

## 3) `GET /professionals/{professionalId}/availability`

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `procedureId` | string | sim | define a duração |
| `startDate` | date `YYYY-MM-DD` | não (default hoje) | início da busca |
| `days` | int | sim, 1 a 60 | tamanho da janela |

```json
{
  "data": [
    { "date": "2026-09-20", "slots": ["09:00", "09:30", "14:00"] },
    { "date": "2026-09-21", "slots": [] }
  ]
}
```

- Todo dia da janela aparece, mesmo sem horário (`slots: []`).
- Só aparecem horários dentro do expediente da profissional, fora de folgas e
  bloqueios, onde o procedimento **cabe inteiro**, sem colidir com outro
  agendamento, e ainda não passados.
- `days` > 60 → `400 MAX_RANGE_EXCEEDED`.
- `422 PROCEDURE_NOT_OFFERED` **(novo)**: o procedimento existe, mas esta
  profissional não o realiza.

## 4) `POST /appointments`

```json
{
  "professionalId": "9f1c…",
  "procedureId": "3ab2…",
  "dateTime": "2026-09-20T14:30:00-03:00",
  "client": { "name": "João Lima", "phone": "+5588999990000" },
  "notes": "Cliente prefere shampoo sem sulfato",
  "availabilityCheckedAt": "2026-09-20T14:25:10-03:00"
}
```

- Header **`Idempotency-Key`** recomendado. A mesma chave com o mesmo corpo
  devolve a mesma resposta (sem criar outro agendamento), por 24h. A mesma chave
  com corpo **diferente** → `422 IDEMPOTENCY_KEY_REUSED` **(novo)**.
- `availabilityCheckedAt` **(novo, opcional)**: quando o bot consultou o endpoint 3.
  É o que permite à API distinguir `409` de `422` (abaixo).
- Cliente já cadastrada com o mesmo telefone é reutilizada — **o nome do
  cadastro prevalece** sobre o `client.name` enviado.

**`201`**

```json
{
  "id": "77ac…",
  "status": "CONFIRMED",
  "professionalId": "9f1c…",
  "procedureId": "3ab2…",
  "dateTime": "2026-09-20T14:30:00-03:00",
  "client": { "name": "João Lima", "phone": "+5588999990000" },
  "notes": "Cliente prefere shampoo sem sulfato",
  "rescheduleCount": 0
}
```

### Erros de horário

| Situação | Status | Código |
|---|---|---|
| Horário não oferecido: fora do expediente, não cabe, já passou, fora da grade de horários, ou ocupado por agendamento criado **antes** de `availabilityCheckedAt` (ou sem esse campo) | 422 | `SLOT_NOT_AVAILABLE` |
| Estava livre quando o bot consultou e foi ocupado por agendamento criado **depois** de `availabilityCheckedAt` | 409 | `SLOT_TAKEN_MEANTIME` |

**(alterado)** Sem `availabilityCheckedAt`, a API não tem como saber se houve
corrida e responde `422`. O `409` só é dado quando é verdade — o bot pode dizer
"acabou de ser reservado" com segurança.

Ambos trazem até 5 `suggestedSlots`: primeiro da mesma data, pelos mais próximos
do horário pedido; depois dos dias seguintes, em ordem.

```json
{
  "error": {
    "code": "SLOT_TAKEN_MEANTIME",
    "message": "Esse horário estava disponível, mas acabou de ser reservado por outro cliente.",
    "details": {
      "professionalId": "9f1c…",
      "procedureId": "3ab2…",
      "requestedDateTime": "2026-09-20T14:30:00-03:00",
      "wasAvailableUntil": "2026-09-20T14:29:47-03:00",
      "suggestedSlots": [
        { "date": "2026-09-20", "time": "15:00" },
        { "date": "2026-09-20", "time": "13:30" },
        { "date": "2026-09-21", "time": "09:00" }
      ]
    }
  }
}
```

`wasAvailableUntil` só existe no `409`: é o momento em que o outro agendamento
foi criado.

### Outros erros

| Status | Código | Quando |
|---|---|---|
| 422 | `VALIDATION_ERROR` | campo obrigatório faltando, telefone inválido, `dateTime` sem offset. `details.field` indica qual |
| 422 | `PROCEDURE_NOT_OFFERED` | a profissional não realiza o procedimento |
| 404 | `PROFESSIONAL_NOT_FOUND` / `PROCEDURE_NOT_FOUND` | não existe nesta clínica |

## 5) `DELETE /appointments/{id}`

Body opcional: `{ "reason": "Cliente não poderá comparecer" }`.

**`200`**

```json
{ "id": "77ac…", "status": "CANCELLED", "cancelledAt": "2026-09-19T10:00:00-03:00" }
```

Cancelar um agendamento já cancelado devolve `200` com o mesmo corpo.

| Status | Código | Quando |
|---|---|---|
| 422 | `CANCELLATION_NOT_ALLOWED` | a menos de `minNoticeHours` do horário (`details.minNoticeHours`, `details.appointmentDateTime`) |
| 422 | `CANCELLATION_REQUIRES_STAFF` **(novo)** | o agendamento tem pagamento registrado; o cancelamento exige decidir estorno ou crédito — transferir para atendimento humano |
| 422 | `APPOINTMENT_NOT_ACTIVE` **(novo)** | já concluído |
| 404 | `APPOINTMENT_NOT_FOUND` | não existe nesta clínica |

## 6) `PATCH /appointments/{id}`

Body: `{ "dateTime": "2026-09-21T09:00:00-03:00", "availabilityCheckedAt": "…" }`.

**`200`** **(alterado — antes não documentado)**: o mesmo corpo do `POST`, com
`rescheduleCount` atualizado.

- Mesma validação de horário do `POST` (`422 SLOT_NOT_AVAILABLE` / `409 SLOT_TAKEN_MEANTIME`, com `suggestedSlots`).
- `422 RESCHEDULE_NOT_ALLOWED`: limite de remarcações atingido (`details.maxReschedules`, `details.rescheduleCount`).
- `422 CANCELLATION_NOT_ALLOWED` **(novo)**: remarcar a menos de `minNoticeHours` do
  horário **atual** — remarcar em cima da hora abre o mesmo buraco que cancelar.
- `422 APPOINTMENT_NOT_ACTIVE`, `404 APPOINTMENT_NOT_FOUND`.

## 7) `GET /appointments?phone=` **(novo)**

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `phone` | string | sim | telefone do contato da conversa (ver "Telefone") |
| `from` | datetime com offset | não (default agora) | só a partir deste momento |
| `status` | lista separada por vírgula | não (default `SCHEDULED,CONFIRMED`) | filtro |

O default são os **ativos**. Filtrar só `CONFIRMED` deixaria de fora os
agendamentos marcados pela profissional no app, que nascem `SCHEDULED`.

```json
{
  "data": [
    {
      "id": "77ac…",
      "status": "CONFIRMED",
      "professionalId": "9f1c…",
      "professionalName": "Ana Souza",
      "procedureId": "3ab2…",
      "procedureName": "Corte + Escova",
      "dateTime": "2026-09-20T14:30:00-03:00",
      "client": { "name": "João Lima", "phone": "+5588999990000" }
    }
  ]
}
```

Ordenado por `dateTime` crescente. Nenhum agendamento → `{ "data": [] }` (nunca `404`).

## Políticas

`minNoticeHours` (padrão 2) e `maxReschedules` (padrão 1) são configuradas **por
profissional**. Valem só para cancelamento e remarcação feitos pela API; a
profissional continua livre no app.

## Ambientes

- **Sandbox:** uma clínica de teste, com profissionais e procedimentos
  fictícios e **chave própria**. Mesma URL de produção; a chave de sandbox só
  enxerga a clínica de teste.
- **Produção:** chave emitida por clínica, entregue por canal seguro.

## Fora de escopo

Notificação ao cliente (WhatsApp de confirmação/lembrete). Futuro possível:
webhooks `APPOINTMENT_CREATED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_RESCHEDULED`.

## Tabela de códigos

| Código | HTTP | Endpoints |
|---|---|---|
| `UNAUTHORIZED` | 401 | todos |
| `VALIDATION_ERROR` | 422 | todos com parâmetros |
| `MAX_RANGE_EXCEEDED` | 400 | availability |
| `PROFESSIONAL_NOT_FOUND` | 404 | 2, 3, 4 |
| `PROCEDURE_NOT_FOUND` | 404 | 3, 4 |
| `PROCEDURE_NOT_OFFERED` | 422 | 3, 4 |
| `APPOINTMENT_NOT_FOUND` | 404 | 5, 6 |
| `APPOINTMENT_NOT_ACTIVE` | 422 | 5, 6 |
| `SLOT_NOT_AVAILABLE` | 422 | 4, 6 |
| `SLOT_TAKEN_MEANTIME` | 409 | 4, 6 |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 4 |
| `CANCELLATION_NOT_ALLOWED` | 422 | 5, 6 |
| `CANCELLATION_REQUIRES_STAFF` | 422 | 5 |
| `RESCHEDULE_NOT_ALLOWED` | 422 | 6 |
