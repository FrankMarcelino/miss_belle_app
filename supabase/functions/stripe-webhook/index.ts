import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
  })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Validar assinatura do Stripe
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  let event: Stripe.Event

  try {
    const body = await req.text()
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret)
  } catch (err) {
    console.error('Webhook signature invalid:', err.message)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  console.log(`Processing Stripe event: ${event.type}`)

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const tenantId = session.metadata?.tenant_id
        if (!tenantId) {
          console.error('Missing tenant_id in checkout session metadata', session.id)
          break
        }

        const stripeSubId = session.subscription as string
        const stripeSub   = await stripe.subscriptions.retrieve(stripeSubId)

        // Derivar plan_id pelo price_id (não depende do metadata)
        const priceId = stripeSub.items.data[0]?.price.id
        const planId  = getPlanIdByPrice(priceId) || session.metadata?.plan_id || 'pro'

        const status      = mapStripeStatus(stripeSub.status)
        const trialEndsAt = stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000).toISOString()
          : null
        const periodStart = new Date(stripeSub.current_period_start * 1000).toISOString()
        const periodEnd   = new Date(stripeSub.current_period_end   * 1000).toISOString()

        console.log(`Updating subscription: tenant=${tenantId} plan=${planId} status=${status}`)

        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            stripe_subscription_id: stripeSubId,
            stripe_customer_id:     session.customer as string,
            plan_id:                planId,
            status,
            trial_ends_at:          trialEndsAt,
            current_period_start:   periodStart,
            current_period_end:     periodEnd,
            cancel_at_period_end:   stripeSub.cancel_at_period_end,
          })
          .eq('tenant_id', tenantId)

        if (updateError) {
          console.error('Failed to update subscription:', updateError)
        } else {
          console.log('Subscription updated successfully')
        }

        break
      }

      case 'customer.subscription.updated': {
        const sub      = event.data.object as Stripe.Subscription
        const tenantId = sub.metadata?.tenant_id ?? await getTenantIdByCustomer(supabaseAdmin, sub.customer as string)
        if (!tenantId) break

        const priceId = sub.items.data[0]?.price.id
        const planId  = getPlanIdByPrice(priceId)

        await supabaseAdmin
          .from('subscriptions')
          .update({
            plan_id:              planId,
            status:               mapStripeStatus(sub.status),
            trial_ends_at:        sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq('tenant_id', tenantId)

        break
      }

      case 'customer.subscription.deleted': {
        const sub      = event.data.object as Stripe.Subscription
        const tenantId = sub.metadata?.tenant_id ?? await getTenantIdByCustomer(supabaseAdmin, sub.customer as string)
        if (!tenantId) break

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status:      'canceled',
            canceled_at: new Date().toISOString(),
            plan_id:     'starter',
          })
          .eq('tenant_id', tenantId)

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const sub      = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const tenantId = sub.metadata?.tenant_id ?? await getTenantIdByCustomer(supabaseAdmin, sub.customer as string)
        if (!tenantId) break

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status:               'active',
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq('tenant_id', tenantId)

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const sub      = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const tenantId = sub.metadata?.tenant_id ?? await getTenantIdByCustomer(supabaseAdmin, sub.customer as string)
        if (!tenantId) break

        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('tenant_id', tenantId)

        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    console.error(`Error processing event ${event.type}:`, err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})

function mapStripeStatus(status: string): string {
  const map: Record<string, string> = {
    active:             'active',
    trialing:           'trialing',
    past_due:           'past_due',
    canceled:           'canceled',
    unpaid:             'unpaid',
    incomplete:         'past_due',
    incomplete_expired: 'canceled',
    paused:             'past_due',
  }
  return map[status] ?? 'past_due'
}

function getPlanIdByPrice(priceId: string): string {
  const proPriceId    = Deno.env.get('STRIPE_PRICE_PRO')    ?? ''
  const clinicPriceId = Deno.env.get('STRIPE_PRICE_CLINIC') ?? ''
  if (priceId === proPriceId)    return 'pro'
  if (priceId === clinicPriceId) return 'clinic'
  return 'starter'
}

async function getTenantIdByCustomer(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()
  return data?.id ?? null
}
