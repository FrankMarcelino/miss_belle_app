import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export type EmailType =
  | 'welcome'
  | 'plan_upgraded'
  | 'trial_expiring'
  | 'payment_failed'

interface SendEmailPayload {
  type: EmailType
  to: string
  data?: Record<string, string | number>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Apenas service_role pode chamar esta função internamente
  // (webhooks e outras edge functions) — sem verificação de JWT de usuário.
  // Para chamadas internas, usar supabase admin client ou service_role header.

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
    if (!resendApiKey) {
      return json({ error: 'RESEND_API_KEY não configurada' }, 500, corsHeaders)
    }

    const fromEmail = Deno.env.get('EMAIL_FROM') ?? 'Miss Belle <noreply@missebelle.app>'
    const appUrl    = Deno.env.get('APP_URL')    ?? 'https://missebelle.app'

    const payload: SendEmailPayload = await req.json()
    const { type, to, data = {} } = payload

    if (!type || !to) {
      return json({ error: 'type e to são obrigatórios' }, 400, corsHeaders)
    }

    const { subject, html } = buildEmail(type, data, appUrl)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return json({ error: 'Falha ao enviar email', detail: err }, 502, corsHeaders)
    }

    const result = await res.json()
    console.log(`Email sent [${type}] to ${to}:`, result.id)
    return json({ sent: true, id: result.id }, 200, corsHeaders)

  } catch (err) {
    console.error('send-email error:', err)
    return json({ error: err.message }, 500, corsHeaders)
  }
})

// ─── Templates ────────────────────────────────────────────────────────────────

function buildEmail(
  type: EmailType,
  data: Record<string, string | number>,
  appUrl: string
): { subject: string; html: string } {
  switch (type) {

    case 'welcome':
      return {
        subject: 'Bem-vinda ao Miss Belle! 🌸',
        html: layout(`
          <h1>Bem-vinda, ${data.name ?? 'você'}! 🌸</h1>
          <p>Sua conta no <strong>Miss Belle</strong> está pronta.</p>
          <p>Gerencie sua agenda, clientes e financeiro em um só lugar — de qualquer dispositivo.</p>
          <a href="${appUrl}" class="btn">Acessar o sistema</a>
          <p style="margin-top:24px; color:#9B8E8E; font-size:13px;">
            Você tem <strong>14 dias grátis</strong> no plano Pro para explorar todas as funcionalidades.
          </p>
        `),
      }

    case 'plan_upgraded':
      return {
        subject: `Plano ${data.plan ?? ''} ativado com sucesso! ✅`,
        html: layout(`
          <h1>Plano ativado! ✅</h1>
          <p>Seu plano <strong>${data.plan ?? ''}</strong> foi ativado com sucesso.</p>
          <p>Agora você tem acesso completo a todas as funcionalidades incluídas no plano.</p>
          <a href="${appUrl}/plano" class="btn">Ver meu plano</a>
          ${data.trial_ends_at ? `
          <p style="margin-top:16px; color:#9B8E8E; font-size:13px;">
            Seu período trial termina em <strong>${data.trial_ends_at}</strong>.
            Você não será cobrado antes disso.
          </p>` : ''}
        `),
      }

    case 'trial_expiring':
      return {
        subject: `Seu trial expira em ${data.days_left ?? 7} dias ⏰`,
        html: layout(`
          <h1>Seu trial está acabando ⏰</h1>
          <p>Faltam apenas <strong>${data.days_left ?? 7} dias</strong> para o seu período trial terminar.</p>
          <p>Para continuar usando o Miss Belle sem interrupção, assine um dos planos pagos.</p>
          <a href="${appUrl}/plano" class="btn">Ver planos</a>
          <p style="margin-top:16px; color:#9B8E8E; font-size:13px;">
            Se você não assinar, sua conta voltará automaticamente para o plano Starter
            com funcionalidades limitadas.
          </p>
        `),
      }

    case 'payment_failed':
      return {
        subject: 'Problema no pagamento da sua assinatura ⚠️',
        html: layout(`
          <h1>Pagamento não processado ⚠️</h1>
          <p>Não conseguimos processar o pagamento da sua assinatura Miss Belle.</p>
          <p>Para evitar a suspensão do acesso, atualize seu método de pagamento.</p>
          <a href="${appUrl}/plano" class="btn">Atualizar pagamento</a>
          <p style="margin-top:16px; color:#9B8E8E; font-size:13px;">
            Se o problema persistir, o acesso às funcionalidades pagas será suspenso
            automaticamente após alguns dias.
          </p>
        `),
      }

    default:
      return { subject: 'Miss Belle', html: layout('<p>Mensagem do Miss Belle.</p>') }
  }
}

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; background:#F9F5F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#2D2424; }
    .wrapper { max-width:520px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg,#C4956A,#E8D5B5); padding:32px 40px; text-align:center; }
    .header-title { color:#fff; font-size:22px; font-weight:700; letter-spacing:-0.3px; margin:0; }
    .body { padding:32px 40px; }
    h1 { font-size:20px; font-weight:700; margin:0 0 12px; }
    p { font-size:15px; line-height:1.6; color:#5C4E4E; margin:0 0 12px; }
    .btn { display:inline-block; margin:20px 0; padding:12px 28px; background:#C4956A; color:#fff; text-decoration:none; border-radius:10px; font-weight:600; font-size:15px; }
    .footer { padding:20px 40px; border-top:1px solid #F0E8DC; text-align:center; font-size:12px; color:#B8A89A; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="header-title">Miss Belle 🌸</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      Miss Belle — Sistema de gestão para clínicas de estética<br>
      <a href="{{unsubscribe}}" style="color:#B8A89A;">Cancelar notificações</a>
    </div>
  </div>
</body>
</html>`
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
