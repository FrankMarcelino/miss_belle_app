import { useEffect, useState } from 'react';
import { supabase, supabaseUrl } from '../lib/supabase';
import { Plus, Edit2, Loader2, Search, Power, Trash2, Settings, Calendar, Scissors, Users as UsersIcon, Key } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import Toast from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'user';
  is_active: boolean;
  created_at: string;
}

interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
  is_active: boolean;
}

interface UserStats {
  appointmentsCount: number;
  proceduresCount: number;
  patientsCount: number;
}

interface UserDependencies {
  hasAppointments: boolean;
  appointmentsCount: number;
  hasPatients: boolean;
  patientsCount: number;
  hasProcedures: boolean;
  proceduresCount: number;
}

export default function Users() {
  const { isSuperAdmin, loading: authLoading, user: currentUser } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  
  // ✨ NOVO: Estado para estatísticas e filtros
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [filters, setFilters] = useState({
    status: 'all', // 'all' | 'active' | 'inactive'
    role: 'all',   // 'all' | 'super_admin' | 'user'
  });

  // 🔒 SEGURANÇA: Verificar permissões
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      // Não é super admin, não carregar usuários
      setLoading(false);
    } else if (!authLoading && isSuperAdmin) {
      loadUsers();
    }
  }, [isSuperAdmin, authLoading]);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
      
      // ✨ Carregar estatísticas para cada usuário
      if (data) {
        await loadAllUserStats(data);
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao carregar usuários',
        description: parseSupabaseError(error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  // ✨ NOVO: Carregar estatísticas de todos os usuários
  async function loadAllUserStats(profiles: Profile[]) {
    const stats: Record<string, UserStats> = {};

    for (const profile of profiles) {
      stats[profile.id] = await loadUserStats(profile.id);
    }

    setUserStats(stats);
  }

  // ✨ NOVO: Carregar estatísticas de um usuário
  async function loadUserStats(userId: string): Promise<UserStats> {
    try {
      const [appointments, procedures, patients] = await Promise.all([
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', userId),
        
        supabase
          .from('professional_procedures')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', userId),
        
        supabase
          .from('patients')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', userId),
      ]);

      return {
        appointmentsCount: appointments.count || 0,
        proceduresCount: procedures.count || 0,
        patientsCount: patients.count || 0,
      };
    } catch (error) {
      return {
        appointmentsCount: 0,
        proceduresCount: 0,
        patientsCount: 0,
      };
    }
  }

  async function handleToggleStatus(userId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      showToast({
        type: 'success',
        message: 'Status alterado!',
        description: `Usuário ${!currentStatus ? 'ativado' : 'desativado'} com sucesso.`,
      });
      
      loadUsers();
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao alterar status',
        description: parseSupabaseError(error).message,
      });
    }
  }

  async function handleDeleteUser(userId: string) {
    // 🔒 VALIDAÇÃO: Não pode deletar a si mesmo
    if (currentUser?.id === userId) {
      showToast({
        type: 'error',
        message: 'Operação não permitida',
        description: 'Você não pode deletar sua própria conta.',
      });
      setDeletingUser(null);
      return;
    }

    try {
      // ✨ NOVO: Deletar dados relacionados ANTES do profile (ordem FK)
      
      // 1. Primeiro, buscar IDs dos agendamentos deste profissional
      const { data: userAppointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('professional_id', userId);

      const appointmentIds = userAppointments?.map(a => a.id) || [];

      // 2. Deletar transações do caixa (referencia appointments)
      if (appointmentIds.length > 0) {
        const { error: transactionsError } = await supabase
          .from('cash_register_transactions')
          .delete()
          .in('appointment_id', appointmentIds);
        
        if (transactionsError) {
        }
      }

      // 3. Deletar agendamentos (referencia procedures, patients, professional)
      const { error: appointmentsError } = await supabase
        .from('appointments')
        .delete()
        .eq('professional_id', userId);

      if (appointmentsError) {
      }

      // 4. Deletar pacientes (referencia professional)
      const { error: patientsError } = await supabase
        .from('patients')
        .delete()
        .eq('professional_id', userId);

      if (patientsError) {
      }

      // 5. Deletar associações de procedimentos
      const { error: proceduresError } = await supabase
        .from('professional_procedures')
        .delete()
        .eq('professional_id', userId);

      if (proceduresError) {
      }

      // 6. Deletar fechamentos de caixa
      const { error: closingsError } = await supabase
        .from('cash_register_closings')
        .delete()
        .eq('professional_id', userId);

      if (closingsError) {
      }

      // 7. Finalmente, deletar o profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      // 8. Deletar do auth (opcional, pode falhar se não tiver permissão)
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
      }

      showToast({
        type: 'success',
        message: 'Usuário deletado!',
        description: 'O usuário e todos os dados relacionados foram removidos.',
      });

      setDeletingUser(null);
      loadUsers();
    } catch (error) {
      showToast({
        type: 'error',
        message: 'Erro ao deletar usuário',
        description: parseSupabaseError(error).message,
      });
    }
  }

  // ✨ FILTROS: Busca + Status + Perfil
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

  // ✨ NOVO: Formatar data de criação
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  const getRoleBadge = (role: string) => {
    return role === 'super_admin' ? (
      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
        Super Admin
      </span>
    ) : (
      <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">
        Profissional
      </span>
    );
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        Ativo
      </span>
    ) : (
      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
        Inativo
      </span>
    );
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // 🔒 SEGURANÇA: Usuário comum vê empty state
  if (!isSuperAdmin) {
    return <EmptyStateDevMode />;
  }

  return (
    <div className="space-y-6">
      {/* Toast Notifications */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          description={toast.description}
          onClose={hideToast}
          duration={toast.duration}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Profissionais</h1>
          <p className="text-text-muted mt-1">Gerencie os usuários do sistema</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      <div className="bg-background-card rounded-xl border border-accent/10 shadow-card">
        <div className="p-6 border-b border-accent/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text placeholder-text-muted"
            />
          </div>
        </div>

        {/* ✨ NOVO: Filtros */}
        <div className="px-6 pb-4 flex items-center gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-sm"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          
          <select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-sm"
          >
            <option value="all">Todos os perfis</option>
            <option value="super_admin">Super Admin</option>
            <option value="user">Profissional</option>
          </select>

          {(filters.status !== 'all' || filters.role !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setFilters({ status: 'all', role: 'all' });
                setSearchTerm('');
              }}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors"
            >
              Limpar filtros
            </button>
          )}

          <div className="ml-auto text-sm text-text-muted">
            {filteredUsers.length} {filteredUsers.length === 1 ? 'usuário' : 'usuários'}
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-text-muted">
              {searchTerm || filters.status !== 'all' || filters.role !== 'all' 
                ? 'Nenhum usuário encontrado com os filtros aplicados' 
                : 'Nenhum usuário cadastrado'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: Tabela */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-accent/10">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">Nome</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">E-mail</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">Perfil</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">Estatísticas</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-text">Criado em</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-text">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-accent/10 last:border-0 hover:bg-champagne-nuvem transition-colors">
                    <td className="px-6 py-4 text-text font-medium">{user.full_name}</td>
                    <td className="px-6 py-4 text-text-muted">{user.email}</td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4">{getStatusBadge(user.is_active)}</td>
                    <td className="px-6 py-4">
                      {userStats[user.id] ? (
                        <div className="flex items-center gap-4 text-sm text-text-muted">
                          <div className="flex items-center gap-1" title="Agendamentos">
                            <Calendar className="w-4 h-4" />
                            <span>{userStats[user.id].appointmentsCount}</span>
                          </div>
                          <div className="flex items-center gap-1" title="Procedimentos">
                            <Scissors className="w-4 h-4" />
                            <span>{userStats[user.id].proceduresCount}</span>
                          </div>
                          <div className="flex items-center gap-1" title="Pacientes">
                            <UsersIcon className="w-4 h-4" />
                            <span>{userStats[user.id].patientsCount}</span>
                          </div>
                        </div>
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-text hover:bg-background rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.is_active)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-text hover:bg-background rounded-lg transition-colors"
                          title={user.is_active ? 'Desativar' : 'Ativar'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingUser(user)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-4 p-4">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                stats={userStats[user.id]}
                onEdit={() => setEditingUser(user)}
                onToggleStatus={() => handleToggleStatus(user.id, user.is_active)}
                onDelete={() => setDeletingUser(user)}
                formatDate={formatDate}
              />
            ))}
          </div>
        </>
      )}
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            loadUsers();
          }}
        />
      )}

      {deletingUser && (
        <DeleteConfirmModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={() => handleDeleteUser(deletingUser.id)}
        />
      )}
    </div>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface EditUserModalProps {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
}

function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<'super_admin' | 'user'>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // ✨ NOVO: Estado para reset de senha
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // ✨ NOVO: Estado para gestão de procedimentos
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);
  const [initialProcedures, setInitialProcedures] = useState<string[]>([]);

  // ✨ Carregar procedimentos disponíveis e procedimentos atuais do usuário
  useEffect(() => {
    loadProcedures();
    loadUserProcedures();
  }, []);

  async function loadProcedures() {
    setLoadingProcedures(true);
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProcedures(data || []);
    } catch (error) {
    } finally {
      setLoadingProcedures(false);
    }
  }

  async function loadUserProcedures() {
    try {
      const { data, error } = await supabase
        .from('professional_procedures')
        .select('procedure_id')
        .eq('professional_id', user.id);

      if (error) throw error;
      
      const procIds = data?.map(p => p.procedure_id) || [];
      setSelectedProcedures(procIds);
      setInitialProcedures(procIds);
    } catch (error) {
    }
  }

  function toggleProcedure(procedureId: string) {
    if (selectedProcedures.includes(procedureId)) {
      setSelectedProcedures(selectedProcedures.filter(id => id !== procedureId));
    } else {
      setSelectedProcedures([...selectedProcedures, procedureId]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          email,
          role,
          is_active: isActive,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      const { error: authError } = await supabase.auth.admin.updateUserById(
        user.id,
        { email }
      );

      if (authError) {
      }

      // ✨ NOVO: Atualizar procedimentos associados
      // Identificar procedimentos a adicionar e remover
      const toAdd = selectedProcedures.filter(id => !initialProcedures.includes(id));
      const toRemove = initialProcedures.filter(id => !selectedProcedures.includes(id));

      // Remover procedimentos desmarcados
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('professional_procedures')
          .delete()
          .eq('professional_id', user.id)
          .in('procedure_id', toRemove);

        if (removeError) {
        }
      }

      // Adicionar novos procedimentos
      if (toAdd.length > 0) {
        const associations = toAdd.map(procId => ({
          professional_id: user.id,
          procedure_id: procId,
        }));

        const { error: addError } = await supabase
          .from('professional_procedures')
          .insert(associations);

        if (addError) {
        }
      }

      // ✨ Toast de sucesso
      showToast({
        type: 'success',
        message: 'Usuário atualizado!',
        description: 'As alterações foram salvas com sucesso.',
      });

      onSuccess();
    } catch (error) {
      const parsedError = parseSupabaseError(error);
      setError(parsedError.message);
      
      showToast({
        type: 'error',
        message: 'Erro ao atualizar usuário',
        description: parsedError.message,
      });
    } finally {
      setLoading(false);
    }
  }

  // ✨ NOVO: Função para resetar senha
  async function handleResetPassword() {
    if (newPassword.length < 6) {
      showToast({
        type: 'error',
        message: 'Senha muito curta',
        description: 'A senha deve ter no mínimo 6 caracteres.',
      });
      return;
    }

    setResettingPassword(true);

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
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <h2 className="text-xl font-semibold text-text mb-6">Editar Usuário</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Perfil
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'super_admin' | 'user')}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              disabled={loading}
            >
              <option value="user">Profissional</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-primary bg-champagne-nuvem border-accent/15 rounded focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
              <span className="text-sm font-medium text-text">Usuário ativo</span>
            </label>
          </div>

          {/* ✨ NOVO: Seção de Reset de Senha */}
          <div className="border-t border-accent/10 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setShowPasswordReset(!showPasswordReset)}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Key className="w-4 h-4" />
              {showPasswordReset ? 'Cancelar reset de senha' : 'Resetar senha deste usuário'}
            </button>
            
            {showPasswordReset && (
              <div className="mt-4 space-y-3 bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-sm text-orange-800 font-medium">
                  ⚠️ Definir nova senha para {user.full_name}
                </p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha (mín. 6 caracteres)"
                  className="w-full px-4 py-2 bg-white border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-text"
                  minLength={6}
                  disabled={resettingPassword}
                />
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  disabled={newPassword.length < 6 || resettingPassword}
                >
                  {resettingPassword ? 'Resetando...' : 'Confirmar Nova Senha'}
                </button>
              </div>
            )}
          </div>

          {/* ✨ NOVO: Gestão de Procedimentos (apenas para profissionais) */}
          {role === 'user' && (
            <div className="border-t border-accent/10 pt-4 mt-4">
              <label className="block text-sm font-medium text-text mb-2">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4" />
                  Procedimentos Associados
                </div>
              </label>
              <div className="max-h-48 overflow-y-auto border border-accent/15 rounded-lg bg-champagne-nuvem">
                {loadingProcedures ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    <p className="text-xs text-text-muted mt-2">Carregando procedimentos...</p>
                  </div>
                ) : procedures.length === 0 ? (
                  <div className="p-4 text-center text-sm text-text-muted">
                    Nenhum procedimento disponível
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {procedures.map((proc) => (
                      <label
                        key={proc.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-background p-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProcedures.includes(proc.id)}
                          onChange={() => toggleProcedure(proc.id)}
                          className="w-4 h-4 text-primary bg-background border-accent/15 rounded focus:ring-2 focus:ring-primary"
                          disabled={loading}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-text block truncate">{proc.name}</span>
                          <span className="text-xs text-text-muted">
                            {proc.duration_minutes}min • R$ {proc.default_price.toFixed(2)}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2">
                {selectedProcedures.length} procedimento(s) selecionado(s)
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  user: Profile;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ user, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [dependencies, setDependencies] = useState<UserDependencies | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDependencies();
  }, [user.id]);

  async function checkDependencies() {
    setLoading(true);
    const deps = await checkUserDependenciesGlobal(user.id);
    setDependencies(deps);
    setLoading(false);
  }

  const hasDependencies = dependencies && (
    dependencies.hasAppointments ||
    dependencies.hasPatients ||
    dependencies.hasProcedures
  );

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <h2 className="text-xl font-semibold text-text mb-4">Confirmar Exclusão</h2>

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
                className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
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

function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'super_admin' | 'user'>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // ✨ NOVO: Estado para gestão de procedimentos
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);

  // ✨ Carregar procedimentos disponíveis
  useEffect(() => {
    loadProcedures();
  }, []);

  async function loadProcedures() {
    setLoadingProcedures(true);
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProcedures(data || []);
    } catch (error) {
    } finally {
      setLoadingProcedures(false);
    }
  }

  function toggleProcedure(procedureId: string) {
    if (selectedProcedures.includes(procedureId)) {
      setSelectedProcedures(selectedProcedures.filter(id => id !== procedureId));
    } else {
      setSelectedProcedures([...selectedProcedures, procedureId]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // ✨ Chamar Edge Function que usa Admin API no backend
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Sessão não encontrada');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar usuário');
      }

      const newUserId = result.user.id;

      // ✨ Associar procedimentos selecionados
      if (selectedProcedures.length > 0) {
        const associations = selectedProcedures.map((procId) => ({
          professional_id: newUserId,
          procedure_id: procId,
        }));

        const { error: assocError } = await supabase
          .from('professional_procedures')
          .insert(associations);

        if (assocError) {
          // Não bloqueia a criação do usuário
        }
      }

      // ✨ Toast de sucesso
      showToast({
        type: 'success',
        message: 'Usuário criado com sucesso!',
        description: `${fullName} foi adicionado ao sistema${selectedProcedures.length > 0 ? ` com ${selectedProcedures.length} procedimento(s)` : ''}.`,
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

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <h2 className="text-xl font-semibold text-text mb-6">Novo Usuário</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Perfil
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'super_admin' | 'user')}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              disabled={loading}
            >
              <option value="user">Profissional</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          {/* ✨ NOVO: Gestão de Procedimentos (apenas para profissionais) */}
          {role === 'user' && (
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Procedimentos (opcional)
              </label>
              <div className="max-h-48 overflow-y-auto border border-accent/15 rounded-lg bg-champagne-nuvem">
                {loadingProcedures ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    <p className="text-xs text-text-muted mt-2">Carregando procedimentos...</p>
                  </div>
                ) : procedures.length === 0 ? (
                  <div className="p-4 text-center text-sm text-text-muted">
                    Nenhum procedimento disponível
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {procedures.map((proc) => (
                      <label
                        key={proc.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-background p-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProcedures.includes(proc.id)}
                          onChange={() => toggleProcedure(proc.id)}
                          className="w-4 h-4 text-primary bg-background border-accent/15 rounded focus:ring-2 focus:ring-primary"
                          disabled={loading}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-text block truncate">{proc.name}</span>
                          <span className="text-xs text-text-muted">
                            {proc.duration_minutes}min • R$ {proc.default_price.toFixed(2)}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2">
                {selectedProcedures.length} procedimento(s) selecionado(s)
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ============================================================================
// HELPER: Check User Dependencies (Global)
// ============================================================================

async function checkUserDependenciesGlobal(userId: string): Promise<UserDependencies> {
  try {
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
  } catch (error) {
    return {
      hasAppointments: false,
      appointmentsCount: 0,
      hasPatients: false,
      patientsCount: 0,
      hasProcedures: false,
      proceduresCount: 0,
    };
  }
}


// ============================================================================
// COMPONENTE: User Card (Mobile)
// ============================================================================

interface UserCardProps {
  user: Profile;
  stats?: UserStats;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}

function UserCard({ user, stats, onEdit, onToggleStatus, onDelete, formatDate }: UserCardProps) {
  const getRoleBadge = (role: string) => {
    return role === 'super_admin' ? (
      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
        Super Admin
      </span>
    ) : (
      <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">
        Profissional
      </span>
    );
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? (
      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        Ativo
      </span>
    ) : (
      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
        Inativo
      </span>
    );
  };

  return (
    <div className="bg-background-card border border-accent/10 rounded-xl p-4 shadow-soft">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text truncate">{user.full_name}</h3>
          <p className="text-sm text-text-muted truncate">{user.email}</p>
          <p className="text-xs text-text-muted mt-1">
            Criado em {formatDate(user.created_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 ml-3">
          {getRoleBadge(user.role)}
          {getStatusBadge(user.is_active)}
        </div>
      </div>

      {/* Stats */}
      {stats ? (
        <div className="flex items-center gap-4 text-sm text-text-muted mb-4 pb-4 border-b border-accent/10">
          <div className="flex items-center gap-1" title="Agendamentos">
            <Calendar className="w-4 h-4" />
            <span>{stats.appointmentsCount}</span>
          </div>
          <div className="flex items-center gap-1" title="Procedimentos">
            <Scissors className="w-4 h-4" />
            <span>{stats.proceduresCount}</span>
          </div>
          <div className="flex items-center gap-1" title="Pacientes">
            <UsersIcon className="w-4 h-4" />
            <span>{stats.patientsCount}</span>
          </div>
        </div>
      ) : (
        <div className="mb-4 pb-4 border-b border-accent/10 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
          <span className="text-sm text-text-muted">Carregando estatísticas...</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors min-h-[48px]"
        >
          <Edit2 className="w-4 h-4" />
          Editar
        </button>
        <button
          onClick={onToggleStatus}
          className="px-3 py-2.5 text-sm bg-champagne-nuvem hover:bg-accent/20 rounded-lg transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
          title={user.is_active ? 'Desativar' : 'Ativar'}
        >
          <Power className="w-5 h-5" />
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-2.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
          title="Deletar"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTE: Empty State para User Comum
// ============================================================================

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
          Por enquanto, apenas administradores têm acesso a esta área.
        </p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
