import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { usePlan } from '../hooks/usePlan';
import { PLANS, PlanId } from '../lib/plans';
import { useAuth } from '../contexts/AuthContext';

const FEATURE_CONFIG: Record<string, {
  title: string;
  description: string;
  requiredPlan: PlanId;
}> = {
  financeiro: {
    title: 'Controle Financeiro',
    description: 'Acesse o caixa, gerencie pagamentos, estornos e relatórios financeiros completos.',
    requiredPlan: 'pro',
  },
  dashboard: {
    title: 'Dashboard Executivo',
    description: 'Visualize métricas, gráficos de receita e análises do seu negócio em tempo real.',
    requiredPlan: 'clinic',
  },
  credits: {
    title: 'Créditos de Clientes',
    description: 'Gerencie créditos de clientes provenientes de estornos ou cancelamentos.',
    requiredPlan: 'pro',
  },
  professionals: {
    title: 'Mais Profissionais',
    description: 'Adicione mais profissionais à sua clínica e gerencie a equipe completa.',
    requiredPlan: 'clinic',
  },
};

interface UpgradePromptProps {
  feature: string;
  /** Se true, renderiza como bloco inline (sem altura de tela cheia) */
  inline?: boolean;
}

export default function UpgradePrompt({ feature, inline = false }: UpgradePromptProps) {
  const { startCheckout } = usePlan();
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const config = FEATURE_CONFIG[feature] ?? {
    title: 'Recurso Premium',
    description: 'Este recurso está disponível em planos pagos.',
    requiredPlan: 'pro' as PlanId,
  };

  const requiredPlan = PLANS[config.requiredPlan];

  async function handleUpgrade() {
    setLoading(true);
    try {
      await startCheckout(config.requiredPlan);
    } catch {
      setLoading(false);
    }
  }

  const content = (
    <div className="text-center max-w-sm mx-auto">
      <div className="w-14 h-14 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Lock className="w-6 h-6 text-accent" />
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">{config.title}</h3>
      <p className="text-text-muted text-sm leading-relaxed mb-6">
        {config.description}
      </p>
      <div className="bg-champagne-nuvem rounded-xl px-4 py-3 mb-6 text-sm text-text-light">
        Disponível no plano{' '}
        <span className="font-semibold text-text">{requiredPlan.label}</span>
        {requiredPlan.price > 0 && (
          <> — R$ {requiredPlan.price}/mês</>
        )}
      </div>
      {isSuperAdmin ? (
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-soft disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          {loading ? 'Redirecionando...' : `Fazer Upgrade para ${requiredPlan.label}`}
        </button>
      ) : (
        <p className="text-xs text-text-muted">
          Peça ao administrador da clínica para fazer o upgrade.
        </p>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="bg-white rounded-2xl border border-accent/10 shadow-card p-8">
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      {content}
    </div>
  );
}
