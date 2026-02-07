# 🔐 Planejamento: Melhoria na Gestão de Usuários - Miss Belle App

**Data**: 06/02/2026  
**Status**: 📋 Planejamento  
**Prioridade**: 🔴 ALTA (Segurança primeiro)

---

## 📊 Resumo Executivo

Melhorar o sistema de gerenciamento de usuários com foco em **segurança**, **UX** e **mobile-first**, seguindo a mesma qualidade das implementações anteriores (Agenda, Caixa, Tratamento de Erros).

### 🎯 Objetivos Principais

1. **Segurança**: Apenas super_admin acessa gestão de usuários
2. **UX**: Informações detalhadas, filtros, Toast notifications
3. **Admin Tools**: Reset de senha, validação de dependências
4. **Mobile**: Interface responsiva com cards
5. **Gestão de Procedimentos**: Associar procedimentos ao criar/editar usuário

---

## 🔍 Análise do Estado Atual

### ✅ Funcionalidades Existentes

**Arquivo**: `src/pages/Users.tsx`

- ✅ Listagem de usuários com busca
- ✅ Criar usuário (nome, email, senha, perfil)
- ✅ Editar usuário (nome, email, perfil, status)
- ✅ Ativar/Desativar usuário
- ✅ Deletar usuário
- ✅ Badges visuais (perfil + status)

### ❌ Problemas Identificados

#### 1. **Segurança & Permissões** (CRÍTICO)
```tsx
// ❌ PROBLEMA: Qualquer usuário pode acessar /users
// Não há proteção de rota no componente Users.tsx
```

- Não valida se é super_admin antes de mostrar conteúdo
- User comum consegue ver lista de usuários
- Não há RLS policies específicas para `profiles`
- Super_admin pode se deletar (bug grave)

#### 2. **Criação de Usuários** (CRÍTICO)
```tsx
// ❌ PROBLEMA: Usa signUp normal
await supabase.auth.signUp({ email, password })
```

- Envia email de confirmação indesejado
- Não é a forma correta de criar usuários administrativamente
- Deveria usar Admin API

#### 3. **UX & Feedback**
```tsx
// ❌ PROBLEMA: Erros genéricos
alert('Erro ao alterar status do usuário');
```

- Usa `alert()` em vez de Toast
- Sem feedback visual ao criar/editar com sucesso
- Não mostra estatísticas do usuário
- Sem filtros (status, perfil)

#### 4. **Informações Incompletas**
- Não mostra nº de agendamentos do profissional
- Não mostra nº de procedimentos associados
- Não mostra data de criação formatada
- Não valida dependências antes de deletar

#### 5. **Mobile & Responsividade**
- Tabela não é responsiva
- Modal ocupa muito espaço em mobile
- Ações muito juntas em telas pequenas

---

## 🎯 Requisitos Definidos pelo Cliente

### 1. **Acesso & Permissões**
- ✅ **Super Admin**: CRUD completo de usuários
- ✅ **User comum**: Empty state "Página em desenvolvimento"
- ✅ Apenas super_admin pode criar novos usuários
- ✅ Sem signup público (removido)

### 2. **Funcionalidades Admin**
- ✅ Super admin pode resetar senha de qualquer usuário
- ✅ Super admin não pode se deletar
- ✅ Validar dependências antes de deletar

### 3. **UX**
- ✅ Toast notifications (não alert)
- ✅ Estatísticas do usuário
- ✅ Filtros por status e perfil
- ✅ Confirmação antes de deletar

### 4. **Mobile**
- ✅ Interface responsiva
- ✅ Cards em vez de tabela em mobile

---

## 📋 FASE 1: Segurança & Permissões 🔒

**Prioridade**: 🔴 CRÍTICA  
**Tempo estimado**: Implementação completa

### 1.1. Proteção de Rotas

**Arquivo**: `src/pages/Users.tsx`

#### Implementar verificação de acesso:

```tsx
// ✨ NOVO: Verificar permissões no início do componente
export default function Users() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  
  // Se não é super admin, mostrar empty state
  if (!authLoading && !isSuperAdmin) {
    return <EmptyStateDevMode />;
  }
  
  // ... resto do código
}
```

#### Componente Empty State:

```tsx
function EmptyStateDevMode() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Settings className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-text mb-3">
          Página em Desenvolvimento
        </h2>
        <p className="text-text-muted mb-6">
          Esta funcionalidade está sendo desenvolvida e estará disponível em breve.
        </p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
```

### 1.2. RLS Policies para Profiles

**Arquivo**: `supabase/migrations/20260206180000_add_profiles_rls.sql`

```sql
-- ============================================================================
-- RLS POLICIES PARA PROFILES
-- ============================================================================

-- Habilitar RLS se não estiver habilitado
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Super admins podem ver todos os profiles
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
      AND profiles.is_active = true
    )
  );

-- Policy 2: Users podem ver apenas seu próprio profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 3: Apenas super admins podem inserir novos profiles
CREATE POLICY "Only super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
      AND profiles.is_active = true
    )
  );

-- Policy 4: Super admins podem atualizar qualquer profile
CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
      AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
      AND profiles.is_active = true
    )
  );

-- Policy 5: Users podem atualizar apenas seu próprio profile (nome apenas)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid()) -- Não pode mudar role
  );

-- Policy 6: Apenas super admins podem deletar profiles
CREATE POLICY "Only super admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    id != auth.uid() -- Não pode deletar a si mesmo
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
      AND profiles.is_active = true
    )
  );
```

### 1.3. Usar Admin API para Criar Usuários

**Arquivo**: `src/pages/Users.tsx`

#### Substituir signUp por Admin API:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    // ✨ NOVO: Usar Admin API em vez de signUp
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Já confirmar email automaticamente
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Falha ao criar usuário');

    // Criar profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      });

    if (profileError) throw profileError;

    // ✨ Toast de sucesso
    showToast({
      type: 'success',
      message: 'Usuário criado com sucesso!',
      description: `${fullName} foi adicionado ao sistema.`,
    });

    onSuccess();
  } catch (error) {
    const parsedError = parseSupabaseError(error);
    setError(parsedError.message);
    
    showToast({
      type: 'error',
      message: 'Erro ao criar usuário',
      description: parsedError.message,
    });
  } finally {
    setLoading(false);
  }
}
```

### 1.4. Prevenir Auto-Delete

```tsx
async function handleDeleteUser(userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  
  // ✨ VALIDAÇÃO: Não pode deletar a si mesmo
  if (user?.id === userId) {
    showToast({
      type: 'error',
      message: 'Operação não permitida',
      description: 'Você não pode deletar sua própria conta.',
    });
    return;
  }

  // ✨ VALIDAÇÃO: Verificar dependências
  const { data: dependencies } = await checkUserDependencies(userId);
  
  if (dependencies.hasAppointments || dependencies.hasPatients) {
    setDeletingUser({ ...deletingUser, dependencies });
    // Mostrar modal com aviso de dependências
    return;
  }

  // Prosseguir com deleção
  // ...
}
```

---

## 📋 FASE 2: UX & Informações 📊

**Prioridade**: 🟡 ALTA  
**Tempo estimado**: Após Fase 1

### 2.1. Estatísticas do Usuário

**Query para buscar estatísticas**:

```tsx
interface UserStats {
  appointmentsCount: number;
  proceduresCount: number;
  patientsCount: number;
  lastAccessAt: string | null;
}

async function loadUserStats(userId: string): Promise<UserStats> {
  // Agendamentos
  const { count: appointmentsCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', userId);

  // Procedimentos associados
  const { count: proceduresCount } = await supabase
    .from('professional_procedures')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', userId);

  // Pacientes
  const { count: patientsCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', userId);

  return {
    appointmentsCount: appointmentsCount || 0,
    proceduresCount: proceduresCount || 0,
    patientsCount: patientsCount || 0,
    lastAccessAt: null, // TODO: implementar tracking
  };
}
```

**Exibir na tabela**:

```tsx
<td className="px-6 py-4">
  <div className="flex items-center gap-4 text-sm text-text-muted">
    <div className="flex items-center gap-1" title="Agendamentos">
      <Calendar className="w-4 h-4" />
      <span>{stats[user.id]?.appointmentsCount || 0}</span>
    </div>
    <div className="flex items-center gap-1" title="Procedimentos">
      <Scissors className="w-4 h-4" />
      <span>{stats[user.id]?.proceduresCount || 0}</span>
    </div>
    <div className="flex items-center gap-1" title="Pacientes">
      <Users className="w-4 h-4" />
      <span>{stats[user.id]?.patientsCount || 0}</span>
    </div>
  </div>
</td>
```

### 2.2. Substituir Alert por Toast

**Usar o componente Toast existente** (`src/components/Toast.tsx`):

```tsx
import { useToast } from '../components/Toast';

export default function Users() {
  const { toast, showToast, hideToast } = useToast();
  
  // ✅ Sucesso
  showToast({
    type: 'success',
    message: 'Status alterado!',
    description: `Usuário ${isActive ? 'ativado' : 'desativado'} com sucesso.`,
  });
  
  // ❌ Erro
  showToast({
    type: 'error',
    message: 'Erro ao deletar usuário',
    description: 'O usuário possui agendamentos associados.',
  });
  
  // ⚠️ Aviso
  showToast({
    type: 'warning',
    message: 'Atenção',
    description: 'Esta ação não pode ser desfeita.',
  });
}
```

### 2.3. Filtros

**Interface de filtros**:

```tsx
const [filters, setFilters] = useState({
  status: 'all', // 'all' | 'active' | 'inactive'
  role: 'all',   // 'all' | 'super_admin' | 'user'
});

const filteredUsers = users.filter((user) => {
  // Busca por texto
  const matchesSearch = 
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase());
  
  // Filtro de status
  const matchesStatus = 
    filters.status === 'all' ||
    (filters.status === 'active' && user.is_active) ||
    (filters.status === 'inactive' && !user.is_active);
  
  // Filtro de perfil
  const matchesRole = 
    filters.role === 'all' ||
    filters.role === user.role;
  
  return matchesSearch && matchesStatus && matchesRole;
});
```

**UI dos filtros**:

```tsx
<div className="flex items-center gap-3">
  <select
    value={filters.status}
    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
    className="px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg"
  >
    <option value="all">Todos os status</option>
    <option value="active">Ativos</option>
    <option value="inactive">Inativos</option>
  </select>
  
  <select
    value={filters.role}
    onChange={(e) => setFilters({ ...filters, role: e.target.value })}
    className="px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg"
  >
    <option value="all">Todos os perfis</option>
    <option value="super_admin">Super Admin</option>
    <option value="user">Profissional</option>
  </select>
</div>
```

### 2.4. Reset de Senha

**Nova funcionalidade no modal de edição**:

```tsx
function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function handleResetPassword() {
    try {
      const { error } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );

      if (error) throw error;

      showToast({
        type: 'success',
        message: 'Senha resetada!',
        description: 'A nova senha foi definida com sucesso.',
      });

      setShowPasswordReset(false);
      setNewPassword('');
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao resetar senha',
        description: parseSupabaseError(error).message,
      });
    }
  }

  return (
    // ... modal content
    <div className="border-t border-accent/20 pt-4 mt-4">
      <button
        type="button"
        onClick={() => setShowPasswordReset(!showPasswordReset)}
        className="text-sm text-primary hover:underline"
      >
        {showPasswordReset ? 'Cancelar reset de senha' : 'Resetar senha'}
      </button>
      
      {showPasswordReset && (
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nova senha (mín. 6 caracteres)"
            className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg"
            minLength={6}
          />
          <button
            onClick={handleResetPassword}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg"
            disabled={newPassword.length < 6}
          >
            Confirmar Nova Senha
          </button>
        </div>
      )}
    </div>
  );
}
```

### 2.5. Validação de Dependências

**Função para verificar**:

```tsx
async function checkUserDependencies(userId: string) {
  const [appointments, patients, procedures] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', userId),
    
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', userId),
    
    supabase
      .from('professional_procedures')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', userId),
  ]);

  return {
    hasAppointments: (appointments.count || 0) > 0,
    appointmentsCount: appointments.count || 0,
    hasPatients: (patients.count || 0) > 0,
    patientsCount: patients.count || 0,
    hasProcedures: (procedures.count || 0) > 0,
    proceduresCount: procedures.count || 0,
  };
}
```

**Modal de confirmação com dependências**:

```tsx
function DeleteConfirmModal({ user, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [dependencies, setDependencies] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserDependencies(user.id).then((deps) => {
      setDependencies(deps);
      setLoading(false);
    });
  }, [user.id]);

  const hasDependencies = dependencies && (
    dependencies.hasAppointments ||
    dependencies.hasPatients ||
    dependencies.hasProcedures
  );

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6">
        <h2 className="text-xl font-semibold text-text mb-4">
          Confirmar Exclusão
        </h2>

        {loading ? (
          <div className="py-6 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
            <p className="text-sm text-text-muted mt-2">Verificando dependências...</p>
          </div>
        ) : (
          <>
            <p className="text-text-muted mb-4">
              Tem certeza que deseja deletar <strong className="text-text">{user.full_name}</strong>?
            </p>

            {hasDependencies && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-orange-800 mb-2">
                  ⚠️ Este usuário possui dados associados:
                </p>
                <ul className="text-sm text-orange-700 space-y-1">
                  {dependencies.hasAppointments && (
                    <li>• {dependencies.appointmentsCount} agendamento(s)</li>
                  )}
                  {dependencies.hasPatients && (
                    <li>• {dependencies.patientsCount} paciente(s)</li>
                  )}
                  {dependencies.hasProcedures && (
                    <li>• {dependencies.proceduresCount} procedimento(s) associado(s)</li>
                  )}
                </ul>
                <p className="text-sm text-orange-800 mt-2 font-medium">
                  Todos esses dados serão deletados permanentemente!
                </p>
              </div>
            )}

            <p className="text-sm text-red-600 font-medium mb-6">
              Esta ação não pode ser desfeita.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                {hasDependencies ? 'Deletar Tudo' : 'Deletar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## 📋 FASE 3: Mobile & Gestão Avançada 📱

**Prioridade**: 🟢 MÉDIA  
**Tempo estimado**: Após Fase 2

### 3.1. Layout Responsivo

**Cards em mobile, tabela em desktop**:

```tsx
{/* Desktop: Tabela */}
<div className="hidden md:block">
  <table className="w-full">
    {/* ... tabela atual ... */}
  </table>
</div>

{/* Mobile: Cards */}
<div className="md:hidden space-y-4">
  {filteredUsers.map((user) => (
    <UserCard
      key={user.id}
      user={user}
      stats={stats[user.id]}
      onEdit={() => setEditingUser(user)}
      onToggleStatus={() => handleToggleStatus(user.id, user.is_active)}
      onDelete={() => setDeletingUser(user)}
    />
  ))}
</div>
```

**Componente UserCard**:

```tsx
function UserCard({ user, stats, onEdit, onToggleStatus, onDelete }: UserCardProps) {
  return (
    <div className="bg-background-card border border-accent/20 rounded-xl p-4 shadow-soft">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-text">{user.full_name}</h3>
          <p className="text-sm text-text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {getRoleBadge(user.role)}
          {getStatusBadge(user.is_active)}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4 text-sm text-text-muted mb-4 pb-4 border-b border-accent/20">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>{stats.appointmentsCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Scissors className="w-4 h-4" />
            <span>{stats.proceduresCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{stats.patientsCount}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
        >
          <Edit2 className="w-4 h-4" />
          Editar
        </button>
        <button
          onClick={onToggleStatus}
          className="px-3 py-2 text-sm bg-champagne-nuvem hover:bg-accent/20 rounded-lg transition-colors"
          title={user.is_active ? 'Desativar' : 'Ativar'}
        >
          <Power className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
          title="Deletar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

### 3.2. Gestão de Procedimentos Inline

**Adicionar no modal de criação/edição**:

```tsx
function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);

  useEffect(() => {
    loadProcedures();
  }, []);

  async function loadProcedures() {
    const { data } = await supabase
      .from('procedures')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setProcedures(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    // ... criar usuário ...

    // Associar procedimentos
    if (selectedProcedures.length > 0) {
      const associations = selectedProcedures.map((procId) => ({
        professional_id: authData.user.id,
        procedure_id: procId,
      }));

      await supabase
        .from('professional_procedures')
        .insert(associations);
    }

    // ...
  }

  return (
    // ... modal content ...
    <div>
      <label className="block text-sm font-medium text-text mb-2">
        Procedimentos (opcional)
      </label>
      <div className="max-h-48 overflow-y-auto border border-accent/30 rounded-lg p-3 space-y-2">
        {procedures.map((proc) => (
          <label
            key={proc.id}
            className="flex items-center gap-2 cursor-pointer hover:bg-champagne-nuvem p-2 rounded"
          >
            <input
              type="checkbox"
              checked={selectedProcedures.includes(proc.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedProcedures([...selectedProcedures, proc.id]);
                } else {
                  setSelectedProcedures(selectedProcedures.filter(id => id !== proc.id));
                }
              }}
              className="w-4 h-4 text-primary"
            />
            <span className="text-sm text-text">{proc.name}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-text-muted mt-2">
        {selectedProcedures.length} procedimento(s) selecionado(s)
      </p>
    </div>
  );
}
```

---

## 📂 Arquivos a Criar/Modificar

### 🆕 Novos Arquivos

1. **`supabase/migrations/20260206180000_add_profiles_rls.sql`**
   - RLS policies para `profiles`

2. **`doc/planejamento/gestao-usuarios.md`**
   - Este documento de planejamento

3. **`doc/planejamento/testes-gestao-usuarios.md`**
   - Guia de testes para validar implementação

### ✏️ Arquivos a Modificar

1. **`src/pages/Users.tsx`**
   - Adicionar verificação de permissões
   - Empty state para user comum
   - Usar Admin API para criar usuários
   - Implementar Toast notifications
   - Adicionar filtros
   - Estatísticas do usuário
   - Reset de senha
   - Validação de dependências
   - Layout responsivo (cards mobile)
   - Gestão de procedimentos inline

2. **`src/lib/errorHandling.ts`**
   - Adicionar novos parsers de erro para operações de usuário

3. **`src/contexts/AuthContext.tsx`**
   - Nenhuma mudança necessária (já tem `isSuperAdmin`)

---

## 🧪 Cenários de Teste

### Teste 1: Acesso Negado para User Comum
**Como**: User (não super_admin)  
**Quando**: Acesso `/users`  
**Então**: Vejo empty state "Página em desenvolvimento"

### Teste 2: Criar Usuário via Admin API
**Como**: Super Admin  
**Quando**: Crio novo usuário  
**Então**: 
- Usuário criado sem enviar email
- Toast de sucesso aparece
- Usuário aparece na lista

### Teste 3: Validar Auto-Delete
**Como**: Super Admin  
**Quando**: Tento deletar minha própria conta  
**Então**: 
- Operação bloqueada
- Toast de erro: "Você não pode deletar sua própria conta"

### Teste 4: Deletar com Dependências
**Como**: Super Admin  
**Quando**: Tento deletar usuário com agendamentos  
**Então**: 
- Modal mostra aviso com quantidades
- Botão "Deletar Tudo" (vermelho)
- Ao confirmar, tudo é deletado

### Teste 5: Reset de Senha
**Como**: Super Admin  
**Quando**: Edito usuário e reseto senha  
**Então**: 
- Nova senha definida com sucesso
- Toast de sucesso
- Usuário consegue fazer login com nova senha

### Teste 6: Filtros
**Como**: Super Admin  
**Quando**: Aplico filtros de status e perfil  
**Então**: Lista atualiza dinamicamente

### Teste 7: Estatísticas
**Como**: Super Admin  
**Quando**: Visualizo lista  
**Então**: Vejo contadores de agendamentos, procedimentos, pacientes

### Teste 8: Mobile Responsivo
**Como**: Super Admin (mobile)  
**Quando**: Acesso `/users` em tela pequena  
**Então**: Vejo cards em vez de tabela

### Teste 9: Associar Procedimentos
**Como**: Super Admin  
**Quando**: Crio usuário e seleciono procedimentos  
**Então**: Procedimentos ficam associados ao profissional

---

## 📊 Resumo de Mudanças

| Componente | Tipo | Mudança |
|------------|------|---------|
| `Users.tsx` | ✏️ Modificar | Adicionar todas as melhorias |
| `profiles` RLS | 🆕 Criar | Migration com policies |
| `errorHandling.ts` | ✏️ Modificar | Novos parsers |
| Documentação | 🆕 Criar | Planejamento + Testes |

---

## 🎯 Próximos Passos

1. ✅ **Revisar este planejamento** - AGUARDANDO APROVAÇÃO
2. ⏳ **Implementar Fase 1** (Segurança)
3. ⏳ **Implementar Fase 2** (UX & Info)
4. ⏳ **Implementar Fase 3** (Mobile)
5. ⏳ **Testes completos**
6. ⏳ **Documentar mudanças finais**

---

## 💬 Notas Técnicas

### Admin API
A Admin API do Supabase requer privilégios especiais. Se não funcionar no cliente, podemos:
1. Criar Edge Function para criação de usuários
2. Usar service role key (backend apenas)

### RLS Recursão
As policies de `profiles` precisam ser cuidadosas para não causar recursão (como aconteceu antes).

### Performance
Com muitos usuários (>100), considerar:
- Paginação
- Virtual scrolling
- Lazy loading de estatísticas

---

**Pronto para aprovação e implementação!** 🚀
