# Diretrizes do Modelo de Dados — Miss Belle App

> Documento vivo. Atualizar sempre que houver decisão arquitetural relevante.
> Última atualização: 2026-02-26 — todas as perguntas de alinhamento respondidas.

---

## 1. Filosofia do Produto

- **Simples para o usuário, robusto por baixo.** A interface abstrai complexidade técnica e apresenta fluxos intuitivos. O modelo de dados é preciso o suficiente para relatórios financeiros confiáveis.
- **Cada profissional é autônomo.** Cada usuário gerencia seu próprio fluxo financeiro. Créditos, estornos e caixa pertencem ao profissional, não ao tenant de forma compartilhada.
- **Rastreabilidade total.** Toda alteração financeira (reaberturas, estornos, correções) é registrada com motivo, responsável e data. Nada é deletado sem rastro.
- **Multi-tenancy.** Todos os dados são isolados por `tenant_id`.
- **Histórico do cliente é ativo estratégico.** Taxa de retorno, serviços realizados, forma de pagamento preferida, créditos — dados valiosos construídos continuamente a partir do marco de adoção.
- **Dashboard orientado a fluxo de caixa real + projeção.** O profissional vê não apenas o que já recebeu, mas também o que está por vir — receita suspensa (paga, aguardando atendimento) e receita projetada (agendamentos sem pagamento). O mesmo vale para despesas.

---

## 2. Separação Fundamental: Atendimento ≠ Pagamento ✅

Esta é a diretriz conceitual mais importante do sistema.

### Status do Atendimento (`appointments.status`)
Representa o **estado do serviço prestado**. Nunca é alterado automaticamente por ações financeiras.

| Status | Significado |
|---|---|
| `scheduled` | Agendado, aguardando confirmação |
| `confirmed` | Confirmado pelo profissional |
| `completed` | Serviço prestado/realizado |
| `cancelled` | Cancelado (serviço não ocorreu) |

### Status do Pagamento (`appointments.payment_status`)
Representa o **estado financeiro** do agendamento.

| Status | Significado |
|---|---|
| `none` | Sem pagamento registrado |
| `partial` | Sinal pago, restante pendente |
| `paid` | Pago integralmente |
| `reopened` | Reaberto para correção (temporário) |
| `reversed` | Estornado (total ou parcial) |
| `credited` | Valor convertido em crédito com o profissional |
| `legacy` | Registro anterior ao marco de adoção do sistema |

### Regra de ouro
Ações financeiras **nunca** alteram `appointment.status` automaticamente.
Quando há inconsistência, o sistema **sugere** ações ao profissional (cancelar, remarcar) — a decisão é sempre dele.

### Relações entre os dois status
```
completed  + paid      → situação normal ✅
completed  + none      → inadimplência (serviço prestado, pagamento não registrado) ⚠️
completed  + reversed  → serviço ok, dinheiro devolvido
completed  + credited  → serviço ok, valor virou crédito do cliente
cancelled  + paid      → requer ação: estornar ou crédito
confirmed  + partial   → sinal pago, restante a receber
confirmed  + paid      → pagamento antecipado (suspenso até o atendimento)
```

---

## 3. Fluxos Financeiros

### 3.1 Pagamento Normal
```
appointment.status = confirmed
        ↓  PaymentModal
payment_status = paid  |  closing recebe transaction(type=payment)
        ↓  Profissional finaliza caixa do dia
        ↓  appointment_date ≤ hoje
Receita CONSOLIDADA
```

### 3.2 Pagamento Antecipado (appointment_date > hoje)
```
appointment.status = confirmed
        ↓  PaymentModal
payment_status = paid  |  closing recebe transaction(type=payment)
        ↓  status = SUSPENSO (receita esperada, não consolidada)
        ↓  appointment_date chega  +  status → completed
Receita CONSOLIDADA
```
> Aparece no Dashboard como "Receita Suspensa" — contribui para projeção de faturamento.

### 3.3 Reabertura de Pagamento
```
payment_status = paid
        ↓  "Reabrir Pagamento" (motivo obrigatório ≥ 10 chars)
Transações do agendamento REMOVIDAS do closing
closing.total_amount RECALCULADO
payment_status = reopened  ← temporário
appointment.status NÃO MUDA
Sistema SUGERE: "Deseja cancelar ou remarcar o atendimento?"
        ↓  Profissional refaz via PaymentModal
payment_status = paid
```
> Pode ser reaberto múltiplas vezes. Cada reabertura gera nota com data + motivo.

### 3.4 Estorno
```
payment_status = paid (ou partial)
        ↓  "Estornar" → formulário obrigatório
Nova transaction(type=reversal) no closing do dia
payment_status = reversed
appointment.status NÃO MUDA
Sistema SUGERE ação se necessário (ex: cancelar atendimento)
```

### 3.5 Conversão para Crédito
```
Estorno ou cancelamento com pagamento
        ↓  Profissional escolhe "Converter em Crédito"
Nenhuma transaction de reversal
patient_credits += valor  (pertence ao profissional)
payment_status = credited
```

---

## 4. Regras de Negócio Detalhadas

### Reabertura de pagamento
- Permitida múltiplas vezes sem limite
- Motivo obrigatório (mínimo 10 caracteres), salvo nas notas do closing
- Não altera `appointment.status`

### Estorno
- Pode ser **total ou parcial** (valor ≤ valor pago original)
- Forma do estorno: definida pelo profissional (pode diferir da forma original)
- Prazo para estorno: definido pelo profissional (sem prazo padrão do sistema)
- Formulário obrigatório (ver seção 6)
- Registro permanente e imutável

### Crédito do cliente
- Pertence ao **profissional** (não ao tenant geral)
- Tem validade definida pelo profissional no momento da concessão
- Pode ser usado **parcialmente** (saldo restante permanece)
- Pode ser usado em qualquer atendimento futuro do mesmo cliente com o mesmo profissional
- Sinal (`downpayment`) cancelado pode ser convertido em crédito

### Sinal (Downpayment)
- Permanece como campo separado (`appointments.downpayment_amount`)
- Pode ter políticas diferentes (ex: não reembolsável)
- Profissional escolhe se o sinal será **abatido** do valor final ou **cobrado à parte**
- Sinal de atendimento cancelado pode virar crédito (decisão do profissional)

### Consolidação financeira
- Pagamento **consolidado** = `closing.is_finalized = true` E `appointment_date ≤ hoje`
- Pagamento **suspenso** = pago mas `appointment_date > hoje` (receita futura garantida)
- Pagamento **projetado** = agendamento futuro sem pagamento registrado

### Inadimplência
- Definida como: `appointment.status = completed` E `payment_status = none`
- Relatório dedicado para visualização e acompanhamento

---

## 5. Dashboard — Visão Financeira Completa

O dashboard deve mostrar:

```
┌─────────────────────────────────────────────────────┐
│  RECEITA                                            │
│  ├─ Consolidada      R$ X.XXX  (já recebida e ok)  │
│  ├─ Suspensa         R$ X.XXX  (paga, atend. futuro)│
│  ├─ Projetada        R$ X.XXX  (agend. sem pagto)   │
│  └─ Estornos        -R$   XXX  (deduzido do total)  │
├─────────────────────────────────────────────────────│
│  DESPESAS                                           │
│  ├─ Pagas            R$ X.XXX                       │
│  └─ Previstas        R$ X.XXX  (despesas futuras)   │
├─────────────────────────────────────────────────────│
│  INADIMPLÊNCIA       R$   XXX  (concluídos s/ pgt)  │
└─────────────────────────────────────────────────────┘
```

> Créditos de clientes: registrados mas não exibidos no dashboard por ora. Consulta disponível na tela de Pacientes (futuro).

---

## 6. Formulário de Estorno (Padrão de Mercado)

Campos **obrigatórios**:

| Campo | Regra |
|---|---|
| Motivo do estorno | texto livre, mín. 20 chars |
| Resultado | `dinheiro_devolvido` \| `credito_cliente` |
| Forma do estorno | se dinheiro: dinheiro / pix / cartão / outro |
| Valor estornado | numérico, ≤ valor pago original |
| Data do estorno | default hoje, editável |

Campos **gerados automaticamente**:
| Campo | Valor |
|---|---|
| Número de protocolo | `EST-YYYYMMDD-XXXX` (sequencial por tenant) |
| Autorizado por | profissional logado |
| Criado em | timestamp atual |

> Registro permanente e imutável. Não pode ser excluído, apenas consultado.

---

## 7. Histórico do Cliente

Disponível na tela de Pacientes, por cliente:

- Lista de atendimentos (data, profissional, serviço, status)
- Forma de pagamento utilizada em cada atendimento
- Total pago (desde o marco de adoção)
- Número de remarcações
- Crédito disponível (por profissional)
- Indicadores: frequência de retorno, serviço mais utilizado

---

## 8. Modelo de Dados — Schema Alvo

### `appointments` — acréscimos
```sql
payment_status  text  NOT NULL DEFAULT 'none'
                      CHECK (payment_status IN (
                        'none','partial','paid','reopened',
                        'reversed','credited','legacy'
                      ))
payment_paid_at timestamptz  -- data/hora do pagamento efetivo
```

### `cash_register_transactions` — acréscimos
```sql
type            text  NOT NULL DEFAULT 'payment'
                      CHECK (type IN ('payment','reversal','adjustment'))
reversal_reason text            -- obrigatório quando type = 'reversal'
reversal_method text            -- forma do estorno
reversal_at     timestamptz
reversed_by     uuid  REFERENCES profiles(id)
reversal_of     uuid  REFERENCES cash_register_transactions(id)
reversal_protocol text          -- ex: EST-20260226-0001
```

### `patient_credits` — tabela nova
```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id               uuid NOT NULL REFERENCES tenants(id)
patient_id              uuid NOT NULL REFERENCES patients(id)
professional_id         uuid NOT NULL REFERENCES profiles(id)
amount_original         numeric(10,2) NOT NULL CHECK (amount_original > 0)
amount_remaining        numeric(10,2) NOT NULL CHECK (amount_remaining >= 0)
origin                  text NOT NULL  -- 'reversal' | 'cancellation' | 'downpayment' | 'manual'
origin_appointment_id   uuid REFERENCES appointments(id)
origin_transaction_id   uuid REFERENCES cash_register_transactions(id)
notes                   text
expires_at              date           -- validade definida pelo profissional (null = sem prazo)
created_at              timestamptz DEFAULT now()
created_by              uuid REFERENCES profiles(id)

-- uso do crédito (pode ser em múltiplos usos parciais)
-- rastreado em tabela filha patient_credit_uses
```

### `patient_credit_uses` — tabela nova
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
credit_id       uuid NOT NULL REFERENCES patient_credits(id)
appointment_id  uuid REFERENCES appointments(id)
amount_used     numeric(10,2) NOT NULL CHECK (amount_used > 0)
used_at         timestamptz DEFAULT now()
used_by         uuid REFERENCES profiles(id)
```

### `cash_register_closings` — sem mudanças estruturais
- `closing_date` = **data do pagamento** ✅
- `total_amount` recalculado a cada transação
- `is_finalized` controla edição

---

## 9. Decisões sobre Dados Históricos

- Base atual: ~3.000 clientes, sem histórico financeiro retroativo
- **Estratégia:** marco zero na data de adoção do sistema
- Appointments existentes → `payment_status = 'legacy'` (excluídos de relatórios financeiros detalhados)
- Aparecem no histórico de atendimentos (data, serviço) mas sem dados de pagamento
- **Crédito manual:** interface para cadastrar créditos pré-existentes sem transação de origem
- Relatórios sempre exibem: "Dados financeiros a partir de [data de adoção]"

---

## 10. Roadmap de Implementação

### Fase 1 — Schema (Supabase)
- [ ] Adicionar `payment_status` e `payment_paid_at` em `appointments`
- [ ] Adicionar campos de estorno em `cash_register_transactions`
- [ ] Criar tabela `patient_credits`
- [ ] Criar tabela `patient_credit_uses`
- [ ] Atualizar RLS para novas colunas e tabelas
- [ ] Migration: setar `payment_status = 'legacy'` em todos os appointments existentes
- [ ] Migration: setar `payment_status = 'paid'` em appointments com transações válidas

### Fase 2 — Fluxo de Pagamento
- [ ] Atualizar PaymentModal para setar `payment_status = 'paid'` e `payment_paid_at`
- [ ] Implementar Reabertura de Pagamento (sem alterar appointment.status)
- [ ] Implementar formulário de Estorno com geração de protocolo
- [ ] Implementar conversão de estorno → crédito do cliente

### Fase 3 — Histórico do Cliente
- [ ] Tela de histórico financeiro em Pacientes
- [ ] Gestão de créditos (criar, consultar, usar parcialmente)
- [ ] Cadastro de crédito manual

### Fase 4 — Dashboard
- [ ] Receita consolidada / suspensa / projetada / estornos
- [ ] Despesas pagas / previstas
- [ ] Relatório de inadimplência
- [ ] Projeção de faturamento com agendamentos futuros
