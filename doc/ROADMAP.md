# Miss Belle — Roadmap

> Atualizado em: 2026-03-22
> Status atual: Landing page + Sistema de assinaturas Stripe funcionando em produção.

---

## ✅ Concluído

- [x] Autenticação (login/signup) com Supabase
- [x] Multi-tenancy (tenant por clínica, RLS em todas as tabelas)
- [x] Agenda (dia/semana/mês, criação, edição, cancelamento, reagendamento)
- [x] Gestão de clientes e profissionais
- [x] Gestão de procedimentos com preço variável
- [x] Financeiro (caixa, estornos, créditos de clientes, despesas)
- [x] Dashboard executivo com gráficos
- [x] Landing page pública
- [x] Sistema de assinaturas Stripe (3 planos + trial 14 dias + webhooks)
- [x] Feature gating por plano (Financeiro, Dashboard, limite de profissionais)
- [x] Página /plano com gerenciamento de assinatura e portal de billing

---

## 🔴 Imediato — Antes de ir para produção real

### 1. Testar todos os fluxos de billing
- [ ] Cancelamento via portal de billing → verificar `cancel_at_period_end = true` no banco
- [ ] Falha de pagamento → usar cartão `4000 0000 0000 0341` → verificar banner "Pagamento pendente"
- [ ] Acesso bloqueado após cancelar → verificar redirect para `/plano`
- [ ] Reativação após past_due → atualizar cartão no portal → verificar `status = active`
- [ ] Downgrade de plano → verificar feature gates sendo aplicados

### 2. Cancelar assinatura de teste
- [ ] No Stripe Dashboard → cancelar a assinatura `sub_1TDo3vFS8R0qkWeepmyKu9jw` (teste)
- [ ] Confirmar que o banco volta para `plan_id = starter` via webhook

---

## 🟡 Alta Prioridade — Produto

### 3. Onboarding pós-cadastro
- [ ] Criar fluxo guiado para novo usuário (wizard de 3 passos)
  - Passo 1: Nome da clínica
  - Passo 2: Criar primeiro serviço/procedimento
  - Passo 3: Criar primeiro agendamento ou convidar profissional
- [ ] Mostrar apenas quando `appointments.count = 0` para o tenant

### 4. Email transacional
- [ ] Configurar provedor (Resend ou SendGrid)
- [ ] Edge Function: `send-email` reutilizável
- [ ] Email: boas-vindas após cadastro
- [ ] Email: confirmação de upgrade de plano
- [ ] Email: aviso 7 dias antes do trial expirar
- [ ] Email: aviso de falha de pagamento

### 5. Corrigir erros de TypeScript pré-existentes
- [ ] `Users.tsx` — atualizar chamadas `showToast` e `useToast` para API atual
- [ ] `Dashboard.tsx` — corrigir tipo do formatter do Recharts (linha 832)
- [ ] `CreateAppointmentForm.tsx` / `EditAppointmentForm.tsx` — corrigir tipos de procedures
- [ ] `TimeSlotPicker.tsx` — corrigir type assertions
- [ ] `appointmentUtils.ts` — tratar `null` no argumento de string

---

## 🟢 Crescimento

### 6. SEO da landing page
- [ ] Meta tags (title, description, og:image, og:title)
- [ ] Favicon personalizado (substituir o padrão do Vite)
- [ ] OG image (1200x630) com logo Miss Belle
- [ ] Sitemap.xml e robots.txt

### 7. Plano anual com desconto
- [ ] Adicionar preços anuais no Stripe (ex: 2 meses grátis = ~16% off)
- [ ] Toggle mensal/anual na seção de pricing da landing page
- [ ] Toggle mensal/anual na página `/plano`

### 8. Métricas SaaS no painel admin
- [ ] MRR (Monthly Recurring Revenue) por plano
- [ ] Total de tenants ativos por plano
- [ ] Taxa de conversão trial → pago
- [ ] Churn mensal
- [ ] Página `/admin` acessível apenas para um super_admin global (fora dos tenants)

### 9. Melhorias de UX
- [ ] Skeleton loaders nas listas (agenda, clientes, financeiro)
- [ ] Pull-to-refresh no mobile
- [ ] Notificações push para lembretes de agendamento (PWA)
- [ ] Modo PWA (manifest.json + service worker)

### 10. Multi-tenant avançado
- [ ] Slug personalizado por clínica (ex: `misseblle.app/clinica-da-ana`)
- [ ] Logo e cores personalizadas por clínica (white-label básico)
- [ ] Página pública de agendamento online para clientes finais

---

## 📋 Débito técnico

| Item | Arquivo | Prioridade |
|---|---|---|
| Erros de TypeScript (useToast API) | `Users.tsx` | Alta |
| Erros de TypeScript (Recharts) | `Dashboard.tsx` | Média |
| Chunk size warning no build | `vite.config.ts` | Baixa |
| Sem testes automatizados | geral | Média |
| Sem error boundary global | `App.tsx` | Média |
| Sem rate limiting nas Edge Functions | `create-checkout-session` | Alta |

---

## 🏗️ Arquitetura — Decisões pendentes

| Decisão | Opções | Impacto |
|---|---|---|
| Email provider | Resend vs SendGrid | Edge Functions |
| Agendamento online público | Rota pública + auth anônimo | Multi-tenant slug |
| Plano anual | Stripe Prices + toggle UI | Conversão |
| Admin global (owner) | Role especial fora de tenant | Métricas SaaS |
