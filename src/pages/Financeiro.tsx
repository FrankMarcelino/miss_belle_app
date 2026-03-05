import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import PaymentModal from '../components/PaymentModal';
import CashRegister from './CashRegister';
import Expenses from './Expenses';
import { formatWhatsAppUrl } from '../lib/whatsapp';
import { AlertTriangle, MessageCircle, DollarSign, Loader2, ChevronDown, Star, RotateCcw } from 'lucide-react';

type Tab = 'em_aberto' | 'caixa' | 'despesas' | 'mais';

interface PendingAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_id: string;
  professional_id: string;
  final_price: number | null;
  patient: { full_name: string; phone?: string } | null;
  procedure: { name: string; default_price: number; is_variable_price?: boolean; min_price?: number | null } | null;
  status: string;
  payment_status: string | null;
  downpayment_amount: number;
  downpayment_method: string | null;
}

interface AvailableCredit {
  id: string;
  patient_id: string;
  amount_original: number;
  amount_remaining: number;
  expires_at: string | null;
  created_at: string;
  patient: { full_name: string } | null;
  source_appointment?: { procedure: { name: string } | null } | null;
}

interface ReversalRecord {
  id: string;
  appointment_id: string;
  amount: number;
  reversal_reason: string | null;
  created_at: string;
  reversal_type: string | null;
  appointment: {
    patient: { full_name: string } | null;
    procedure: { name: string } | null;
    appointment_date: string;
  } | null;
}

export default function Financeiro() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('em_aberto');
  const [showMaisDropdown, setShowMaisDropdown] = useState(false);
  const [maisTab, setMaisTab] = useState<'creditos' | 'estornos'>('creditos');

  // Em Aberto state
  const [pendingApts, setPendingApts] = useState<PendingAppointment[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedApt, setSelectedApt] = useState<PendingAppointment | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Créditos state
  const [credits, setCredits] = useState<AvailableCredit[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Estornos state
  const [reversals, setReversals] = useState<ReversalRecord[]>([]);
  const [loadingReversals, setLoadingReversals] = useState(false);

  useEffect(() => {
    loadPendingAppointments();
  }, [user, isSuperAdmin]);

  useEffect(() => {
    if (activeTab === 'mais') {
      if (maisTab === 'creditos') loadCredits();
      else loadReversals();
    }
  }, [activeTab, maisTab]);

  async function loadPendingAppointments() {
    setLoadingPending(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('appointments')
        .select(`
          id, appointment_date, appointment_time, patient_id, professional_id,
          status, payment_status, downpayment_amount, downpayment_method, final_price,
          patient:patients(full_name, phone),
          procedure:procedures(name, default_price, is_variable_price, min_price)
        `)
        .or(`and(status.eq.completed,payment_status.eq.none),and(status.eq.completed,payment_status.is.null),and(status.in.(scheduled,confirmed),appointment_date.lt.${today})`)
        .order('appointment_date', { ascending: false });

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPendingApts((data || []) as PendingAppointment[]);
    } catch {
      // silently fail
    } finally {
      setLoadingPending(false);
    }
  }

  async function loadCredits() {
    setLoadingCredits(true);
    try {
      let query = supabase
        .from('patient_credits')
        .select(`
          id, patient_id, amount_original, amount_remaining, expires_at, created_at,
          patient:patients(full_name),
          source_appointment:appointments!source_appointment_id(procedure:procedures(name))
        `)
        .gt('amount_remaining', 0)
        .order('created_at', { ascending: false });

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCredits((data || []) as unknown as AvailableCredit[]);
    } catch {
      // silently fail
    } finally {
      setLoadingCredits(false);
    }
  }

  async function loadReversals() {
    setLoadingReversals(true);
    try {
      let query = supabase
        .from('payment_reversals')
        .select(`
          id, appointment_id, amount, reversal_reason, created_at, reversal_type,
          appointment:appointments(
            appointment_date,
            patient:patients(full_name),
            procedure:procedures(name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isSuperAdmin && user) {
        query = query.eq('professional_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReversals((data || []) as unknown as ReversalRecord[]);
    } catch {
      // silently fail
    } finally {
      setLoadingReversals(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'em_aberto', label: 'Em Aberto' },
    { id: 'caixa', label: 'Caixa' },
    { id: 'despesas', label: 'Despesas' },
    { id: 'mais', label: 'Mais ▾' },
  ];

  const overdueCount = pendingApts.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Financeiro</h1>
        <p className="text-text-muted mt-1">Gerencie pagamentos, caixa, despesas e mais</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-champagne-nuvem rounded-xl p-1 border border-accent/10">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative flex-1">
            <button
              onClick={() => {
                if (tab.id === 'mais') {
                  setShowMaisDropdown((v) => !v);
                  setActiveTab('mais');
                } else {
                  setActiveTab(tab.id);
                  setShowMaisDropdown(false);
                }
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                activeTab === tab.id
                  ? 'bg-white text-primary shadow-soft'
                  : 'text-text hover:bg-white/50'
              }`}
            >
              {tab.label}
              {tab.id === 'em_aberto' && overdueCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {overdueCount}
                </span>
              )}
            </button>
            {/* Mais dropdown */}
            {tab.id === 'mais' && showMaisDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-lg border border-accent/10 z-20 min-w-[160px]">
                <button
                  onClick={() => { setMaisTab('creditos'); setShowMaisDropdown(false); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-champagne-nuvem transition-colors rounded-t-xl flex items-center gap-2 ${maisTab === 'creditos' && activeTab === 'mais' ? 'text-primary font-medium' : 'text-text'}`}
                >
                  <Star className="w-4 h-4" />
                  Créditos de Clientes
                </button>
                <button
                  onClick={() => { setMaisTab('estornos'); setShowMaisDropdown(false); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-champagne-nuvem transition-colors rounded-b-xl flex items-center gap-2 ${maisTab === 'estornos' && activeTab === 'mais' ? 'text-primary font-medium' : 'text-text'}`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Histórico de Estornos
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'em_aberto' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Pagamentos em Aberto</h2>
            <button
              onClick={loadPendingAppointments}
              className="text-sm text-primary hover:text-primary-hover transition-colors"
            >
              Atualizar
            </button>
          </div>

          {loadingPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : pendingApts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-accent/10">
              <DollarSign className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-text font-medium">Tudo em ordem!</p>
              <p className="text-text-muted text-sm mt-1">Nenhum pagamento pendente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApts.map((apt) => {
                const isOverdue = apt.status !== 'completed';
                const aptDate = new Date(apt.appointment_date + 'T12:00:00');
                return (
                  <div
                    key={apt.id}
                    className="bg-white rounded-xl border border-accent/10 shadow-card p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-orange-500' : 'text-amber-500'}`} />
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isOverdue ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {isOverdue ? 'Atendimento passado' : 'Inadimplente'}
                          </span>
                        </div>
                        <p className="font-semibold text-text truncate">{apt.patient?.full_name}</p>
                        <p className="text-sm text-text-muted truncate">{apt.procedure?.name}</p>
                        <p className="text-xs text-text-muted mt-1">
                          {aptDate.toLocaleDateString('pt-BR')} às {apt.appointment_time.substring(0, 5)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-text text-lg">
                          R$ {(apt.final_price ?? apt.procedure?.default_price ?? 0).toFixed(2)}
                        </p>
                        {apt.downpayment_amount > 0 && (
                          <p className="text-xs text-green-600">
                            Sinal: R$ {apt.downpayment_amount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSelectedApt(apt); setShowPaymentModal(true); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <DollarSign className="w-4 h-4" />
                        Registrar Pagamento
                      </button>
                      {apt.patient?.phone && (
                        <a
                          href={formatWhatsAppUrl(apt.patient.phone, `Olá ${apt.patient.full_name?.split(' ')[0]}, passando para lembrar sobre o pagamento de ${apt.procedure?.name ?? 'serviço'} do dia ${aptDate.toLocaleDateString('pt-BR')}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'caixa' && <CashRegister />}

      {activeTab === 'despesas' && <Expenses />}

      {activeTab === 'mais' && (
        <div className="space-y-4">
          {/* Sub-tab switcher */}
          <div className="flex gap-2">
            <button
              onClick={() => setMaisTab('creditos')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                maisTab === 'creditos'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text border-accent/15 hover:bg-champagne-nuvem'
              }`}
            >
              <Star className="w-4 h-4" />
              Créditos
            </button>
            <button
              onClick={() => setMaisTab('estornos')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                maisTab === 'estornos'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text border-accent/15 hover:bg-champagne-nuvem'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Estornos
            </button>
          </div>

          {maisTab === 'creditos' && (
            <div>
              <h2 className="text-lg font-semibold text-text mb-4">Créditos de Clientes</h2>
              {loadingCredits ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : credits.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-accent/10">
                  <Star className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                  <p className="text-text-muted">Nenhum crédito ativo no momento</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {credits.map((credit) => (
                    <div key={credit.id} className="bg-white rounded-xl border border-accent/10 p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-text">{credit.patient?.full_name}</p>
                          {credit.source_appointment?.procedure && (
                            <p className="text-sm text-text-muted">{credit.source_appointment.procedure.name}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-blue-600 text-lg">
                            R$ {credit.amount_remaining.toFixed(2)}
                          </p>
                          {credit.amount_original !== credit.amount_remaining && (
                            <p className="text-xs text-text-muted">
                              de R$ {credit.amount_original.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted">
                        <span>Criado em {new Date(credit.created_at).toLocaleDateString('pt-BR')}</span>
                        {credit.expires_at && (
                          <span className="text-orange-600">
                            Vence em {new Date(credit.expires_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {maisTab === 'estornos' && (
            <div>
              <h2 className="text-lg font-semibold text-text mb-4">Histórico de Estornos</h2>
              {loadingReversals ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : reversals.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-accent/10">
                  <RotateCcw className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                  <p className="text-text-muted">Nenhum estorno registrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reversals.map((rev) => (
                    <div key={rev.id} className="bg-white rounded-xl border border-red-100 p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-text">
                            {rev.appointment?.patient?.full_name ?? '—'}
                          </p>
                          <p className="text-sm text-text-muted">{rev.appointment?.procedure?.name}</p>
                          {rev.reversal_reason && (
                            <p className="text-xs text-text-muted mt-1 italic">"{rev.reversal_reason}"</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600 text-lg">
                            − R$ {rev.amount.toFixed(2)}
                          </p>
                          {rev.reversal_type && (
                            <p className="text-xs text-text-muted capitalize">{rev.reversal_type}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-text-muted">
                        {new Date(rev.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                        {rev.appointment?.appointment_date && (
                          <> · Atend. {new Date(rev.appointment.appointment_date + 'T12:00:00').toLocaleDateString('pt-BR')}</>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment Modal for pending appointments */}
      {selectedApt && showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setSelectedApt(null); }}
          appointmentId={selectedApt.id}
          patientId={selectedApt.patient_id}
          patientName={selectedApt.patient?.full_name ?? ''}
          procedureName={selectedApt.procedure?.name ?? ''}
          totalAmount={
            (selectedApt.procedure?.is_variable_price && selectedApt.final_price == null)
              ? 0
              : (selectedApt.final_price ?? selectedApt.procedure?.default_price ?? 0)
          }
          downpaymentAmount={selectedApt.downpayment_amount}
          isVariablePrice={selectedApt.procedure?.is_variable_price ?? false}
          minPrice={selectedApt.procedure?.min_price}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedApt(null);
            loadPendingAppointments();
            showToast('success', 'Pagamento registrado!', 'O pagamento foi salvo com sucesso.');
          }}
        />
      )}

      {ToastComponent}
    </div>
  );
}
