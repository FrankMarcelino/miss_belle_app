import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Loader2, Search, Clock, DollarSign } from 'lucide-react';

interface Procedure {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
  is_active: boolean;
  created_at: string;
}

export default function Procedures() {
  const { isSuperAdmin } = useAuth();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadProcedures();
  }, []);

  async function loadProcedures() {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProcedures(data || []);
    } catch (error) {
      console.error('Error loading procedures:', error);
    } finally {
      setLoading(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Procedimentos</h1>
          <p className="text-text-muted mt-1">
            {isSuperAdmin ? 'Gerencie os procedimentos da clínica' : 'Visualize os procedimentos disponíveis'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
          >
            <Plus className="w-5 h-5" />
            Novo Procedimento
          </button>
        )}
      </div>

      <div className="bg-background-card rounded-xl border border-accent/20 shadow-card">
        <div className="p-6 border-b border-accent/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar procedimento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text placeholder-text-muted"
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
                className="bg-champagne-nuvem rounded-lg p-5 border border-accent/20 hover:shadow-soft transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-text text-lg">{procedure.name}</h3>
                  {isSuperAdmin && (
                    <button className="p-1.5 hover:bg-background-card rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4 text-text-muted" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{procedure.duration_minutes} minutos</span>
                  </div>
                  <div className="flex items-center gap-2 text-accent">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm font-semibold">
                      R$ {procedure.default_price.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && isSuperAdmin && (
        <CreateProcedureModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadProcedures();
          }}
        />
      )}
    </div>
  );
}

interface CreateProcedureModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateProcedureModal({ onClose, onSuccess }: CreateProcedureModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('procedures')
        .insert({
          name,
          duration_minutes: parseInt(durationMinutes),
          default_price: parseFloat(defaultPrice),
          created_by: user?.id,
        });

      if (insertError) throw insertError;

      onSuccess();
    } catch (error: any) {
      setError(error.message || 'Erro ao criar procedimento');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/20">
        <h2 className="text-xl font-semibold text-text mb-6">Novo Procedimento</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome do Procedimento
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              min="1"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Valor Padrão (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              placeholder="0.00"
              min="0"
              required
              disabled={loading}
            />
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
              className="flex-1 px-4 py-2 border border-accent/30 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
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
