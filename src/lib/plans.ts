export type PlanId = 'starter' | 'pro' | 'clinic';
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface PlanFeatures {
  financeiro: boolean;
  dashboard: boolean;
  credits: boolean;
}

export interface Plan {
  id: PlanId;
  label: string;
  price: number;              // 0 = grátis
  maxProfessionals: number;
  maxAppointmentsPerMonth: number; // Infinity = ilimitado
  features: PlanFeatures;
  highlight?: boolean;
  description: string;
  featureList: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    price: 0,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 30,
    description: 'Para profissionais autônomas começando.',
    features: { financeiro: false, dashboard: false, credits: false },
    featureList: [
      '1 profissional',
      'Até 30 agendamentos/mês',
      'Cadastro de clientes',
      'Agenda completa',
    ],
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    price: 79,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: Infinity,
    description: 'Para profissionais que querem crescer.',
    highlight: true,
    features: { financeiro: true, dashboard: false, credits: true },
    featureList: [
      '1 profissional',
      'Agendamentos ilimitados',
      'Financeiro completo (caixa, estornos)',
      'Créditos de clientes',
      'Suporte prioritário',
    ],
  },
  clinic: {
    id: 'clinic',
    label: 'Clínica',
    price: 159,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: Infinity,
    description: 'Para clínicas com equipe.',
    features: { financeiro: true, dashboard: true, credits: true },
    featureList: [
      'Até 5 profissionais',
      'Agendamentos ilimitados',
      'Financeiro completo (caixa, estornos)',
      'Dashboard executivo + gráficos',
      'Créditos de clientes',
      'Suporte prioritário',
    ],
  },
} as const;

export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'clinic'];

/** Retorna true se o plano `a` é melhor que o plano `b`. */
export function isPlanUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}

/** Status que indica assinatura funcional (acesso liberado). */
export function isSubscriptionActive(status: SubStatus): boolean {
  return status === 'active' || status === 'trialing';
}
