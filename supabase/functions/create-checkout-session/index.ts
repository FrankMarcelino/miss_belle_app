import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Client com token do usuário — padrão oficial Supabase para Edge Functions
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      return json({ error: 'Não autorizado' }, 401, corsHeaders)
    }

    // Admin client para operações privilegiadas (sem RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verificar se é super_admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return json({ error: 'Somente o administrador pode gerenciar assinaturas' }, 403, corsHeaders)
    }

    const { plan_id } = await req.json()

    // Mapa de preços lido dentro do handler (após módulo inicializar)
    const priceMap: Record<string, string> = {
      pro:    Deno.env.get('STRIPE_PRICE_PRO')    ?? '',
      clinic: Deno.env.get('STRIPE_PRICE_CLINIC') ?? '',
    }

    const priceId = priceMap[plan_id]
    if (!plan_id || !priceId) {
      return json({ error: 'Plano inválido ou preço não configurado' }, 400, corsHeaders)
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    // Buscar ou criar Stripe Customer para o tenant
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name, stripe_customer_id')
      .eq('id', profile.tenant_id)
      .single()

    let stripeCustomerId = tenant?.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: tenant?.name ?? profile.full_name,
        metadata: { tenant_id: profile.tenant_id },
      })
      stripeCustomerId = customer.id

      await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', profile.tenant_id)
    }

    // Verificar se já existe assinatura ativa no Stripe
    const { data: currentSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, plan_id, status')
      .eq('tenant_id', profile.tenant_id)
      .single()

    // Se já tem assinatura Stripe ativa, abrir billing portal
    if (currentSub?.stripe_subscription_id &&
        (currentSub.status === 'active' || currentSub.status === 'trialing')) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${appUrl}/plano`,
      })
      return json({ url: portalSession.url, type: 'portal' }, 200, corsHeaders)
    }

    // Criar Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenant_id: profile.tenant_id, plan_id },
      },
      success_url: `${appUrl}/?checkout=success&plan=${plan_id}`,
      cancel_url: `${appUrl}/plano`,
      metadata: { tenant_id: profile.tenant_id, plan_id },
      allow_promotion_codes: true,
    })

    return json({ url: session.url, type: 'checkout' }, 200, corsHeaders)

  } catch (err) {
    console.error('create-checkout-session error:', err)
    return json({ error: err.message }, 500, corsHeaders)
  }
})

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
