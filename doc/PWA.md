# Miss Belle — PWA (Progressive Web App)

> Criado em: 2026-03-22
> Decisão: transformar o app web em PWA instalável no iOS e Android
> Responsável técnico: Frank Marcelino

---

## 1. Decisão e Justificativa

### Por que PWA e não app nativo?

| Critério | PWA | React Native | Flutter |
|---|---|---|---|
| Reaproveitamento de código | **100%** | ~50% (só lógica) | 0% |
| Tempo de implementação | **1–2 dias** | 2–4 meses | 6–12 meses |
| Manutenção | **Um codebase** | Dois codebases | Dois codebases |
| Deploy | **Igual ao web** | App Store review (dias) | App Store review (dias) |
| Custo | **Zero** | US$ 99/ano (Apple) + US$ 25 (Google) | idem |
| Performance | Boa (WebView) | Excelente | Excelente |
| Acesso offline | ✅ | ✅ | ✅ |
| Push notifications | ✅ (Web Push) | ✅ | ✅ |
| Câmera / NFC / Bluetooth | Limitado | Completo | Completo |

### Fatores decisivos para o Miss Belle

1. **Público-alvo** — esteticistas que já usam o app pelo celular via browser. A instalação via PWA remove a fricção sem exigir que elas vão à App Store.
2. **Codebase único** — manutenção zero adicional. Cada deploy web automaticamente atualiza o app instalado.
3. **iOS melhorou** — desde o iOS 16.4, Web Push notifications funcionam em PWAs instaladas via Safari.
4. **Futuro** — se necessário (ex: câmera para fotos antes/depois), migrar para Capacitor sobre o mesmo código React leva 1–2 semanas.

---

## 2. O que será implementado

### 2.1 Web App Manifest (`manifest.json`)

Arquivo JSON que informa ao browser como o app deve se comportar quando instalado.

```json
{
  "name": "Miss Belle",
  "short_name": "Miss Belle",
  "description": "Gestão de clínica estética — agenda, clientes e financeiro",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F9F5F0",
  "theme_color": "#C4956A",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/agenda.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
  ],
  "categories": ["business", "productivity"]
}
```

**Efeito visual:**
- Ícone na tela inicial idêntico a um app nativo
- Splash screen com logo + cor de fundo ao abrir
- Sem barra de endereço do browser (`display: standalone`)
- Título "Miss Belle" abaixo do ícone

### 2.2 Service Worker (cache e offline)

Script que roda em background, intercepta requisições de rede e gerencia cache. Implementado via **Workbox** (biblioteca Google, integrada ao `vite-plugin-pwa`).

#### Estratégias de cache por tipo de recurso:

| Recurso | Estratégia | Comportamento |
|---|---|---|
| HTML/JS/CSS (shell do app) | **Cache First** | Abre instantaneamente; atualiza em background |
| Fontes Google (Inter) | **Cache First** | Cache permanente (imutável) |
| Requisições Supabase (dados) | **Network First** | Sempre busca dados frescos; fallback no cache |
| Imagens estáticas | **Cache First** | Cache de 30 dias |

#### Funcionamento offline:
- O "shell" do app (HTML, JS, CSS, fontes) fica em cache após o primeiro acesso
- Ao abrir sem internet, o app carrega normalmente até a tela de loading
- Dados (agenda, clientes, financeiro) exigem conexão — o app mostra mensagem de erro clara
- Quando a conexão volta, os dados são recarregados automaticamente

### 2.3 Banner de instalação ("Add to Home Screen")

Componente `InstallPrompt` que aparece uma vez para usuários mobile que acessam pelo browser.

**Comportamento:**
- Aparece após 30 segundos de uso (não interrompe imediatamente)
- Botão "Instalar" dispara o evento nativo do browser (`BeforeInstallPromptEvent`)
- Botão "Agora não" suprime por 7 dias (localStorage)
- Após instalar, o banner não aparece mais nunca

**iOS (Safari) — caso especial:**
- Safari não suporta o evento de instalação automática
- Para iOS, o banner mostra instruções manuais: *"Toque em compartilhar → Adicionar à Tela de Início"*
- Detectado via `navigator.userAgent` (`/iPad|iPhone|iPod/`)

### 2.4 Ícones

Necessários para funcionar em todas as plataformas:

| Arquivo | Tamanho | Uso |
|---|---|---|
| `/public/icons/icon-192.png` | 192×192 | Android home screen, PWA manifest |
| `/public/icons/icon-512.png` | 512×512 | Android splash, Play Store (futuro) |
| `/public/apple-touch-icon.png` | 180×180 | iOS home screen |
| `/public/favicon.ico` | 32×32 | Tab do browser |
| `/public/favicon.svg` | vetorial | Browsers modernos |

**Especificação do ícone:**
- Fundo: `#C4956A` (primary color)
- Símbolo: coração branco centralizado (logo Miss Belle)
- Formato "maskable": ícone com padding de 20% para suportar máscaras Android (circle, squircle)

### 2.5 Meta tags no `index.html`

Tags adicionais para comportamento correto no iOS e melhoria de SEO:

```html
<!-- PWA / Instalação -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Miss Belle">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">

<!-- Tema / Cor da barra de status -->
<meta name="theme-color" content="#C4956A">

<!-- SEO básico -->
<meta name="description" content="Gestão de agenda, clientes e financeiro para clínicas de estética">
<title>Miss Belle — Gestão de Clínica Estética</title>

<!-- Open Graph (compartilhamento) -->
<meta property="og:title" content="Miss Belle">
<meta property="og:description" content="Gestão de agenda, clientes e financeiro para clínicas de estética">
<meta property="og:image" content="https://missebelle.app/og-image.png">
<meta property="og:url" content="https://missebelle.app">
```

### 2.6 Push Notifications (fase 2)

Infraestrutura para lembretes de agendamento. **Não será implementado no MVP do PWA**, mas a arquitetura já prevê:

- **Web Push API** + **VAPID keys** para autenticação
- Edge Function `send-push-notification` que chama o serviço push do browser
- Tabela `push_subscriptions` no Supabase para armazenar endpoints
- Casos de uso: lembrete 24h antes do agendamento, confirmação de pagamento

---

## 3. Stack técnica

### Plugin: `vite-plugin-pwa`

Escolhido por:
- Integração nativa com Vite (zero configuração extra)
- Gera service worker com Workbox automaticamente
- Suporta `injectManifest` (service worker customizado) e `generateSW` (automático)
- TypeScript types incluídos
- Modo dev com service worker para testar localmente

```bash
npm install -D vite-plugin-pwa
```

### Configuração no `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',  // atualiza silenciosamente em background
      devOptions: { enabled: true },
      manifest: {
        name: 'Miss Belle',
        short_name: 'Miss Belle',
        description: 'Gestão de clínica estética',
        theme_color: '#C4956A',
        background_color: '#F9F5F0',
        display: 'standalone',
        start_url: '/',
        lang: 'pt-BR',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Supabase API — Network First
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Google Fonts — Cache First
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
```

---

## 4. Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---|---|---|
| `vite.config.ts` | Modificar | Adicionar `vite-plugin-pwa` |
| `index.html` | Modificar | Meta tags PWA, SEO, OG |
| `public/manifest.json` | Criar | (gerado pelo plugin, mas pode ser manual) |
| `public/icons/icon-192.png` | Criar | Ícone 192×192 |
| `public/icons/icon-512.png` | Criar | Ícone 512×512 |
| `public/apple-touch-icon.png` | Criar | Ícone iOS 180×180 |
| `public/favicon.ico` | Substituir | Remover o padrão do Vite |
| `public/favicon.svg` | Criar | Favicon vetorial |
| `src/components/InstallPrompt.tsx` | Criar | Banner de instalação |
| `src/components/Layout.tsx` | Modificar | Montar `<InstallPrompt>` |

---

## 5. Checklist de implementação

### Fase 1 — Base (1 dia)
- [ ] Instalar `vite-plugin-pwa`
- [ ] Configurar `vite.config.ts` com manifest e Workbox
- [ ] Atualizar `index.html` com todas as meta tags
- [ ] Criar ícones (192, 512, 180, favicon)
- [ ] Testar instalação no Chrome (Android)
- [ ] Testar instalação no Safari (iOS)

### Fase 2 — Refinamento (meio dia)
- [ ] Criar componente `InstallPrompt`
- [ ] Integrar banner no `Layout.tsx`
- [ ] Testar comportamento offline
- [ ] Validar no Lighthouse (score PWA ≥ 90)
- [ ] Testar atualização automática (auto-update do service worker)

### Fase 3 — Push Notifications (futura)
- [ ] Gerar VAPID keys
- [ ] Edge Function `send-push-notification`
- [ ] Tabela `push_subscriptions` + migration
- [ ] Solicitar permissão no app
- [ ] Lembrete 24h antes do agendamento

---

## 6. Critérios de sucesso

| Métrica | Meta |
|---|---|
| Lighthouse PWA score | ≥ 90 |
| Lighthouse Performance (mobile) | ≥ 70 |
| Tempo de abertura (cache) | < 1 segundo |
| Funciona offline (shell) | ✅ |
| Instalável no Android (Chrome) | ✅ |
| Instalável no iOS (Safari 16.4+) | ✅ |
| Ícone correto na home screen | ✅ |
| Sem barra de URL ao abrir instalado | ✅ |

---

## 7. Limitações conhecidas

| Limitação | Plataforma | Impacto | Mitigação |
|---|---|---|---|
| Instalação manual no iOS (Safari) | iOS < 16.4 | Médio | Instrução visual no InstallPrompt |
| Web Push não funciona em iOS PWA | iOS < 16.4 | Médio | Fase 3 só após iOS 16.4+ ser majoritário |
| Storage limitado (Safari) | iOS | Baixo | Cache seletivo, dados no Supabase |
| Service worker não atualiza instantaneamente | Todos | Baixo | `registerType: 'autoUpdate'` + notificação de update |
| Sem acesso a câmera nativa avançada | Todos | Baixo | `getUserMedia` cobre casos básicos |

---

## 8. Caminho de evolução (se necessário)

```
PWA (agora)
  ↓  se precisar de câmera para fotos antes/depois
Capacitor (wrapper nativo sobre o mesmo código React)
  ↓  se precisar de performance extrema ou APIs muito específicas
React Native (reescrita da UI, mantém lógica)
```

A escolha do PWA não bloqueia nenhum dos passos seguintes.
