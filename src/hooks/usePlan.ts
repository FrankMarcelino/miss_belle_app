import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PLANS, PlanId, isSubscriptionActive } from '../lib/plans';

export function usePlan() {
  const { subscription, isSuperAdmin, refreshSubscription } = useAuth();

  const isExempt = subscription?.is_exempt ?? false;

  // Clínica isenta (owner) recebe plano Clínica completo sem cobrar
  const planId: PlanId = isExempt ? 'clinic' : (subscription?.plan_id ?? 'starter');
  const plan = PLANS[planId];
  const status = isExempt ? 'active' : (subscription?.status ?? 'active');
  const isActive = isExempt || isSubscriptionActive(status);
  const isTrialing = !isExempt && status === 'trialing';
  const isPastDue = !isExempt && status === 'past_due';
  const isCanceled = !isExempt && (status === 'canceled' || status === 'unpaid');

  const trialDaysLeft = (() => {
    if (!isTrialing || !subscription?.trial_ends_at) return 0;
    const diff = new Date(subscription.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const hasFeature = useCallback(
    (feature: keyof typeof plan.features): boolean => {
      if (!isActive) return false;
      return plan.features[feature];
    },
    [plan, isActive]
  );

  const canAddProfessional = useCallback(
    (currentCount: number): boolean => {
      if (!isActive) return false;
      return currentCount < plan.maxProfessionals;
    },
    [plan, isActive]
  );

  const canAddAppointment = useCallback(
    (monthlyCount: number): boolean => {
      if (!isActive) return false;
      return monthlyCount < plan.maxAppointmentsPerMonth;
    },
    [plan, isActive]
  );

  const startCheckout = useCallback(
    async (targetPlanId: PlanId) => {
      if (!isSuperAdmin) return;

      try {
        // supabase.functions.invoke injeta o token da sessão atual automaticamente
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: { plan_id: targetPlanId },
        });

        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        console.error('Checkout error:', err);
        throw err;
      }
    },
    [isSuperAdmin]
  );

  const openBillingPortal = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session');

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Billing portal error:', err);
      throw err;
    }
  }, [isSuperAdmin]);

  return {
    plan,
    planId,
    status,
    isActive,
    isExempt,
    isTrialing,
    isPastDue,
    isCanceled,
    trialDaysLeft,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    hasFeature,
    canAddProfessional,
    canAddAppointment,
    startCheckout,
    openBillingPortal,
    refreshSubscription,
  };
}
