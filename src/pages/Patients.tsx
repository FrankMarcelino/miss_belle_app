import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Loader2, Search, Mail, FileText, MessageCircle, History, Star, CheckCircle2, DollarSign, RotateCcw, AlertTriangle, Calendar, Clock, ChevronRight } from 'lucide-react';
import { formatWhatsAppUrl } from '../lib/whatsapp';
import BottomSheet from '../components/mobile/BottomSheet';
import { parseSupabaseError } from '../lib/errorHandling';
import { useToast } from '../components/Toast';

interface Patient {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  professional_id: string;
  created_at: string;
}

interface PatientAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  payment_status: string | null;
  procedure: { name: string; default_price: number } | null;
  professional: { full_name: string } | null;
}

interface PatientCredit {
  id: string;
  amount_original: number;
  amount_remaining: number;
  origin: string;
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  professional: { full_name: string } | null;
}

export default function Patients() {
  const { user } = useAuth();
  const { showToast, ToastComponent } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatients();
  }, [user]);

  async function loadPatients() {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
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
          <p className="text-text-muted mt-1">Todos os pacientes da clínica</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-soft"
        >
          <Plus className="w-5 h-5" />
          Novo Paciente
        </button>
      </div>

      <div className="bg-background-card rounded-xl border border-accent/10 shadow-card">
        <div className="p-6 border-b border-accent/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text placeholder-text-muted"
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
                onClick={() => setSelectedPatient(patient)}
                className="bg-white rounded-xl p-5 border border-accent/10 shadow-card hover:shadow-card-hover transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-text text-lg">{patient.full_name}</h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-muted mt-0.5" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <a
                      href={formatWhatsAppUrl(patient.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 hover:text-green-700 font-medium transition-colors"
                    >
                      {patient.phone}
                    </a>
                  </div>
                  {patient.email && (
                    <div className="flex items-center gap-2 text-text-muted">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">{patient.email}</span>
                    </div>
                  )}
                  {patient.notes && (
                    <div className="flex items-start gap-2 text-text-muted mt-3 pt-3 border-t border-accent/10">
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

      {selectedPatient && (
        <BottomSheet
          isOpen={!!selectedPatient}
          onClose={() => setSelectedPatient(null)}
          title={selectedPatient.full_name}
        >
          <PatientDetailContent
            patient={selectedPatient}
            currentUserId={user?.id || ''}
            showToast={showToast}
          />
        </BottomSheet>
      )}

      {ToastComponent}
    </div>
  );
}

// ==================== PatientDetailContent ====================

function paymentStatusConfig(ps: string | null) {
  switch (ps) {
    case 'paid':     return { Icon: CheckCircle2, label: 'Pago',      color: 'text-green-600',  bg: 'bg-green-50' };
    case 'partial':  return { Icon: DollarSign,   label: 'Sinal',     color: 'text-amber-600',  bg: 'bg-amber-50' };
    case 'reopened': return { Icon: RotateCcw,    label: 'Correção',  color: 'text-orange-500', bg: 'bg-orange-50' };
    case 'reversed': return { Icon: AlertTriangle,label: 'Estornado', color: 'text-red-600',    bg: 'bg-red-50' };
    case 'credited': return { Icon: Star,         label: 'Crédito',   color: 'text-blue-600',   bg: 'bg-blue-50' };
    default:         return null;
  }
}

function apptStatusLabel(s: string) {
  return ({ scheduled: 'Marcado', confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado' } as Record<string, string>)[s] ?? s;
}

function apptStatusColor(s: string) {
  return ({ scheduled: 'bg-accent/10 text-accent', confirmed: 'bg-primary/10 text-primary', completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' } as Record<string, string>)[s] ?? 'bg-gray-100 text-gray-500';
}

function originLabel(o: string) {
  return ({ reversal: 'Estorno', cancellation: 'Cancelamento', downpayment: 'Sinal', manual: 'Manual' } as Record<string, string>)[o] ?? o;
}

interface PatientDetailContentProps {
  patient: Patient;
  currentUserId: string;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function PatientDetailContent({ patient, currentUserId, showToast }: PatientDetailContentProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'credits'>('history');
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [credits, setCredits] = useState<PatientCredit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [showAddCredit, setShowAddCredit] = useState(false);

  useEffect(() => { loadHistory(); loadCredits(); }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, appointment_time, status, payment_status,
          procedure:procedures(name, default_price),
          professional:profiles!professional_id(full_name)
        `)
        .eq('patient_id', patient.id)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false });
      if (error) throw error;
      setAppointments((data || []) as PatientAppointment[]);
    } catch (err) {
      const { title, description } = parseSupabaseError(err);
      showToast('error', title, description);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadCredits() {
    setLoadingCredits(true);
    try {
      const { data, error } = await supabase
        .from('patient_credits')
        .select('*, professional:profiles!professional_id(full_name)')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCredits((data || []) as PatientCredit[]);
    } catch (err) {
      const { title, description } = parseSupabaseError(err);
      showToast('error', title, description);
    } finally {
      setLoadingCredits(false);
    }
  }

  const totalPaid = appointments
    .filter((a) => a.payment_status === 'paid' || a.payment_status === 'partial')
    .reduce((s, a) => s + (a.procedure?.default_price ?? 0), 0);

  const activeCredits = credits.filter((c) => c.amount_remaining > 0);
  const totalCredit = activeCredits.reduce((s, c) => s + c.amount_remaining, 0);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-xs text-green-700 mb-1">Total pago (estimado)</p>
          <p className="text-lg font-bold text-green-700">R$ {totalPaid.toFixed(2)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-700 mb-1">Crédito disponível</p>
          <p className="text-lg font-bold text-blue-700">R$ {totalCredit.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-champagne-nuvem rounded-lg p-0.5 border border-accent/10">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          <History className="w-4 h-4" />
          Histórico
        </button>
        <button
          onClick={() => setActiveTab('credits')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'credits' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text'
          }`}
        >
          <Star className="w-4 h-4" />
          Créditos {activeCredits.length > 0 && <span className="bg-blue-500 text-white text-[10px] px-1.5 rounded-full">{activeCredits.length}</span>}
        </button>
      </div>

      {/* Histórico */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {loadingHistory ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : appointments.length === 0 ? (
            <p className="text-center text-text-muted py-8 text-sm">Nenhum atendimento registrado</p>
          ) : (
            appointments.map((apt) => {
              const pc = paymentStatusConfig(apt.payment_status);
              return (
                <div key={apt.id} className="bg-champagne-nuvem rounded-lg p-3 border border-accent/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text text-sm truncate">{apt.procedure?.name ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <Calendar className="w-3 h-3" />
                        {new Date(apt.appointment_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        <Clock className="w-3 h-3 ml-1" />
                        {apt.appointment_time.substring(0, 5)}
                      </div>
                      {apt.professional && (
                        <p className="text-xs text-text-muted mt-0.5">{apt.professional.full_name}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${apptStatusColor(apt.status)}`}>
                        {apptStatusLabel(apt.status)}
                      </span>
                      {pc && (
                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${pc.bg} ${pc.color}`}>
                          <pc.Icon className="w-2.5 h-2.5" />
                          {pc.label}
                        </span>
                      )}
                      {apt.procedure?.default_price ? (
                        <span className="text-xs text-text-muted">R$ {apt.procedure.default_price.toFixed(2)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Créditos */}
      {activeTab === 'credits' && (
        <div className="space-y-3">
          <button
            onClick={() => setShowAddCredit(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Registrar Crédito Manual
          </button>

          {showAddCredit && (
            <AddManualCreditForm
              patientId={patient.id}
              professionalId={currentUserId}
              onSuccess={() => { setShowAddCredit(false); loadCredits(); }}
              onCancel={() => setShowAddCredit(false)}
              showToast={showToast}
            />
          )}

          {loadingCredits ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : credits.length === 0 ? (
            <p className="text-center text-text-muted py-8 text-sm">Nenhum crédito registrado</p>
          ) : (
            credits.map((credit) => {
              const expired = credit.expires_at && new Date(credit.expires_at) < new Date();
              const exhausted = credit.amount_remaining === 0;
              return (
                <div
                  key={credit.id}
                  className={`rounded-lg p-3 border ${
                    exhausted || expired
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Star className={`w-4 h-4 ${exhausted || expired ? 'text-gray-400' : 'text-blue-500'}`} />
                        <span className="text-sm font-medium text-text">{originLabel(credit.origin)}</span>
                        {expired && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Expirado</span>}
                        {exhausted && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Usado</span>}
                      </div>
                      {credit.notes && <p className="text-xs text-text-muted mt-1">{credit.notes}</p>}
                      <p className="text-xs text-text-muted mt-1">
                        {new Date(credit.created_at).toLocaleDateString('pt-BR')}
                        {credit.expires_at && ` · vence ${new Date(credit.expires_at + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-base font-bold ${exhausted || expired ? 'text-gray-400' : 'text-blue-600'}`}>
                        R$ {credit.amount_remaining.toFixed(2)}
                      </p>
                      {credit.amount_remaining !== credit.amount_original && (
                        <p className="text-xs text-text-muted">de R$ {credit.amount_original.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ==================== AddManualCreditForm ====================

interface AddManualCreditFormProps {
  patientId: string;
  professionalId: string;
  onSuccess: () => void;
  onCancel: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => void;
}

function AddManualCreditForm({ patientId, professionalId, onSuccess, onCancel, showToast }: AddManualCreditFormProps) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      showToast('error', 'Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('patient_credits')
        .insert({
          patient_id: patientId,
          professional_id: professionalId,
          amount_original: value,
          amount_remaining: value,
          origin: 'manual',
          notes: notes.trim() || null,
          expires_at: expiresAt || null,
          created_by: professionalId,
        });
      if (error) throw error;
      showToast('success', 'Crédito registrado', `R$ ${value.toFixed(2)} adicionados com sucesso.`);
      onSuccess();
    } catch (err) {
      const { title, description } = parseSupabaseError(err);
      showToast('error', title, description);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-blue-800">Novo Crédito Manual</p>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">R$</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-text text-sm"
          placeholder="0,00"
          step="0.01"
          min="0.01"
          disabled={loading}
        />
      </div>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-text text-sm"
        placeholder="Observação (opcional)"
        disabled={loading}
      />
      <div>
        <label className="block text-xs text-blue-700 mb-1">Validade (opcional)</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-text text-sm"
          disabled={loading}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !amount}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Salvar
        </button>
      </div>
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao criar paciente';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-grafite-rosado/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-card rounded-2xl shadow-soft-lg max-w-md w-full p-6 border border-accent/10">
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text"
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
              className="w-full px-4 py-2 bg-champagne-nuvem border border-accent/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text resize-none"
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
