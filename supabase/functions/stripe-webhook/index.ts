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

        if (await isExempt(supabaseAdmin, tenantId)) {
          console.log(`Tenant ${tenantId} is exempt — skipping subscription update`)
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
          // Enviar email de confirmação de upgrade (fire-and-forget)
          const admin = await getSuperAdminEmail(supabaseAdmin, tenantId)
          if (admin) {
            const planLabel = planId === 'clinic' ? 'Clínica' : 'Pro'
            const trialDate = trialEndsAt
              ? new Date(trialEndsAt).toLocaleDateString('pt-BR')
              : null
            sendEmail('plan_upgraded', admin.email, {
              name: admin.name,
              plan: planLabel,
              ...(trialDate ? { trial_ends_at: trialDate } : {}),
            })
          }
        }

        break
      }

      case 'customer.subscription.updated': {
        const sub      = event.data.object as Stripe.Subscription
        const tenantId = sub.metadata?.tenant_id ?? await getTenantIdByCustomer(supabaseAdmin, sub.customer as string)
        if (!tenantId) break
        if (await isExempt(supabaseAdmin, tenantId)) { console.log(`Tenant ${tenantId} is exempt — skipping`); break }

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
        if (await isExempt(supabaseAdmin, tenantId)) { console.log(`Tenant ${tenantId} is exempt — skipping`); break }

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
        if (await isExempt(supabaseAdmin, tenantId)) { console.log(`Tenant ${tenantId} is exempt — skipping`); break }

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
        if (await isExempt(supabaseAdmin, tenantId)) { console.log(`Tenant ${tenantId} is exempt — skipping`); break }

        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('tenant_id', tenantId)

        // Enviar email de falha de pagamento (fire-and-forget)
        const admin = await getSuperAdminEmail(supabaseAdmin, tenantId)
        if (admin) sendEmail('payment_failed', admin.email, { name: admin.name })

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

async function isExempt(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('is_exempt')
    .eq('tenant_id', tenantId)
    .single()
  return data?.is_exempt === true
}

async function getSuperAdminEmail(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<{ email: string; name: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('tenant_id', tenantId)
    .eq('role', 'super_admin')
    .single()
  if (!data) return null
  return { email: data.email, name: data.full_name }
}

async function sendEmail(
  type: string,
  to: string,
  data: Record<string, string | number> = {}
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const appUrl       = Deno.env.get('APP_URL') ?? 'https://missebelle.app'
  const fromEmail    = Deno.env.get('EMAIL_FROM') ?? 'Miss Belle <noreply@missebelle.app>'

  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return
  }

  const templates: Record<string, { subject: string; body: string }> = {
    plan_upgraded: {
      subject: `Plano ${data.plan ?? ''} ativado com sucesso! ✅`,
      body: `<p>Olá, ${data.name ?? ''}!</p>
             <p>Seu plano <strong>${data.plan ?? ''}</strong> foi ativado com sucesso.</p>
             ${data.trial_ends_at ? `<p>Você tem trial gratuito até <strong>${data.trial_ends_at}</strong>.</p>` : ''}
             <p><a href="${appUrl}/plano" style="color:#C4956A;">Ver meu plano</a></p>`,
    },
    payment_failed: {
      subject: 'Problema no pagamento da sua assinatura ⚠️',
      body: `<p>Olá, ${data.name ?? ''}!</p>
             <p>Não conseguimos processar o pagamento da sua assinatura Miss Belle.</p>
             <p><a href="${appUrl}/plano" style="color:#C4956A;">Atualizar método de pagamento</a></p>`,
    },
  }

  const tpl = templates[type]
  if (!tpl) return

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#2D2424;max-width:500px;margin:40px auto;padding:24px">
    <h2 style="color:#C4956A">Miss Belle 🌸</h2>${tpl.body}
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee">
    <p style="font-size:12px;color:#999">Miss Belle — Sistema de gestão para clínicas de estética</p>
  </body></html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to, subject: tpl.subject, html }),
    })
    if (!res.ok) console.error('sendEmail failed:', await res.text())
    else console.log(`Email [${type}] sent to ${to}`)
  } catch (err) {
    console.error('sendEmail error:', err)
  }
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
