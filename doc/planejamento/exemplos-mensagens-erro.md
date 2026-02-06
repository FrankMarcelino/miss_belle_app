# 💬 Exemplos de Mensagens de Erro

**Data**: 06/02/2026  
**Componente**: Toast + Sistema de Validação  

---

## 🎨 Como os Toasts Aparecem

### Toast de Sucesso (Verde) 🟢

```
┌────────────────────────────────────────────────────────┐
│ ✅ Agendamento criado!                             ✕  │
│ O agendamento foi salvo com sucesso.                   │
└────────────────────────────────────────────────────────┘
```

**Quando aparece**: Após criar agendamento com sucesso  
**Cor**: Verde claro  
**Ícone**: CheckCircle  
**Auto-dismiss**: 5 segundos  

---

### Toast de Erro (Vermelho) 🔴

```
┌────────────────────────────────────────────────────────┐
│ ❌ Erro de conexão                                 ✕  │
│ Verifique sua internet e tente novamente.             │
└────────────────────────────────────────────────────────┘
```

**Quando aparece**: Erros críticos (network, RLS, FK)  
**Cor**: Vermelho claro  
**Ícone**: XCircle  
**Auto-dismiss**: 5 segundos  

---

### Toast de Aviso (Amarelo) 🟡

```
┌────────────────────────────────────────────────────────┐
│ ⚠️  Paciente obrigatório                           ✕  │
│ Selecione ou cadastre um paciente.                    │
└────────────────────────────────────────────────────────┘
```

**Quando aparece**: Validações client-side  
**Cor**: Amarelo claro  
**Ícone**: AlertTriangle  
**Auto-dismiss**: 5 segundos  

---

### Toast de Info (Azul) 🔵

```
┌────────────────────────────────────────────────────────┐
│ ℹ️  Dados salvos localmente                        ✕  │
│ Será sincronizado quando houver conexão.              │
└────────────────────────────────────────────────────────┘
```

**Quando aparece**: Informações gerais (futuro)  
**Cor**: Azul claro  
**Ícone**: Info  
**Auto-dismiss**: 5 segundos  

---

## 📱 Exemplos de Fluxos Completos

### Fluxo 1: Usuário Esquece de Preencher Paciente

#### Ação do Usuário
1. Abrir formulário de agendamento
2. Selecionar procedimento: "Limpeza de Pele"
3. Preencher data: "2026-02-10"
4. Preencher horário: "14:00"
5. **NÃO** selecionar paciente
6. Clicar em "Agendar"

#### Resposta do Sistema
```
┌────────────────────────────────────────────────────────┐
│ ⚠️  Paciente obrigatório                           ✕  │
│ Selecione ou cadastre um paciente.                    │
└────────────────────────────────────────────────────────┘
```

**Comportamento**:
- ❌ Modal **NÃO** fecha
- ❌ Agendamento **NÃO** é criado
- ✅ Campos permanecem preenchidos
- ✅ Toast desaparece em 5 segundos
- ✅ Usuário pode corrigir e tentar novamente

---

### Fluxo 2: Usuário Tenta Agendar no Passado

#### Ação do Usuário
1. Preencher formulário completo
2. Selecionar data: "2026-02-05" (ontem)
3. Horário: "10:00"
4. Clicar em "Agendar"

#### Resposta do Sistema
```
┌────────────────────────────────────────────────────────┐
│ ⚠️  Data/hora no passado                           ✕  │
│ O agendamento não pode ser feito para uma data/hora   │
│ anterior.                                              │
└────────────────────────────────────────────────────────┘
```

**Comportamento**:
- ❌ Modal **NÃO** fecha
- ❌ Agendamento **NÃO** é criado
- ✅ Campos permanecem preenchidos
- ✅ Usuário vê o erro claramente
- ✅ Pode corrigir a data e tentar novamente

---

### Fluxo 3: Conflito de Horário

#### Ação do Usuário
1. Já existe agendamento: **Maria Silva, 14:00, 60 min**
2. Tentar agendar: **João Santos, 14:30, 60 min** (mesmo profissional)
3. Preencher formulário
4. Observar o formulário enquanto preenche

#### Resposta do Sistema

**Durante preenchimento** (em tempo real):
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  Conflito de horário!                                │
│ Já existe um agendamento para este profissional neste  │
│ horário.                                                │
└─────────────────────────────────────────────────────────┘
```
↓ Aparece no formulário (não é toast)

**Botão "Agendar"**: **DESABILITADO** (cinza, sem hover)

**Se tentar submeter** (improvável):
```
┌────────────────────────────────────────────────────────┐
│ ❌ Conflito de horário                             ✕  │
│ Já existe um agendamento para este profissional neste │
│ horário.                                               │
└────────────────────────────────────────────────────────┘
```

---

### Fluxo 4: Sem Conexão com Internet

#### Ação do Usuário
1. Preencher formulário válido
2. Wifi/4G desconectado
3. Clicar em "Agendar"

#### Resposta do Sistema

**Botão muda para**:
```
[🔄 Salvando...]  ← spinner girando
```

**Após timeout** (alguns segundos):
```
┌────────────────────────────────────────────────────────┐
│ ❌ Erro de conexão                                 ✕  │
│ Verifique sua internet e tente novamente.             │
└────────────────────────────────────────────────────────┘
```

**Comportamento**:
- ❌ Modal **NÃO** fecha
- ❌ Agendamento **NÃO** é criado
- ✅ Campos permanecem preenchidos
- ✅ Botão volta ao estado normal
- ✅ Usuário pode reconectar e tentar novamente

---

### Fluxo 5: Usuário Comum Tenta Agendar para Outro Profissional

#### Ação do Usuário
1. Logar como **usuário comum** (não super_admin)
2. Tentar criar agendamento
3. No formulário, selecionar **outro profissional** (não ele mesmo)
4. Clicar em "Agendar"

#### Resposta do Sistema
```
┌────────────────────────────────────────────────────────┐
│ ❌ Permissão negada                                ✕  │
│ Você não tem permissão para realizar esta ação.       │
└────────────────────────────────────────────────────────┘
```

**Comportamento**:
- ❌ Agendamento **NÃO** é criado
- ✅ Mensagem clara sobre falta de permissão
- ✅ RLS policy funcionando corretamente

---

### Fluxo 6: Sucesso Completo ✅

#### Ação do Usuário
1. Preencher formulário válido:
   - Paciente: **Maria Silva**
   - Procedimento: **Limpeza de Pele**
   - Data: **2026-02-10**
   - Horário: **14:00**
   - Profissional: **Dr. João**
2. Sem conflitos
3. Clicar em "Agendar"

#### Resposta do Sistema

**Botão durante salvamento**:
```
[🔄 Salvando...]  ← 1-2 segundos
```

**Toast de sucesso**:
```
┌────────────────────────────────────────────────────────┐
│ ✅ Agendamento criado!                             ✕  │
│ O agendamento foi salvo com sucesso.                   │
└────────────────────────────────────────────────────────┘
```

**Comportamento**:
- ✅ Modal **FECHA** automaticamente
- ✅ Lista de agendamentos **RECARREGA**
- ✅ Novo agendamento **APARECE** na lista
- ✅ Toast desaparece em 5 segundos
- ✅ Experiência fluida e satisfatória

---

## 🎬 Animações

### Toast Entrada (Slide Down)
```
Tempo: 0ms     →  Tempo: 300ms
─────────────────────────────────
┌─ Toast ─┐      ┌─ Toast ─┐
│         │ ↓    │         │
└─────────┘      └─────────┘
(invisível)      (visível)
```

**Efeito**: Desliza suavemente de cima para baixo  
**Duração**: 300ms  
**Easing**: ease-out  

### Toast Saída (Fade Out)
```
Tempo: 0ms     →  Tempo: 200ms
─────────────────────────────────
┌─ Toast ─┐      
│ Opaco   │       (invisível)
└─────────┘      
```

**Efeito**: Desaparece gradualmente  
**Duração**: 200ms  
**Easing**: ease-in  

---

## 📏 Especificações de Design

### Desktop (> 768px)

```
┌──────────────────────────────────────┐
│                    ┌─ Toast (384px) ─┐
│                    │ Título           │
│                    │ Descrição        │
│                    └──────────────────┘
│      Conteúdo      ← 16px de margem
│
└──────────────────────────────────────┘
```

**Posição**: Top-right  
**Largura**: 384px (fixo)  
**Margem**: 16px do topo e direita  
**Z-index**: 100  

### Mobile (≤ 768px)

```
┌──────────────────────────────────────┐
│  ┌─── Toast (calc(100% - 32px)) ───┐ │
│  │ Título                           │ │
│  │ Descrição                        │ │
│  └──────────────────────────────────┘ │
│  ← 16px →                     ← 16px →│
│                                        │
│        Conteúdo                        │
└──────────────────────────────────────┘
```

**Posição**: Top-center  
**Largura**: `calc(100% - 32px)` (responsivo)  
**Margem**: 16px em todos os lados  
**Z-index**: 100  

---

## 🔤 Tipografia

| Elemento | Tamanho | Peso | Cor |
|----------|---------|------|-----|
| **Título** | 14px | 600 (Semibold) | Depende do tipo |
| **Descrição** | 12px | 400 (Regular) | Depende do tipo (90% opacity) |
| **Botão X** | 16px | 400 | Depende do tipo |

---

## 🎨 Cores por Tipo

### Success (Verde)
- **Background**: `#F0FDF4` (green-50)
- **Border**: `#BBF7D0` (green-200)
- **Text**: `#166534` (green-800)
- **Icon**: `#16A34A` (green-600)

### Error (Vermelho)
- **Background**: `#FEF2F2` (red-50)
- **Border**: `#FECACA` (red-200)
- **Text**: `#991B1B` (red-800)
- **Icon**: `#DC2626` (red-600)

### Warning (Amarelo)
- **Background**: `#FEFCE8` (yellow-50)
- **Border**: `#FEF08A` (yellow-200)
- **Text**: `#854D0E` (yellow-800)
- **Icon**: `#CA8A04` (yellow-600)

### Info (Azul)
- **Background**: `#EFF6FF` (blue-50)
- **Border**: `#BFDBFE` (blue-200)
- **Text**: `#1E40AF` (blue-800)
- **Icon**: `#2563EB` (blue-600)

---

## ♿ Acessibilidade

### ARIA Labels
```html
<button aria-label="Fechar notificação">
  <X className="w-4 h-4" />
</button>
```

### Contraste
- ✅ Título: Ratio 7:1 (AAA)
- ✅ Descrição: Ratio 4.5:1 (AA)
- ✅ Ícone: Ratio 4.5:1 (AA)

### Tamanhos Touch (Mobile)
- ✅ Botão X: 44x44px mínimo
- ✅ Toast: Altura mínima 64px
- ✅ Padding interno: 16px

### Navegação por Teclado
- ✅ `Tab`: Foca no botão X
- ✅ `Enter` ou `Space`: Fecha o toast
- ✅ `Escape`: Fecha o toast (futuro)

---

## 📋 Checklist de QA

### Visual
- [ ] Toast aparece na posição correta (desktop/mobile)
- [ ] Animação suave (slide-down)
- [ ] Cores corretas por tipo
- [ ] Ícone apropriado
- [ ] Texto legível e alinhado

### Funcional
- [ ] Auto-dismiss após 5 segundos
- [ ] Botão X fecha imediatamente
- [ ] Múltiplos toasts não se sobrepõem
- [ ] Toast não bloqueia interação com página

### Responsivo
- [ ] Largura correta em desktop (384px)
- [ ] Largura correta em mobile (100% - 32px)
- [ ] Margem safe-area em devices com notch
- [ ] Texto quebra corretamente

### Acessibilidade
- [ ] ARIA label no botão de fechar
- [ ] Navegação por teclado funciona
- [ ] Contraste adequado (WCAG AA)
- [ ] Touch targets ≥ 44px

---

## 🧩 Integração com Outros Componentes

O Toast pode ser usado em qualquer componente:

```typescript
import Toast, { useToast } from '../components/Toast';

function MeuComponente() {
  const { showToast, ToastComponent } = useToast();

  const handleAction = async () => {
    try {
      // ... operação ...
      showToast('success', 'Tudo certo!', 'Operação concluída.');
    } catch (error) {
      showToast('error', 'Ops!', 'Algo deu errado.');
    }
  };

  return (
    <>
      {/* ... conteúdo ... */}
      {ToastComponent}
    </>
  );
}
```

---

**Fim dos Exemplos** ✅
