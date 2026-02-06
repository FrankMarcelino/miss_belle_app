# Sistema de Tratamento de Erros - Criação de Agendamento

**Data**: 06/02/2026  
**Autor**: Assistente AI  
**Status**: ✅ Implementado

---

## 📋 Visão Geral

Implementação de um **sistema robusto de tratamento de erros** para criação de agendamentos, focado em:

1. **Validação client-side** antes de submeter ao servidor
2. **Mensagens específicas e amigáveis** para cada tipo de erro
3. **Feedback visual imediato** com componente Toast
4. **Experiência mobile-first** com UX otimizada

---

## 🎯 Objetivos Alcançados

### 1. Validações Client-Side

✅ **Campos obrigatórios**
- Paciente
- Procedimento
- Profissional
- Data
- Horário

✅ **Validações lógicas**
- Data/hora não pode estar no passado (tolerância de 5 minutos)
- Data/hora não pode ser superior a 1 ano no futuro
- Verificação de conflito de horários em tempo real

### 2. Tratamento de Erros do Supabase/PostgreSQL

✅ **Erros de integridade de dados**
- `23503` - Foreign Key Violation (referência inválida)
- `23505` - Unique Constraint (registro duplicado)
- `23514` - Check Constraint (valor não permitido)
- `23502` - Not Null Violation (campo obrigatório)

✅ **Erros de permissão**
- `42501` - RLS Policy Violation (sem permissão)

✅ **Erros de rede/infraestrutura**
- `TypeError` - Network/Fetch errors (sem internet)
- `57014` - Timeout (operação demorou muito)

### 3. Componentes Criados

#### **Toast Component** (`src/components/Toast.tsx`)

Componente reutilizável para feedback visual com 4 tipos:

- **Success** 🟢 - Operação bem-sucedida
- **Error** 🔴 - Erro crítico
- **Warning** 🟡 - Alerta (validação client-side)
- **Info** 🔵 - Informação

**Características**:
- Auto-dismiss após 5 segundos (configurável)
- Animação slide-down suave
- Design responsivo (mobile-first)
- Botão de fechar manual
- Título + descrição opcional

#### **Error Handling Utils** (`src/lib/errorHandling.ts`)

Funções utilitárias para tratamento de erros:

##### `parseSupabaseError(error: unknown): AppError`

Analisa erros do Supabase/PostgreSQL e retorna mensagem amigável.

**Exemplo de uso**:
```typescript
try {
  const { error } = await supabase.from('appointments').insert(data);
  if (error) throw error;
} catch (error) {
  const appError = parseSupabaseError(error);
  showToast(appError.type, appError.title, appError.description);
}
```

##### `validateAppointmentData(data): AppointmentValidation`

Valida dados de agendamento antes de submeter.

**Retorna**:
```typescript
{
  isValid: boolean,
  errors: Array<{ title: string, description?: string, type: 'warning' | 'error' }>
}
```

---

## 🧪 Cenários de Teste

### 1. Validações Client-Side

| Cenário | Ação | Resultado Esperado |
|---------|------|-------------------|
| **Campos vazios** | Tentar agendar sem preencher campos | Toast amarelo: "Campo obrigatório" |
| **Data no passado** | Selecionar data/hora anterior | Toast amarelo: "Data/hora no passado" |
| **Data muito distante** | Selecionar data > 1 ano futuro | Toast amarelo: "Data muito distante" |
| **Conflito de horário** | Criar agendamento em horário ocupado | Toast vermelho: "Conflito de horário" |

### 2. Erros de Integridade

| Cenário | Ação | Resultado Esperado |
|---------|------|-------------------|
| **Paciente inválido** | ID de paciente não existe | Toast vermelho: "Paciente não encontrado" |
| **Procedimento inválido** | ID de procedimento não existe | Toast vermelho: "Procedimento não encontrado" |
| **Status inválido** | Status fora dos permitidos | Toast vermelho: "Status inválido" |

### 3. Erros de Permissão

| Cenário | Ação | Resultado Esperado |
|---------|------|-------------------|
| **RLS Policy** | User comum tenta agendar para outro profissional | Toast vermelho: "Permissão negada" |

### 4. Erros de Rede

| Cenário | Ação | Resultado Esperado |
|---------|------|-------------------|
| **Sem internet** | Criar agendamento offline | Toast vermelho: "Erro de conexão" |
| **Timeout** | Operação demora muito | Toast vermelho: "Operação demorou muito" |

### 5. Sucesso

| Cenário | Ação | Resultado Esperado |
|---------|------|-------------------|
| **Agendamento criado** | Todos os dados válidos | Toast verde: "Agendamento criado!" + modal fecha + lista atualiza |

---

## 📝 Mensagens de Erro

### Validações Client-Side (⚠️ Warning)

| Código | Título | Descrição |
|--------|--------|-----------|
| `PATIENT_REQUIRED` | Paciente obrigatório | Selecione ou cadastre um paciente. |
| `PROCEDURE_REQUIRED` | Procedimento obrigatório | Selecione o procedimento a ser realizado. |
| `PROFESSIONAL_REQUIRED` | Profissional obrigatório | Selecione o profissional responsável. |
| `DATE_REQUIRED` | Data obrigatória | Informe a data do agendamento. |
| `TIME_REQUIRED` | Horário obrigatório | Informe o horário do agendamento. |
| `DATE_IN_PAST` | Data/hora no passado | O agendamento não pode ser feito para uma data/hora anterior. |
| `DATE_TOO_FAR` | Data muito distante | Agendamentos só podem ser feitos para até 1 ano à frente. |
| `TIME_CONFLICT` | Conflito de horário | Já existe um agendamento para este profissional neste horário. |

### Erros de Integridade (🔴 Error)

| Código Postgres | Título | Descrição |
|-----------------|--------|-----------|
| `23503` (FK patient_id) | Paciente não encontrado | Selecione um paciente válido da lista. |
| `23503` (FK procedure_id) | Procedimento não encontrado | Selecione um procedimento válido. |
| `23503` (FK professional_id) | Profissional não encontrado | Selecione um profissional válido. |
| `23503` (genérico) | Dados inválidos | Um dos campos possui referência inválida. |
| `23505` | Registro duplicado | Já existe um registro com esses dados. |
| `23514` (status) | Status inválido | O status selecionado não é permitido. |
| `23514` (genérico) | Dados inválidos | Um dos campos contém valor não permitido. |
| `23502` | Campos obrigatórios | Preencha todos os campos obrigatórios. |

### Erros de Permissão (🔴 Error)

| Código Postgres | Título | Descrição |
|-----------------|--------|-----------|
| `42501` | Permissão negada | Você não tem permissão para realizar esta ação. |

### Erros de Rede (🔴 Error)

| Tipo | Título | Descrição |
|------|--------|-----------|
| `TypeError` (fetch) | Erro de conexão | Verifique sua internet e tente novamente. |
| `57014` | Operação demorou muito | Tente novamente em alguns instantes. |

### Erros Genéricos (🔴 Error)

| Tipo | Título | Descrição |
|------|--------|-----------|
| `Error` | Erro inesperado | [mensagem do erro] |
| `Unknown` | Erro desconhecido | Ocorreu um erro inesperado. Tente novamente. |

---

## 🎨 UX/UI

### Toast Design

```
┌──────────────────────────────────────────┐
│ 🟢 Agendamento criado!                 × │
│ O agendamento foi salvo com sucesso.     │
└──────────────────────────────────────────┘
```

**Características**:
- Posição: Top-right (desktop), Top-center (mobile)
- Largura: 384px (desktop), Full-width com margin (mobile)
- Animação: Slide-down (300ms ease-out)
- Z-index: 100 (acima de modais)
- Auto-dismiss: 5 segundos

### Estados do Formulário

#### **1. Campos Vazios**
- Botão "Agendar" desabilitado
- Campos obrigatórios marcados com *

#### **2. Validação em Tempo Real**
- Conflito de horário verificado automaticamente
- Warning visual em vermelho se houver conflito

#### **3. Durante Submissão**
- Botão desabilitado
- Spinner de loading
- Texto: "Salvando..."

#### **4. Após Erro**
- Toast com mensagem específica
- Foco retorna ao formulário
- Campos permanecem preenchidos

#### **5. Após Sucesso**
- Toast verde de sucesso
- Modal fecha automaticamente
- Lista de agendamentos recarrega

---

## 🔧 Arquivos Modificados

### Novos Arquivos

1. **`src/components/Toast.tsx`**
   - Componente Toast reutilizável
   - Hook `useToast()` para gerenciar estado

2. **`src/lib/errorHandling.ts`**
   - `parseSupabaseError()` - Parser de erros
   - `validateAppointmentData()` - Validação client-side
   - Interface `AppError`

3. **`src/index.css`**
   - Animação `@keyframes slide-down`
   - Classe `.animate-slide-down`

### Arquivos Modificados

1. **`src/pages/Agenda.tsx`**
   - Importação de `Toast` e `useToast`
   - Importação de funções de validação/parsing
   - Adição de `showToast` no componente principal
   - Prop `showToast` passada para `CreateAppointmentForm`
   - Renderização de `{ToastComponent}` no JSX
   - Refatoração de `handleSubmit()`:
     - Validação client-side antes de submeter
     - Parsing de erros Supabase
     - Toasts específicos para cada cenário

---

## 🚀 Como Usar em Outros Componentes

### 1. Importar dependências

```typescript
import Toast, { useToast } from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';
```

### 2. Adicionar hook no componente

```typescript
export default function MeuComponente() {
  const { showToast, ToastComponent } = useToast();
  
  // ... resto do código
  
  return (
    <div>
      {/* ... conteúdo ... */}
      {ToastComponent}
    </div>
  );
}
```

### 3. Usar em operações async

```typescript
async function minhaOperacao() {
  try {
    const { error } = await supabase.from('table').insert(data);
    if (error) throw error;
    
    showToast('success', 'Operação bem-sucedida!');
  } catch (error) {
    const appError = parseSupabaseError(error);
    showToast(appError.type, appError.title, appError.description);
  }
}
```

### 4. Validações personalizadas

```typescript
if (!campo1) {
  showToast('warning', 'Campo obrigatório', 'Preencha o campo 1.');
  return;
}

if (valor < 0) {
  showToast('error', 'Valor inválido', 'O valor deve ser positivo.');
  return;
}
```

---

## 📊 Métricas de Qualidade

### Antes da Implementação

❌ Mensagens genéricas do Supabase  
❌ Sem validação client-side  
❌ Feedback visual limitado (texto vermelho)  
❌ Experiência confusa para usuário  

### Depois da Implementação

✅ Mensagens específicas e amigáveis  
✅ Validação completa antes de submeter  
✅ Toast com design profissional  
✅ Feedback imediato e claro  
✅ Redução de erros de servidor  
✅ Melhor experiência do usuário  

---

## 🎯 Próximos Passos (Sugestões)

### Curto Prazo
1. Aplicar mesmo sistema em outros CRUDs:
   - Pacientes
   - Procedimentos
   - Usuários
   - Caixa

2. Adicionar logging de erros:
   - Sentry, LogRocket ou similar
   - Captura de stack traces
   - Analytics de erros

### Médio Prazo
3. Validações async específicas:
   - CPF/CNPJ do paciente
   - E-mail duplicado
   - Telefone válido

4. Retry automático:
   - Para erros de rede
   - Com backoff exponencial
   - Limite de tentativas

### Longo Prazo
5. Modo offline:
   - Queue de operações pendentes
   - Sync quando voltar online
   - Feedback visual do estado

6. Testes automatizados:
   - Unit tests das funções de validação
   - Integration tests dos fluxos de erro
   - E2E tests com Playwright

---

## 📚 Referências

- [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)
- [Supabase Error Handling](https://supabase.com/docs/guides/api/errors)
- [Material Design - Snackbars](https://m3.material.io/components/snackbar/overview)
- [Nielsen Norman Group - Error Messages](https://www.nngroup.com/articles/error-message-guidelines/)

---

**Changelog**:
- 2026-02-06: Implementação inicial do sistema de tratamento de erros
