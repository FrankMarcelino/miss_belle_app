---
name: UI/UX Mobile Agenda
overview: Otimizar a tela de Agenda para uso mobile (touch-first), simplificando navegação, melhorando formulários e reduzindo steps, mantendo a paleta champagne/rose gold atual.
todos:
  - id: bottom-nav
    content: Criar componente BottomNav mobile-only com ícones grandes e integrar em Layout.tsx
    status: pending
  - id: bottom-sheet
    content: Criar componente BottomSheet reutilizável (slide-up) para substituir modais em mobile
    status: pending
  - id: patient-autocomplete
    content: "Criar campo dinâmico de paciente: busca em tempo real, opção criar novo inline se não encontrar"
    status: pending
  - id: agenda-cards-touch
    content: Aumentar tamanho dos cards de agendamento, melhorar espaçamento e touch targets (min 48px)
    status: pending
  - id: quick-add-form
    content: "Refatorar formulário de criação: integrar patient autocomplete, grid visual de procedimentos, auto-save"
    status: pending
  - id: search-filters
    content: Adicionar busca sempre visível e filtros rápidos por status em chips horizontais
    status: pending
  - id: mobile-styles
    content: "Criar utilities CSS mobile-first: touch targets, espaçamento, texto legível (min 16px)"
    status: pending
  - id: rls-ui-validation
    content: "Validar que UI reflete RLS corretamente: super_admin vê tudo, user vê só seus dados"
    status: pending
isProject: false
---

# Otimização Mobile: Tela de Agenda

## Objetivo

Transformar a tela de Agenda em uma experiência mobile-first fluida, reduzindo fricção e steps, mantendo a identidade visual champagne/rose gold.

---

## 🔐 Regras de Permissão por Role

**Importante**: O RLS já está implementado no banco, mas a UI precisa refletir corretamente:

### Super Admin (`role = 'super_admin'`)

- ✅ Visualiza TODOS os agendamentos de TODOS os profissionais
- ✅ Pode filtrar por profissional específico
- ✅ Vê "Agenda Geral" com dropdown de profissional
- ✅ Acessa todos os fechamentos de caixa
- ✅ Pode gerenciar qualquer agendamento

### User (`role = 'user'`)

- ✅ Visualiza APENAS seus próprios agendamentos (`professional_id = auth.uid()`)
- ❌ NÃO vê dropdown de profissional (sempre fixo no seu ID)
- ✅ Vê "Minha Agenda" (título diferente)
- ✅ Acessa apenas seu próprio caixa
- ✅ Busca pacientes retorna apenas seus próprios pacientes

**Implementação UI**:

```tsx
const { isSuperAdmin } = useAuth();

// Título condicional
<h1>{isSuperAdmin ? 'Agenda Geral' : 'Minha Agenda'}</h1>

// Filtro de profissional apenas para admin
{isSuperAdmin && (
  <ProfessionalFilter onChange={setSelectedProfessional} />
)}

// Query de pacientes sempre filtrada por professional_id (RLS garante)
const { data } = await supabase
  .from('patients')
  .select('*')
  .ilike('full_name', `%${query}%`);
// RLS automático: users veem só seus pacientes
```

---

## Análise da UI Atual

**Problemas identificados** (baseado no código de `src/pages/Agenda.tsx`):

### 1. Navegação

- ❌ Menu lateral (sidebar) consome espaço vertical precioso no mobile
- ❌ Sem bottom navigation nativa para mobile
- ❌ Botões de navegação (Prev/Next/Hoje) ocupam muito espaço horizontal

### 2. Formulários

- ❌ Modal de criar agendamento tem 5+ campos em formulário vertical longo
- ❌ Campos de data/hora não otimizados para mobile keyboards
- ❌ Select dropdowns longos (pacientes, procedimentos) sem busca rápida
- ❌ Sem autocomplete ou sugestões

### 3. Fluxo (Muitos Steps)

- ❌ Criar agendamento: abrir modal → preencher 5 campos → salvar (3+ taps)
- ❌ Ver detalhes: clicar card → abrir modal → ler info (2 taps)
- ❌ Mudar status: abrir detalhes → clicar botão → confirmar (3 taps)

### 4. Touch Targets

- ❌ Cards de agendamento pequenos (difícil tocar)
- ❌ Botões de ação próximos demais (risco de erro)
- ❌ Toggle Dia/Semana com áreas de toque pequenas

---

## Soluções Propostas

### 🎯 1. Bottom Navigation (Mobile)

**Implementação**: 

- Adicionar `<BottomNav>` component que aparece apenas em telas < 768px
- Ícones grandes (48x48px) com labels
- Posição fixa no bottom
- Items: Dashboard, Agenda, Pacientes, Caixa

**Benefício**: Navegação com 1 thumb, padrão mobile nativo

---

### 🎯 2. Simplificar Criação de Agendamento

**Antes** (5 campos em 1 modal):

```
Modal Grande:
- Paciente (select dropdown longo)
- Procedimento (select dropdown longo)
- Profissional (select, se admin)
- Data (date picker)
- Horário (time picker)
[Cancelar] [Salvar]
```

**Depois** (Quick Add inteligente):

#### Campo de Paciente Dinâmico 🆕

**Requisito crítico**: ao invés de select dropdown, campo de texto com:

1. **Digitar nome** → busca em tempo real (debounce 300ms)
2. **Se encontrar pacientes**:
  ```
   [Ana Silva] (11) 98765-4321
   [Ana Paula] (11) 97654-3210
  ```
   → Tap para selecionar
3. **Se NÃO encontrar**:
  ```
   ❌ Nenhum paciente encontrado com "Ana Maria"

   [➕ Criar novo: Ana Maria]
   [➕ Adicionar cliente]
  ```
   → Tap abre mini-form inline (nome + telefone)
   → Salva paciente E continua fluxo

**Implementação**:

- Input text com `onChange` + debounce
- Query Supabase: `.ilike('full_name',` %${query}%`).limit(5)`
- Filtra por `professional_id` atual (RLS automático)
- Se vazio após busca, mostra opções de criar

#### Quick Add Flow Completo

1. **Tap botão "+"** ou horário vazio → bottom sheet
2. **Campo "Paciente"**: busca dinâmica (ver acima)
3. **Campo "Procedimento"**: grid visual de cards (não dropdown)
4. **Data/Hora**: pré-preenchidos (editar se necessário)
5. **Auto-save** ao selecionar procedimento (loading 0.5s)

**Redução de steps**: 6 taps → 2-3 taps ✅

---

### 🎯 3. Timeline Touch-Friendly

**Mudanças**:

- Cards de agendamento maiores (min-height: 64px)
- Espaçamento entre cards (gap: 8px)
- Swipe actions nos cards:
  - Swipe right → Confirmar
  - Swipe left → Cancelar
  - Tap → Ver detalhes
- Cores mais contrastantes para status (manter tons champagne mas mais saturados)

---

### 🎯 4. Controles de Data Otimizados

**Antes**: 

- 3 botões pequenos (Prev, Hoje, Next) + texto da data
- Toggle Dia/Semana com fundo

**Depois**:

- **Date Picker Horizontal**: swipe left/right para navegar dias
- Bolinha/dot no dia atual
- Botão "Hoje" grande (flutuante) só aparece quando não está no dia atual
- Toggle Dia/Semana como tabs maiores (full width)

---

### 🎯 5. Detalhes em Bottom Sheet (não Modal Central)

**Mobile pattern**: ao clicar card, abre bottom sheet (slide up) em vez de modal central

**Vantagens**:

- Mais nativo para mobile
- Permite ver contexto (agenda abaixo)
- Fecha com swipe down
- Menos "pesado" visualmente

---

### 🎯 6. Busca e Filtros Quick Access

**Implementação**:

- Barra de busca sempre visível (sticky top)
- Busca por: nome do paciente, procedimento
- Filtros rápidos em chips horizontais (scroll):
  - `[Todos] [Marcados] [Confirmados] [Realizados] [Cancelados]`
- 1 tap para filtrar

---

## Estrutura de Componentes

```
src/components/mobile/
├── BottomNav.tsx                 # Navegação inferior mobile
├── BottomSheet.tsx               # Modal estilo mobile (slide up)
├── PatientAutocomplete.tsx       # ⭐ Busca dinâmica + criar inline
├── QuickAppointmentAdd.tsx       # Criação rápida de agendamento
├── AppointmentCard.tsx           # Card otimizado para touch
├── SwipeableCard.tsx             # Wrapper com gestos swipe
└── HorizontalDatePicker.tsx      # Seletor de data horizontal
```

### Detalhes: PatientAutocomplete Component 🆕

**Props**:

```tsx
interface PatientAutocompleteProps {
  value: string | null;              // ID do paciente selecionado
  onChange: (patientId: string) => void;
  professionalId: string;            // Para filtrar pacientes
  placeholder?: string;
}
```

**Estado interno**:

```tsx
const [query, setQuery] = useState('');
const [results, setResults] = useState<Patient[]>([]);
const [loading, setLoading] = useState(false);
const [showCreateForm, setShowCreateForm] = useState(false);
```

**Fluxo**:

1. Usuário digita → `query` atualiza
2. Debounce 300ms → busca no Supabase
3. Se encontrar: mostra lista de pacientes
4. Se não encontrar: mostra botão "Criar novo: [nome digitado]"
5. Ao clicar criar: expande mini-form inline (nome + telefone)
6. Salva paciente → chama `onChange(newPatientId)`

**Query Supabase**:

```tsx
const searchPatients = async (searchQuery: string) => {
  const { data } = await supabase
    .from('patients')
    .select('id, full_name, phone')
    .ilike('full_name', `%${searchQuery}%`)
    .eq('professional_id', professionalId)
    .limit(5);
  return data;
};
```

**UI Mobile-Optimized**:

- Input grande (min-height: 48px)
- Resultados em cards toucháveis (min-height: 56px)
- Loading spinner durante busca
- Animação suave ao expandir create form

---

## Arquivos a Modificar

### Frontend

1. `**src/pages/Agenda.tsx**` (refatoração principal)
  - Extrair lógica de criação para `QuickAppointmentAdd`
  - Usar `BottomSheet` em vez de modal central
  - Integrar swipe gestures
  - Adicionar busca/filtros rápidos
2. `**src/components/Layout.tsx**`
  - Adicionar `<BottomNav>` condicional (mobile)
  - Ocultar sidebar em mobile
  - Ajustar padding para bottom nav
3. `**src/index.css` ou `tailwind.config.js**`
  - Adicionar utilities para touch targets (min 48x48px)
  - Helpers de swipe gestures
  - Breakpoints mobile-first

### Novas Bibliotecas (opcionais)

- `framer-motion` - animações suaves (swipe, slide)
- `react-use-gesture` - gestos touch
- OU implementar vanilla (sem deps extras)

---

## Mobile-First CSS Guidelines

```css
/* Touch targets mínimos */
.btn-touch {
  min-width: 48px;
  min-height: 48px;
  padding: 12px 16px;
}

/* Espaçamento confortável */
.card-mobile {
  padding: 16px;
  margin-bottom: 12px;
}

/* Texto legível */
.text-mobile-base {
  font-size: 16px; /* nunca < 16px para evitar zoom no iOS */
  line-height: 1.5;
}

/* Breakpoint mobile-first */
@media (min-width: 768px) {
  /* Desktop overrides */
}
```

---

## Cores Otimizadas (Mantendo Champagne/Rose)

**Manter paleta base**, mas ajustar contraste para mobile:

```js
// Cores atuais (manter)
champagne-nuvem: '#F5F1E8'
accent: '#D4AF87'
primary: '#B8956A'

// Adicionar variantes mais saturadas para status
primary-vibrant: '#A67C52'    // para botões ativos
accent-bright: '#C4954C'      // para highlights
success-rose: '#B8956A'       // para "completed" (tom mais quente)
```

---

## Fluxo Otimizado: Criar Agendamento

**Antes** (5 taps):

1. Tap "Novo Agendamento"
2. Select paciente
3. Select procedimento
4. Input data
5. Input hora
6. Tap "Salvar"

**Depois** (2-3 taps):

1. Tap horário vazio na timeline → bottom sheet abre
2. Busca rápida paciente (2-3 caracteres) + tap
3. Tap procedimento (grid visual)

→ Auto-salva (loading spinner 0.5s)

**Redução**: 5-6 taps → 2-3 taps ✅

---

## Testes de Validação (Mobile)

Após implementação, validar em dispositivo real:

### Usabilidade

- Todos os botões têm min 48x48px
- Cards têm espaçamento confortável (gap 8-12px)
- Texto legível sem zoom (min 16px)
- Swipe gestures respondem suavemente
- Bottom nav acessível com 1 thumb

### Performance

- Scroll fluido a 60fps
- Animações não travam
- Bottom sheet abre/fecha < 200ms

### Acessibilidade

- Contraste adequado (WCAG AA)
- Touch targets não sobrepostos
- Navegação com teclado funciona

---

## Implementação Incremental

### Fase 1 (MVP Mobile) - ~3-4h

- ✅ Bottom Navigation component
- ✅ Cards maiores com melhor espaçamento
- ✅ Bottom Sheet para detalhes
- ✅ Busca rápida no topo

### Fase 2 (Polish) - ~2-3h

- ✅ Swipe gestures nos cards
- ✅ Quick Add otimizado
- ✅ Date picker horizontal
- ✅ Filtros rápidos em chips

### Fase 3 (Nice-to-have) - ~2h

- ✅ Animações polish (framer-motion)
- ✅ Haptic feedback (vibração)
- ✅ Pull-to-refresh
- ✅ Offline indicators

---

## Arquitetura de Responsividade

```
Breakpoints:
- mobile: < 768px (touch-first, bottom nav, cards grandes)
- tablet: 768px - 1024px (híbrido)
- desktop: > 1024px (sidebar, mouse-first)

Approach: Mobile-first
- CSS base para mobile
- @media queries para desktop overrides
- Componentes condicionais: {isMobile ? <BottomNav /> : <Sidebar />}
```

