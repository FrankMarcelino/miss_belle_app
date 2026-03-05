import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import { Plus, Edit2, Trash2, Loader2, Search, Clock, DollarSign, AlertTriangle } from 'lucide-react';

interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
  is_variable_price: boolean;
  min_price: number | null;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export default function Procedures() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);
  const [deletingProcedure, setDeletingProcedure] = useState<Procedure | null>(null);

  useEffect(() => {
    loadProcedures();
  }, [user, isSuperAdmin]);

  async function loadProcedures() {
    try {
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from('procedures')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setProcedures(data || []);
      } else {
        const { data, error } = await supabase
          .from('professional_procedures')
          .select(`
            procedure_id,
            procedures:procedure_id (
              id,
              name,
              duration_minutes,
              default_price,
              is_variable_price,
              min_price,
              is_active,
              created_at,
              created_by
            )
          `)
          .eq('professional_id', user!.id);

        if (error) throw error;

        const proceduresList = (data || [])
          .map((item) => (item as { procedures: unknown }).procedures as Procedure | null)
          .filter((p): p is Procedure => p !== null && p.is_active);

        proceduresList.sort((a, b) => a.name.localeCompare(b.name));
        setProcedures(proceduresList);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  function canEdit() {
    return isSuperAdmin || true;
  }

  const filteredProcedures = procedures.filter((proc) =>
    proc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ToastComponent}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {isSuperAdmin ? 'Procedimentos' : 'Meus Serviços'}
          </h1>
          <p className="text-text-muted mt-1">
            {isSuperAdmin
              ? 'Gerencie os procedimentos da clínica'
              : 'Gerencie seus serviços'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Novo Serviço</span>
        </button>
      </div>

      <div className="bg-background-card rounded-xl border border-accent/10 shadow-card">
        <div className="p-6 border-b border-accent/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar procedimento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text placeholder-text-muted"
            />
          </div>
        </div>

        {filteredProcedures.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-text-muted">
              {searchTerm ? 'Nenhum procedimento encontrado' : 'Nenhum procedimento cadastrado'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {filteredProcedures.map((procedure) => (
              <div
                key={procedure.id}
                className="bg-white rounded-xl p-5 border border-accent/10 shadow-card hover:shadow-card-hover transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-text text-lg">{procedure.name}</h3>
                  {canEdit() && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingProcedure(procedure)}
                        className="p-1.5 hover:bg-background-card rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4 text-text-muted" />
                      </button>
                      <button
                        onClick={() => setDeletingProcedure(procedure)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{procedure.duration_minutes} minutos</span>
                  </div>
                  <div className="flex items-center gap-2 text-accent">
                    <DollarSign className="w-4 h-4" />
                    {procedure.is_variable_price ? (
                      <span className="text-sm font-semibold">
                        {procedure.min_price != null && procedure.min_price > 0
                          ? `A partir de R$ ${procedure.min_price.toFixed(2)}`
                          : 'Valor variável'}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold">
                        R$ {procedure.default_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProcedureModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadProcedures();
          }}
          showToast={showToast}
        />
      )}

      {editingProcedure && (
        <EditProcedureModal
          procedure={editingProcedure}
          onClose={() => setEditingProcedure(null)}
          onSuccess={() => {
            setEditingProcedure(null);
            loadProcedures();
          }}
          showToast={showToast}
        />
      )}

      {deletingProcedure && (
        <DeleteProcedureConfirm
          procedure={deletingProcedure}
          onClose={() => setDeletingProcedure(null)}
          onSuccess={() => {
            setDeletingProcedure(null);
            loadProcedures();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// =============================================================================
// CreateProcedureModal
// =============================================================================

type ShowToastFn = (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;

interface CreateProcedureModalProps {
  onClose: () => void;
  onSuccess: () => void;
  showToast: ShowToastFn;
}

function CreateProcedureModal({ onClose, onSuccess, showToast }: CreateProcedureModalProps) {
  const { user, isSuperAdmin } = useAuth();
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [isVariablePrice, setIsVariablePrice] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: insertError } = await supabase
        .from('procedures')
        .insert({
          name,
          duration_minutes: parseInt(durationMinutes),
          default_price: defaultPrice ? parseFloat(defaultPrice) : 0,
          is_variable_price: isVariablePrice,
          min_price: isVariablePrice && minPrice ? parseFloat(minPrice) : null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Auto-associate with professional if not super admin
      if (!isSuperAdmin && data) {
        const { error: assocError } = await supabase
          .from('professional_procedures')
          .insert({
            professional_id: user!.id,
            procedure_id: data.id,
          });

        if (assocError) throw assocError;
      }

      showToast('success', 'Serviço criado!', `${name} foi adicionado com sucesso.`);
      onSuccess();
    } catch (err) {
      const appError = parseSupabaseError(err);
      setError(appError.title);
      showToast('error', 'Erro ao salvar', appError.description || appError.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <h2 className="text-xl font-semibold text-text mb-6">Novo Serviço</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome do Procedimento
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              placeholder="Ex: Limpeza de Pele"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Duração (minutos)
            </label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              min="1"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={isVariablePrice}
                onChange={(e) => setIsVariablePrice(e.target.checked)}
                className="w-4 h-4 text-primary bg-champagne-nuvem border-accent/15 rounded focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
              <span className="text-sm font-medium text-text">Preço variável</span>
            </label>

            {isVariablePrice ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Valor Mínimo (R$) <span className="text-text-muted font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                    placeholder="0.00"
                    min="0"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Valor Sugerido (R$) <span className="text-text-muted font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                    placeholder="0.00"
                    min="0"
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Valor Padrão (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                  placeholder="0.00"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
            )}
          </div>

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

// =============================================================================
// EditProcedureModal
// =============================================================================

interface EditProcedureModalProps {
  procedure: Procedure;
  onClose: () => void;
  onSuccess: () => void;
  showToast: ShowToastFn;
}

function EditProcedureModal({ procedure, onClose, onSuccess, showToast }: EditProcedureModalProps) {
  const [name, setName] = useState(procedure.name);
  const [durationMinutes, setDurationMinutes] = useState(String(procedure.duration_minutes));
  const [defaultPrice, setDefaultPrice] = useState(String(procedure.default_price));
  const [isVariablePrice, setIsVariablePrice] = useState(procedure.is_variable_price ?? false);
  const [minPrice, setMinPrice] = useState(procedure.min_price != null ? String(procedure.min_price) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: updated, error: updateError } = await supabase
        .from('procedures')
        .update({
          name,
          duration_minutes: parseInt(durationMinutes),
          default_price: defaultPrice ? parseFloat(defaultPrice) : 0,
          is_variable_price: isVariablePrice,
          min_price: isVariablePrice && minPrice ? parseFloat(minPrice) : null,
        })
        .eq('id', procedure.id)
        .select();

      if (updateError) throw updateError;
      if (!updated || updated.length === 0) throw new Error('Sem permissão para editar este procedimento. Verifique as políticas de acesso.');

      showToast('success', 'Serviço atualizado!', `${name} foi salvo com sucesso.`);
      onSuccess();
    } catch (err) {
      const appError = parseSupabaseError(err);
      setError(appError.title);
      showToast('error', 'Erro ao salvar', appError.description || appError.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <h2 className="text-xl font-semibold text-text mb-6">Editar Serviço</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome do Procedimento
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              placeholder="Ex: Limpeza de Pele"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Duração (minutos)
            </label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              min="1"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={isVariablePrice}
                onChange={(e) => setIsVariablePrice(e.target.checked)}
                className="w-4 h-4 text-primary bg-champagne-nuvem border-accent/15 rounded focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
              <span className="text-sm font-medium text-text">Preço variável</span>
            </label>

            {isVariablePrice ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Valor Mínimo (R$) <span className="text-text-muted font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                    placeholder="0.00"
                    min="0"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Valor Sugerido (R$) <span className="text-text-muted font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                    placeholder="0.00"
                    min="0"
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Valor Padrão (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
                  placeholder="0.00"
                  min="0"
                  required
                  disabled={loading}
                />
              </div>
            )}
          </div>

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

// =============================================================================
// DeleteProcedureConfirm
// =============================================================================

interface DeleteProcedureConfirmProps {
  procedure: Procedure;
  onClose: () => void;
  onSuccess: () => void;
  showToast: ShowToastFn;
}

function DeleteProcedureConfirm({ procedure, onClose, onSuccess, showToast }: DeleteProcedureConfirmProps) {
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isOwner = isSuperAdmin || procedure.created_by === user?.id;

  async function handleDelete() {
    setError('');
    setLoading(true);

    try {
      if (isOwner) {
        const { error: assocError } = await supabase
          .from('professional_procedures')
          .delete()
          .eq('procedure_id', procedure.id);

        if (assocError) throw assocError;

        const { error: updateError } = await supabase
          .from('procedures')
          .update({ is_active: false })
          .eq('id', procedure.id);

        if (updateError) throw updateError;
      } else {
        const { error: assocError } = await supabase
          .from('professional_procedures')
          .delete()
          .eq('procedure_id', procedure.id)
          .eq('professional_id', user!.id);

        if (assocError) throw assocError;
      }

      showToast('success', 'Serviço removido', `${procedure.name} foi removido com sucesso.`);
      onSuccess();
    } catch (err) {
      const appError = parseSupabaseError(err);
      setError(appError.title);
      showToast('error', 'Erro ao excluir', appError.description || appError.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-text">Excluir Serviço</h2>
        </div>

        <p className="text-text-muted mb-6">
          Tem certeza que deseja {isOwner ? 'excluir' : 'remover'} <strong className="text-text">{procedure.name}</strong>?
          {isOwner
            ? ' Este procedimento será desativado para todos.'
            : ' Ele será removido da sua lista, mas continuará disponível para outros profissionais.'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-accent/15 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
