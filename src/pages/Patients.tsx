import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Loader2, Search, Phone, Mail, FileText } from 'lucide-react';

interface Patient {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  professional_id: string;
  created_at: string;
}

export default function Patients() {
  const { user, isSuperAdmin } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadPatients();
  }, [user, isSuperAdmin]);

  async function loadPatients() {
    try {
      let query = supabase.from('patients').select('*').order('full_name');

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredPatients = patients.filter((patient) =>
    patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone.includes(searchTerm) ||
    (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase()))
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
          <h1 className="text-2xl font-bold text-text">Pacientes</h1>
          <p className="text-text-muted mt-1">
            {isSuperAdmin ? 'Todos os pacientes da clínica' : 'Seus pacientes'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Novo Paciente
        </button>
      </div>

      <div className="bg-background-card rounded-xl border border-accent/20 shadow-card">
        <div className="p-6 border-b border-accent/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text placeholder-text-muted"
            />
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-text-muted">
              {searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="bg-champagne-nuvem rounded-lg p-5 border border-accent/20 hover:shadow-soft transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-text text-lg">{patient.full_name}</h3>
                  </div>
                  <button className="p-1.5 hover:bg-background-card rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4 text-text-muted" />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">{patient.phone}</span>
                  </div>
                  {patient.email && (
                    <div className="flex items-center gap-2 text-text-muted">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">{patient.email}</span>
                    </div>
                  )}
                  {patient.notes && (
                    <div className="flex items-start gap-2 text-text-muted mt-3 pt-3 border-t border-accent/20">
                      <FileText className="w-4 h-4 mt-0.5" />
                      <span className="text-sm">{patient.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreatePatientModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadPatients();
          }}
        />
      )}
    </div>
  );
}

interface CreatePatientModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePatientModal({ onClose, onSuccess }: CreatePatientModalProps) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('patients')
        .insert({
          full_name: fullName,
          phone,
          email: email || null,
          notes: notes || null,
          professional_id: user?.id,
        });

      if (insertError) throw insertError;

      onSuccess();
    } catch (error: any) {
      setError(error.message || 'Erro ao criar paciente');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/20">
        <h2 className="text-xl font-semibold text-text mb-6">Novo Paciente</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Telefone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              placeholder="(00) 00000-0000"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              E-mail (opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
              rows={3}
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
