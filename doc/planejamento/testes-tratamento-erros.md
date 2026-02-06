# 🧪 Guia de Testes - Sistema de Tratamento de Erros

**Data**: 06/02/2026  
**Componente**: Criação de Agendamento  
**Tempo estimado**: 15-20 minutos  

---

## ✅ Checklist de Testes

### 1. Validações Client-Side (Campos Obrigatórios)

#### Teste 1.1: Paciente vazio
- [ ] Abrir formulário de novo agendamento
- [ ] **NÃO** selecionar paciente
- [ ] Preencher todos os outros campos
- [ ] Clicar em "Agendar"
- **✓ Esperado**: Toast amarelo "Paciente obrigatório"

#### Teste 1.2: Procedimento vazio
- [ ] Abrir formulário de novo agendamento
- [ ] Selecionar paciente
- [ ] **NÃO** selecionar procedimento
- [ ] Preencher data/hora/profissional
- [ ] Clicar em "Agendar"
- **✓ Esperado**: Toast amarelo "Procedimento obrigatório"

#### Teste 1.3: Data vazia
- [ ] Abrir formulário de novo agendamento
- [ ] Preencher paciente e procedimento
- [ ] Limpar o campo de data
- [ ] Clicar em "Agendar"
- **✓ Esperado**: Toast amarelo "Data obrigatória"

---

### 2. Validações de Data/Hora

#### Teste 2.1: Data no passado
- [ ] Abrir formulário de novo agendamento
- [ ] Preencher todos os campos
- [ ] Selecionar data de **ontem**
- [ ] Horário: **10:00**
- [ ] Clicar em "Agendar"
- **✓ Esperado**: Toast amarelo "Data/hora no passado"

#### Teste 2.2: Data muito distante
- [ ] Abrir formulário de novo agendamento
- [ ] Preencher todos os campos
- [ ] Selecionar data de **2 anos no futuro**
- [ ] Clicar em "Agendar"
- **✓ Esperado**: Toast amarelo "Data muito distante"

---

### 3. Conflito de Horário

#### Teste 3.1: Criar conflito
- [ ] **Passo 1**: Criar agendamento para **hoje às 14:00** (60 min)
- [ ] **Passo 2**: Tentar criar outro para **mesmo profissional** às **14:30**
- [ ] Observar o warning vermelho no formulário
- [ ] Botão "Agendar" deve ficar desabilitado
- **✓ Esperado**: Warning visual + botão desabilitado

#### Teste 3.2: Forçar submissão com conflito
- [ ] Se conseguir forçar submit (improvável)
- **✓ Esperado**: Toast vermelho "Conflito de horário"

---

### 4. Operação Bem-Sucedida

#### Teste 4.1: Criar agendamento válido
- [ ] Abrir formulário de novo agendamento
- [ ] Selecionar paciente: **Maria Silva**
- [ ] Selecionar procedimento: **Limpeza de Pele**
- [ ] Data: **amanhã**
- [ ] Horário: **15:00**
- [ ] Profissional: **qualquer ativo**
- [ ] Clicar em "Agendar"
- **✓ Esperado**: 
  - Toast verde "Agendamento criado!"
  - Modal fecha automaticamente
  - Lista de agendamentos recarrega
  - Novo agendamento aparece na lista

---

### 5. Erros de Integridade (Simulados)

> **Nota**: Estes testes requerem manipulação manual do banco de dados ou código para simular.

#### Teste 5.1: Paciente inexistente
- [ ] No console do navegador:
  ```javascript
  // Modificar temporariamente o ID do paciente para UUID inexistente
  ```
- [ ] Tentar criar agendamento
- **✓ Esperado**: Toast vermelho "Paciente não encontrado"

#### Teste 5.2: RLS Policy violation (usuário comum)
- [ ] Logar como usuário **comum** (não super_admin)
- [ ] Tentar agendar para **outro profissional**
- **✓ Esperado**: Toast vermelho "Permissão negada"

---

### 6. Erros de Rede

#### Teste 6.1: Sem internet
- [ ] Abrir DevTools (F12)
- [ ] Aba **Network** → marcar **Offline**
- [ ] Tentar criar agendamento
- **✓ Esperado**: Toast vermelho "Erro de conexão"

#### Teste 6.2: Timeout (opcional)
- [ ] Throttling de rede para **Slow 3G**
- [ ] Tentar criar agendamento
- **✓ Esperado**: Carregamento longo, possível timeout

---

### 7. Interação com Toast

#### Teste 7.1: Auto-dismiss
- [ ] Criar qualquer erro de validação
- [ ] Observar o toast aparecer
- [ ] **NÃO** clicar no X
- [ ] Aguardar **5 segundos**
- **✓ Esperado**: Toast desaparece automaticamente

#### Teste 7.2: Fechar manual
- [ ] Criar qualquer erro de validação
- [ ] Clicar no **X** do toast
- **✓ Esperado**: Toast fecha imediatamente

#### Teste 7.3: Múltiplos toasts (opcional)
- [ ] Criar erro rapidamente
- [ ] Antes de fechar, criar outro erro
- **✓ Esperado**: Apenas 1 toast visível (mais recente)

---

### 8. Responsividade Mobile

#### Teste 8.1: Toast em mobile
- [ ] Abrir DevTools (F12)
- [ ] Toggle device toolbar (Ctrl+Shift+M)
- [ ] Selecionar **iPhone 12 Pro**
- [ ] Criar erro de validação
- **✓ Esperado**: 
  - Toast ocupa largura correta (com margins)
  - Texto legível (16px mínimo)
  - Botão X com tamanho touch (48px)

---

### 9. Estados do Formulário

#### Teste 9.1: Loading state
- [ ] Preencher formulário válido
- [ ] Clicar em "Agendar"
- [ ] Observar rapidamente antes de completar
- **✓ Esperado**:
  - Botão desabilitado
  - Spinner visível
  - Texto "Salvando..."

#### Teste 9.2: Campos preservados após erro
- [ ] Preencher formulário com data inválida
- [ ] Clicar em "Agendar"
- [ ] Receber erro
- **✓ Esperado**: Todos os campos permanecem preenchidos

---

## 📊 Resultados do Teste

Preencha após executar os testes:

| Categoria | Testes OK | Testes Falhos | Observações |
|-----------|-----------|---------------|-------------|
| 1. Campos obrigatórios | ___ / 3 | ___ | |
| 2. Data/Hora | ___ / 2 | ___ | |
| 3. Conflito | ___ / 2 | ___ | |
| 4. Sucesso | ___ / 1 | ___ | |
| 5. Integridade | ___ / 2 | ___ | |
| 6. Rede | ___ / 2 | ___ | |
| 7. Toast | ___ / 3 | ___ | |
| 8. Mobile | ___ / 1 | ___ | |
| 9. Estados | ___ / 2 | ___ | |
| **TOTAL** | **___ / 18** | **___** | |

---

## 🐛 Bugs Encontrados

Se encontrar algum problema, documente aqui:

### Bug #1
- **Categoria**: _____
- **Passos para reproduzir**: _____
- **Comportamento esperado**: _____
- **Comportamento observado**: _____
- **Print/Log**: _____

---

## ✅ Aprovação

- [ ] Todos os testes críticos passaram (1-4, 7, 9)
- [ ] Toast funciona corretamente em desktop
- [ ] Toast funciona corretamente em mobile
- [ ] Mensagens de erro são claras e amigáveis
- [ ] Não há erros no console do navegador
- [ ] Build passa sem warnings/errors

**Testado por**: _____________  
**Data**: _____________  
**Status**: ⬜ Aprovado | ⬜ Aprovado com ressalvas | ⬜ Reprovado  

---

## 🚀 Comandos Úteis

### Resetar banco de dados (para testes)
```bash
cd supabase
supabase db reset
```

### Popular dados de teste
```bash
psql $DATABASE_URL < seed.sql
```

### Verificar logs do Supabase
```bash
supabase functions logs
```

### Build local
```bash
npm run build
```

### Rodar em dev
```bash
npm run dev
```

---

## 📝 Notas Adicionais

- Após passar todos os testes, considere adicionar testes automatizados (Jest, Vitest)
- Para testes E2E, considere usar Playwright ou Cypress
- Monitore logs de erro em produção (Sentry, LogRocket)
