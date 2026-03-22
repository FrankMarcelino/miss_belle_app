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
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return json({ error: 'Somente o administrador pode acessar o portal de billing' }, 403, corsHeaders)
    }

    // Buscar stripe_customer_id do tenant
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', profile.tenant_id)
      .single()

    if (!tenant?.stripe_customer_id) {
      return json({ error: 'Nenhuma assinatura encontrada. Faça upgrade primeiro.' }, 400, corsHeaders)
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   tenant.stripe_customer_id,
      return_url: `${appUrl}/plano`,
    })

    return json({ url: portalSession.url }, 200, corsHeaders)

  } catch (err) {
    console.error('create-billing-portal-session error:', err)
    return json({ error: err.message }, 500, corsHeaders)
  }
})

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
