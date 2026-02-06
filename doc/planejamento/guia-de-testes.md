# Guia de Testes - Miss Belle App

Este guia detalha como testar todas as funcionalidades implementadas usando os dados do seed.

## 📋 Pré-requisitos

1. ✅ Migrations aplicadas (`supabase db push`)
2. ✅ Seed executado (`supabase/seed.sql`)
3. ✅ Pelo menos 1 usuário criado via signup

---

## 🎯 Cenários de Teste

### 1️⃣ AGENDA - Conflito por Sobreposição

**Objetivo**: Validar que o sistema impede agendamentos sobrepostos considerando a duração.

**Dados do seed**:
- Hoje às 09:00: Limpeza de Pele (60min) - Status: COMPLETED
- Portanto, o horário está ocupado de 09:00 até 10:00

**Passos**:
1. Acesse **Agenda** (`/minha-agenda`)
2. Clique em **Novo Agendamento**
3. Preencha:
   - Paciente: Qualquer um da lista
   - Procedimento: **Design de Sobrancelhas** (30min)
   - Data: **Hoje**
   - Horário: **09:30**
4. Tente salvar

**Resultado esperado**:
- ❌ Erro: "Conflito de horário!"
- 📝 Mensagem explicativa sobre sobreposição
- 🚫 Agendamento não é criado

**Validação adicional**:
- Tente também às 09:00 (início idêntico) → deve bloquear
- Tente também às 09:45 (termina após 10:00) → deve bloquear
- Tente às 10:00 exatamente → deve permitir ✅

---

### 2️⃣ AGENDA - Cancelamento com Motivo

**Objetivo**: Validar captura e exibição do motivo de cancelamento.

**Dados do seed**:
- Hoje às 14:00: Hidratação Facial - Status: SCHEDULED

**Passos**:
1. Na **Agenda**, clique no card do agendamento de 14:00
2. No modal de detalhes, clique em **Cancelar**
3. Um formulário aparece pedindo o motivo
4. Digite: "Cliente solicitou remarcação para próxima semana"
5. Clique em **Confirmar Cancelamento**
6. Reabra o mesmo agendamento

**Resultado esperado**:
- ✅ Status muda para "Cancelado"
- 📝 Campo "Motivo do Cancelamento" aparece no modal
- 📄 Exibe o texto que você digitou
- 🎨 Visual diferenciado (badge cinza)

**Validação adicional**:
- O seed já tem um cancelamento com motivo (16:30 de hoje)
- Verifique se esse também exibe corretamente

---

### 3️⃣ AGENDA - Fluxo Completo de Status

**Objetivo**: Validar transição de status do agendamento.

**Dados do seed**:
- Hoje às 15:00: Massagem Relaxante - Status: SCHEDULED

**Passos**:
1. Abra o agendamento de 15:00
2. Clique em **Confirmar** → status vira "Confirmado" (azul)
3. Reabra o agendamento
4. Clique em **Concluir** → status vira "Realizado" (verde)
5. Reabra o agendamento
6. Observe que não há mais botões de ação (status final)

**Resultado esperado**:
- ✅ Cada transição funciona corretamente
- 🎨 Cores mudam conforme o status
- 🔒 Após "Realizado", não permite mais alterações
- 📊 Agendamento "Realizado" fica disponível para vincular no caixa

---

### 4️⃣ CAIXA - Total Automático (Trigger)

**Objetivo**: Validar que o total é mantido automaticamente pelo banco.

**Dados do seed**:
- Fechamento de HOJE em aberto com 1 transação de R$ 150,00

**Passos**:
1. Acesse **Fechar Caixa** (`/fechar-caixa`)
2. Abra o fechamento de hoje
3. **Total atual**: R$ 150,00
4. Clique em **Nova Transação**
5. Adicione:
   - Valor: R$ 80,00
   - Forma de pagamento: PIX
   - Observações: "Produto vendido"
6. Salve
7. Observe o total

**Resultado esperado**:
- ✅ Total atualiza AUTOMATICAMENTE para R$ 230,00
- ⚡ Atualização instantânea (sem reload manual)
- 📊 Valor correto sempre (150 + 80 = 230)

**Validação adicional**:
1. Delete a transação de R$ 80,00
2. Total volta para R$ 150,00 automaticamente ✅

---

### 5️⃣ CAIXA - Vinculação com Agendamento

**Objetivo**: Validar vinculação de transação a agendamento completo.

**Preparação**:
1. Na agenda, marque o agendamento de 10:30 como "Realizado"
2. Volte para o Caixa

**Passos**:
1. Abra o fechamento de hoje
2. Clique em **Nova Transação**
3. Observe o campo "Atendimento (opcional)"
4. Deve aparecer: "Beatriz Costa - Design de Sobrancelhas"
5. Selecione esse atendimento
6. Valor: R$ 80,00
7. Forma: Cartão de Débito
8. Salve

**Resultado esperado**:
- ✅ Transação criada com sucesso
- 🔗 Na lista, mostra "Beatriz Costa - Design de Sobrancelhas"
- 💰 Total atualizado (150 + 80 = R$ 230,00)

**Validação adicional**:
- Transações podem ser criadas SEM vincular agendamento ✅
- Apenas agendamentos "Realizados" aparecem na lista ✅

---

### 6️⃣ CAIXA - Fechamento Finalizado (Imutável)

**Objetivo**: Validar que fechamentos finalizados não podem ser alterados.

**Dados do seed**:
- Fechamento de ONTEM finalizado com 3 transações

**Passos**:
1. Acesse a lista de fechamentos
2. Abra o fechamento de **ontem** (badge verde "Finalizado")
3. Observe a interface

**Resultado esperado**:
- 🔒 Botão "Nova Transação" NÃO aparece
- 🚫 Botões de delete nas transações NÃO aparecem
- ✅ Badge verde "Finalizado" visível
- 📊 Total fixo e correto

**Teste de finalização**:
1. Volte ao fechamento de HOJE (em aberto)
2. Clique em **Finalizar**
3. Confirme
4. Reabra o fechamento

**Resultado esperado após finalizar**:
- ✅ Badge muda para "Finalizado" (verde)
- 🔒 Não permite mais adicionar/deletar transações
- ⏰ Campo `finalized_at` preenchido no banco

---

### 7️⃣ CAIXA - Concorrência de Total

**Objetivo**: Validar que múltiplas operações simultâneas não quebram o total.

**Preparação** (requer 2 abas do navegador):
1. Abra o fechamento de hoje na aba 1
2. Abra o mesmo fechamento na aba 2

**Passos**:
1. **Aba 1**: Adicione transação de R$ 100,00
2. **Aba 2**: Adicione transação de R$ 50,00 (sem recarregar)
3. Recarregue ambas as abas
4. Verifique o total

**Resultado esperado**:
- ✅ Total correto: valor_inicial + 100 + 50
- 🔢 Nenhum valor perdido ou duplicado
- 💪 Trigger garante consistência

---

### 8️⃣ AGENDA - Visualização por Profissional (Super Admin)

**Objetivo**: Validar filtro de profissional na agenda geral.

**Pré-requisito**: Usuário logado deve ser super_admin

**Passos**:
1. Acesse **Agenda Geral** (`/agenda-geral`)
2. Observe o filtro "Profissional"
3. Selecione um profissional específico
4. Veja apenas agendamentos daquele profissional

**Resultado esperado**:
- 📋 Lista atualiza filtrada
- 👥 Super admin vê todos
- 🔍 Filtro funcional

---

### 9️⃣ DASHBOARD - Estatísticas

**Objetivo**: Validar que o dashboard reflete os dados do seed.

**Passos**:
1. Acesse **Dashboard**
2. Observe os cards de estatísticas

**Resultado esperado**:
- 📊 Agendamentos do Mês: mostra contagem
- 💰 Receita do Mês: soma dos fechamentos
- ✅ Atendimentos Concluídos: conta status "completed"
- 📈 Próximos Agendamentos: lista ordenada por data/hora
- 🏆 Procedimentos Populares: ranking por frequência

---

## 🐛 Troubleshooting

### Problema: "Nenhum agendamento para este dia"
**Solução**: Verifique se o seed foi executado corretamente. Execute:
```sql
SELECT * FROM appointments WHERE appointment_date = CURRENT_DATE;
```

### Problema: "Nenhum paciente na lista"
**Solução**: O seed cria pacientes para o primeiro usuário ativo. Faça login com esse usuário ou execute:
```sql
SELECT seed_patients_for_professional('SEU-UUID-AQUI');
```

### Problema: Total do caixa não atualiza
**Solução**: Verifique se a migration do trigger foi aplicada:
```sql
SELECT proname FROM pg_proc WHERE proname = 'recalculate_closing_total';
```

### Problema: Conflito de agenda não é detectado
**Solução**: Verifique se a função RPC existe:
```sql
SELECT proname FROM pg_proc WHERE proname = 'check_appointment_conflict';
```

---

## ✅ Checklist de Validação Completa

Marque cada item após testar com sucesso:

**Agenda**:
- [ ] Conflito por sobreposição detectado
- [ ] Agendamento no horário livre permite
- [ ] Cancelamento com motivo funciona
- [ ] Motivo exibido em agendamento cancelado
- [ ] Transição de status (scheduled → confirmed → completed)
- [ ] Status "completed" disponível no caixa

**Caixa**:
- [ ] Total atualiza automaticamente ao adicionar transação
- [ ] Total atualiza automaticamente ao deletar transação
- [ ] Transação vinculada a agendamento exibe corretamente
- [ ] Apenas agendamentos "completed" aparecem para vincular
- [ ] Fechamento finalizado bloqueia alterações (UI)
- [ ] Fechamento finalizado bloqueia alterações (banco)
- [ ] Múltiplas operações não quebram consistência

**Dashboard**:
- [ ] Estatísticas corretas
- [ ] Próximos agendamentos ordenados
- [ ] Procedimentos populares com ranking

---

## 📝 Relatando Bugs

Se encontrar algum problema:
1. Anote o cenário exato que causou o erro
2. Tire print da mensagem de erro (se houver)
3. Verifique o console do navegador (F12 → Console)
4. Verifique logs do Supabase (Dashboard → Logs)
5. Documente e reporte

---

**Última atualização**: 06/02/2026
