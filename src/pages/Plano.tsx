import { useState } from 'react';
import {
  CheckCircle, AlertCircle, Clock, XCircle,
  ArrowRight, Loader2, ExternalLink, Shield
} from 'lucide-react';
import { usePlan } from '../hooks/usePlan';
import { useAuth } from '../contexts/AuthContext';
import { PLANS, PLAN_ORDER, isPlanUpgrade } from '../lib/plans';

export default function Plano() {
  const { plan, planId, isExempt, isTrialing, isPastDue, isCanceled, trialDaysLeft,
          cancelAtPeriodEnd, startCheckout, openBillingPortal } = usePlan();
  const { subscription, isSuperAdmin } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCheckout(targetPlanId: string) {
    setError('');
    setCheckoutLoading(targetPlanId);
    try {
      await startCheckout(targetPlanId as never);
    } catch {
      setError('Erro ao redirecionar para o checkout. Tente novamente.');
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setError('');
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch {
      setError('Erro ao abrir o portal de billing. Tente novamente.');
      setPortalLoading(false);
    }
  }

  const StatusBadge = () => {
    if (isTrialing) {
      return (
        <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-sm font-medium px-3 py-1.5 rounded-full border border-amber-200">
          <Clock className="w-3.5 h-3.5" />
          Trial — {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''} restante{trialDaysLeft !== 1 ? 's' : ''}
        </div>
      );
    }
    if (isPastDue) {
      return (
        <div className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 text-sm font-medium px-3 py-1.5 rounded-full border border-red-200">
          <AlertCircle className="w-3.5 h-3.5" />
          Pagamento pendente
        </div>
      );
    }
    if (isCanceled) {
      return (
        <div className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-full">
          <XCircle className="w-3.5 h-3.5" />
          Cancelado
        </div>
      );
    }
    if (cancelAtPeriodEnd) {
      return (
        <div className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-sm font-medium px-3 py-1.5 rounded-full border border-orange-200">
          <Clock className="w-3.5 h-3.5" />
          Cancela ao final do período
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-sm font-medium px-3 py-1.5 rounded-full border border-green-200">
        <CheckCircle className="w-3.5 h-3.5" />
        Ativo
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Meu Plano</h1>
        <p className="text-text-muted mt-1">Gerencie sua assinatura do Miss Belle</p>
      </div>

      {/* Alerta de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Plano atual */}
      <div className="bg-white rounded-2xl border border-accent/10 shadow-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-text-muted mb-1">Plano atual</p>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-text">{plan.label}</h2>
              {isExempt ? (
                <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium px-3 py-1.5 rounded-full border border-primary/20">
                  <Shield className="w-3.5 h-3.5" />
                  Conta da proprietária
                </div>
              ) : <StatusBadge />}
            </div>
            {!isExempt && plan.price > 0 && (
              <p className="text-text-muted text-sm mt-1">
                R$ {plan.price}/mês
                {subscription?.current_period_end && (
                  <> · Próxima cobrança em{' '}
                    {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
                  </>
                )}
              </p>
            )}
            {planId === 'starter' && (
              <p className="text-text-muted text-sm mt-1">Gratuito para sempre</p>
            )}
          </div>

          {/* Botão portal de billing (só super_admin com assinatura paga e não isenta) */}
          {isSuperAdmin && !isExempt && subscription?.stripe_subscription_id && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 bg-champagne-nuvem hover:bg-accent/20 text-text text-sm font-medium px-4 py-2.5 rounded-xl transition-colors border border-accent/20"
            >
              {portalLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              {portalLoading ? 'Abrindo...' : 'Gerenciar Assinatura'}
            </button>
          )}
        </div>

        {/* Aviso past_due */}
        {isPastDue && isSuperAdmin && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <strong>Atenção:</strong> Há uma falha no pagamento. Clique em "Gerenciar Assinatura"
            para atualizar seu método de pagamento e evitar a suspensão da conta.
          </div>
        )}

        {/* Aviso trial */}
        {isTrialing && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            Seu período de trial termina em <strong>{trialDaysLeft} dias</strong>.
            Após esse período, você será cobrado automaticamente. Cancele a qualquer momento pelo portal.
          </div>
        )}

        {/* Aviso cancelamento agendado */}
        {cancelAtPeriodEnd && subscription?.current_period_end && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
            Sua assinatura será cancelada em{' '}
            <strong>{new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}</strong>.
            Você terá acesso às funcionalidades até essa data.
          </div>
        )}
      </div>

      {/* Tabela de planos */}
      <div>
        <h2 className="text-lg font-semibold text-text mb-4">
          {isCanceled || planId === 'starter' ? 'Escolha um plano' : 'Comparar planos'}
        </h2>

        <div className="grid sm:grid-cols-3 gap-4">
          {PLAN_ORDER.map((pid) => {
            const p = PLANS[pid];
            const isCurrent = pid === planId;
            const isUpgrade = isPlanUpgrade(planId, pid);
            const isDowngrade = isPlanUpgrade(pid, planId);

            return (
              <div
                key={pid}
                className={`relative bg-white rounded-2xl border-2 p-6 transition-all ${
                  p.highlight && !isCurrent
                    ? 'border-primary shadow-soft-lg'
                    : isCurrent
                    ? 'border-green-300 shadow-soft'
                    : 'border-accent/15 shadow-card'
                }`}
              >
                {p.highlight && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Popular
                    </span>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Plano atual
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-lg font-bold text-text">{p.label}</h3>
                  <div className="mt-1">
                    {p.price === 0 ? (
                      <span className="text-2xl font-bold text-text">Grátis</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-text">R$ {p.price}</span>
                        <span className="text-text-muted text-sm">/mês</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1">{p.description}</p>
                </div>

                <ul className="space-y-2 mb-6">
                  {p.featureList.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-light">
                      <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isSuperAdmin && !isExempt && !isCurrent && pid !== 'starter' && (
                  <button
                    onClick={() => handleCheckout(pid)}
                    disabled={!!checkoutLoading}
                    className={`w-full flex items-center justify-center gap-2 font-medium py-2.5 rounded-xl transition-colors text-sm ${
                      isUpgrade
                        ? 'bg-primary hover:bg-primary-hover text-white shadow-soft'
                        : 'bg-champagne-nuvem hover:bg-accent/20 text-text border border-accent/20'
                    } disabled:opacity-60`}
                  >
                    {checkoutLoading === pid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    {checkoutLoading === pid
                      ? 'Redirecionando...'
                      : isUpgrade
                      ? `Fazer Upgrade`
                      : isDowngrade
                      ? 'Fazer Downgrade'
                      : 'Selecionar'}
                  </button>
                )}

                {isSuperAdmin && isCurrent && pid !== 'starter' && (
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading}
                    className="w-full flex items-center justify-center gap-2 bg-champagne-nuvem text-text-muted text-sm font-medium py-2.5 rounded-xl border border-accent/15"
                  >
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Gerenciar
                  </button>
                )}

                {isSuperAdmin && isCurrent && pid === 'starter' && (
                  <div className="w-full text-center text-xs text-text-muted py-2.5">
                    Plano atual
                  </div>
                )}

                {!isSuperAdmin && !isCurrent && (
                  <div className="w-full text-center text-xs text-text-muted py-2.5">
                    Peça ao admin para fazer o upgrade
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Nota de segurança */}
      <div className="flex items-start gap-3 text-sm text-text-muted">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent" />
        <p>
          Pagamentos processados com segurança pelo Stripe. Você pode cancelar ou alterar seu plano
          a qualquer momento pelo portal de billing. O acesso continua até o final do período pago.
        </p>
      </div>
    </div>
  );
}
