import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PLANS, PlanId, isSubscriptionActive } from '../lib/plans';

export function usePlan() {
  const { subscription, session, isSuperAdmin, refreshSubscription } = useAuth();

  const planId: PlanId = subscription?.plan_id ?? 'starter';
  const plan = PLANS[planId];
  const status = subscription?.status ?? 'active';
  const isActive = isSubscriptionActive(status);
  const isTrialing = status === 'trialing';
  const isPastDue = status === 'past_due';
  const isCanceled = status === 'canceled' || status === 'unpaid';

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
      if (!session?.access_token) return;

      try {
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: { plan_id: targetPlanId },
          headers: { Authorization: `Bearer ${session.access_token}` },
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
    [isSuperAdmin, session]
  );

  const openBillingPortal = useCallback(async () => {
    if (!isSuperAdmin) return;
    if (!session?.access_token) return;

    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Billing portal error:', err);
      throw err;
    }
  }, [isSuperAdmin, session]);

  return {
    plan,
    planId,
    status,
    isActive,
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
