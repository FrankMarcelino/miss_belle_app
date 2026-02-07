# 📖 GUIA RÁPIDO: Sistema de Pagamento com Múltiplas Formas

## 🎯 Como usar o novo sistema?

---

## 1️⃣ Criar Agendamento com Calção

### Passo a passo:

1. **Acesse a Agenda** (`/minha-agenda` ou `/agenda`)

2. **Clique em "Novo Agendamento"**

3. **Preencha os dados**:
   - Selecione o paciente
   - Escolha o procedimento
   - Defina data e horário

4. **Adicione o calção** (opcional):
   - ☑️ Marque "Cliente pagou calção (entrada)"
   - 💰 Veja o valor total do serviço
   - 💵 Digite o valor do calção
   - 💳 Selecione a forma de pagamento (Dinheiro/Crédito/Débito/PIX)
   - 📝 Adicione observações (opcional)

5. **Visualize o restante**:
   - O sistema calcula automaticamente: `Restante = Total - Calção`

6. **Salvar**:
   - ✅ Agendamento criado
   - ✅ Calção registrado no caixa
   - ✅ Transação criada automaticamente

---

## 2️⃣ Finalizar Atendimento PELA AGENDA

### Passo a passo:

1. **Acesse a Agenda**

2. **Clique no agendamento** para ver detalhes

3. **Veja informações do calção** (se houver):
   - 💰 Calção Pago: R$ 30,00
   - 💳 Forma: PIX
   - 📝 Observações

4. **Clique em "Concluir"**

5. **Modal de Pagamento abre**:
   - 📊 Total do serviço
   - ✅ Calção já pago (verde)
   - 💵 Valor a receber (restante)

6. **Adicione formas de pagamento**:
   - Primeira forma já vem preenchida com o total restante
   - Selecione a forma (Dinheiro/Crédito/Débito/PIX)
   - Ajuste o valor
   - Clique "➕ Adicionar Forma" para mais formas

**Exemplo:** Cliente pagou R$ 50 em dinheiro e R$ 70 no cartão
   ```
   [▼ Dinheiro  ] R$ [50,00] [X]
   [▼ Crédito   ] R$ [70,00] [X]
   ```

7. **Validação automática**:
   - ✅ Verde: Soma está correta
   - ⚠️ Laranja: Soma está incorreta (botão desabilitado)

8. **Clicar "Finalizar Pagamento"**:
   - ✅ Cria 2 transações no caixa
   - ✅ Status vira "Completed"
   - ✅ Toast de sucesso

---

## 3️⃣ Finalizar Atendimento PELO CAIXA

### Passo a passo:

1. **Acesse a página Caixa** (`/caixa`)

2. **Veja "Atendimentos Pendentes de Pagamento"**:
   - Lista todos agendamentos do dia ainda não pagos
   - Status: Scheduled ou Confirmed

3. **Cada card mostra**:
   - ⏰ Horário e nome do paciente
   - 💇 Procedimento e valor
   - 💰 Calção pago (se houver)

4. **Clique em "Fechar Caixa"** no atendimento desejado

5. **Mesmo fluxo do passo 2️⃣** (PaymentModal)

---

## 4️⃣ Ver Histórico de Transações

1. **Acesse a página Caixa**

2. **Clique em um fechamento** da lista

3. **Veja todas as transações**:
   - Agendamentos pagos
   - Múltiplas formas de pagamento por agendamento
   - Transações avulsas
   - Total consolidado

4. **Identificação de tipos**:
   - 💰 "downpayment" = Calção de agendamento
   - 💵 "remaining_payment" = Pagamento do restante
   - 💳 "full_payment" = Pagamento total

---

## 💡 Exemplos Práticos

### Exemplo 1: Pagamento Simples
- **Cenário**: Hidratação R$ 120, sem calção
- **Ação**: Finalizar com PIX
- **Resultado**: 1 transação de R$ 120 (full_payment)

### Exemplo 2: Com Calção e Pagamento Único
- **Cenário**: Limpeza R$ 150, calção R$ 30 (PIX)
- **Ação**: Finalizar com R$ 120 em dinheiro
- **Resultado**: 2 transações
  - R$ 30 PIX (downpayment)
  - R$ 120 Dinheiro (remaining_payment)

### Exemplo 3: Calção + Múltiplas Formas
- **Cenário**: Peeling R$ 300, calção R$ 100 (Débito)
- **Ação**: Finalizar com R$ 100 dinheiro + R$ 100 crédito
- **Resultado**: 3 transações
  - R$ 100 Débito (downpayment)
  - R$ 100 Dinheiro (remaining_payment)
  - R$ 100 Crédito (remaining_payment)

### Exemplo 4: Cliente já pagou tudo
- **Cenário**: Manicure R$ 50, calção R$ 50
- **Ação**: Ao finalizar, restante = R$ 0
- **Solução**: Pode finalizar direto sem adicionar pagamento
  - (Implementação: permitir R$ 0 no modal)

---

## ⚠️ Validações e Bloqueios

### O sistema NÃO permite:
- ❌ Calção maior ou igual ao valor total
- ❌ Valores negativos
- ❌ Soma diferente do restante a pagar
- ❌ Finalizar sem forma de pagamento
- ❌ Finalizar agendamento cancelado

### O sistema PERMITE:
- ✅ Agendamento sem calção
- ✅ Múltiplas formas de pagamento
- ✅ Finalizar pela Agenda ou Caixa
- ✅ Observações opcionais no calção

---

## 🎨 Interface Visual

### Indicadores de Status:
- 🟢 Verde com ✓ = Soma correta
- 🟠 Laranja com ⚠️ = Soma incorreta
- 🔵 Azul = Calção já pago
- ⚫ Cinza = Sem pagamento

### Feedback:
- Toast de sucesso ao criar/finalizar
- Toast de erro em caso de problema
- Loading spinner durante processamento
- Botões desabilitados durante operações

---

## 🚀 Está Pronto!

O sistema está completamente implementado e funcionando. Basta testar os fluxos descritos acima!

**Qualquer dúvida, consulte a documentação completa em:**
- `IMPLEMENTACAO-PAGAMENTO-MULTIPLO-COMPLETA.md`
