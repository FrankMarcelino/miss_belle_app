import { useEffect, useState } from 'react';
import { Sparkles, Building2, Scissors, CalendarCheck, ArrowRight, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';

const STORAGE_KEY = (tenantId: string) => `onboarding_done_${tenantId}`;

export default function OnboardingWizard() {
  const { isSuperAdmin, tenantId, user } = useAuth();
  const { navigate } = useRouter();

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — nome da clínica
  const [clinicName, setClinicName] = useState('');

  // Step 2 — primeiro serviço
  const [serviceName, setServiceName] = useState('');
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!isSuperAdmin || !tenantId) return;
    if (localStorage.getItem(STORAGE_KEY(tenantId))) return;

    // Verificar se já tem agendamentos
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => {
        if (count === 0) {
          // Carregar nome atual da clínica
          supabase
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single()
            .then(({ data }) => {
              if (data?.name) setClinicName(data.name);
              setVisible(true);
            });
        }
      });
  }, [isSuperAdmin, tenantId]);

  function dismiss() {
    if (tenantId) localStorage.setItem(STORAGE_KEY(tenantId), '1');
    setVisible(false);
  }

  async function handleStep1() {
    if (!clinicName.trim()) { setError('Informe o nome da clínica.'); return; }
    setError('');
    setSaving(true);
    try {
      await supabase.from('tenants').update({ name: clinicName.trim() }).eq('id', tenantId!);
      setStep(2);
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2() {
    if (!serviceName.trim()) { setError('Informe o nome do serviço.'); return; }
    setError('');
    setSaving(true);
    try {
      await supabase.from('procedures').insert({
        name: serviceName.trim(),
        duration_minutes: duration,
        default_price: parseFloat(price) || 0,
        is_active: true,
        is_variable_price: false,
        created_by: user!.id,
      });
      setStep(3);
    } catch {
      setError('Erro ao criar serviço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function goToAgenda() {
    dismiss();
    navigate('/agenda-geral');
  }

  function goToUsers() {
    dismiss();
    navigate('/usuarios');
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-champagne-nuvem">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 px-8 pt-8 pb-6 text-center">
          <div className="w-14 h-14 bg-primary/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
            {step === 1 && <Building2 className="w-7 h-7 text-primary" />}
            {step === 2 && <Scissors className="w-7 h-7 text-primary" />}
            {step === 3 && <Sparkles className="w-7 h-7 text-primary" />}
          </div>
          <div className="text-xs text-text-muted font-medium mb-1">Passo {step} de 3</div>
          <h2 className="text-xl font-bold text-text">
            {step === 1 && 'Bem-vinda ao Miss Belle!'}
            {step === 2 && 'Crie seu primeiro serviço'}
            {step === 3 && 'Tudo pronto!'}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {step === 1 && 'Vamos configurar sua clínica em 3 passos rápidos.'}
            {step === 2 && 'Adicione o primeiro procedimento que você oferece.'}
            {step === 3 && 'Sua clínica está configurada. Por onde quer começar?'}
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6">

          {/* Step 1 — Nome da clínica */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  Nome da clínica
                </label>
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
                  placeholder="Ex: Studio Ana Silva"
                  className="w-full px-4 py-2.5 rounded-xl border border-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleStep1}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><span>Continuar</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <button onClick={dismiss} className="w-full text-center text-sm text-text-muted hover:text-text py-1">
                Pular configuração por agora
              </button>
            </div>
          )}

          {/* Step 2 — Primeiro serviço */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">
                  Nome do serviço
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Ex: Corte feminino"
                  className="w-full px-4 py-2.5 rounded-xl border border-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">
                    Duração (min)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    min={15}
                    step={15}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                    className="w-full px-4 py-2.5 rounded-xl border border-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    value={price}
                    min={0}
                    step={0.01}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-4 py-2.5 rounded-xl border border-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleStep2}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><span>Criar serviço</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <button onClick={() => setStep(3)} className="w-full text-center text-sm text-text-muted hover:text-text py-1">
                Pular este passo
              </button>
            </div>
          )}

          {/* Step 3 — Tudo pronto */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm text-green-800 font-medium">
                  Clínica configurada com sucesso!
                </p>
              </div>

              <button
                onClick={goToAgenda}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                <CalendarCheck className="w-4 h-4" />
                Criar primeiro agendamento
              </button>

              <button
                onClick={goToUsers}
                className="w-full flex items-center justify-center gap-2 bg-champagne-nuvem hover:bg-accent/20 text-text py-3 rounded-xl font-semibold border border-accent/20 transition-colors"
              >
                <Scissors className="w-4 h-4" />
                Convidar profissional
              </button>

              <button onClick={dismiss} className="w-full text-center text-sm text-text-muted hover:text-text py-1">
                Explorar o sistema
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
