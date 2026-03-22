import {
  Heart,
  Calendar,
  CreditCard,
  Users,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Star,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { PLANS, PLAN_ORDER } from '../lib/plans';

interface LandingProps {
  onEnterClick: () => void;
}

export default function Landing({ onEnterClick }: LandingProps) {
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-accent/10 shadow-soft">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-soft">
              <Heart className="w-5 h-5 text-white" fill="white" />
            </div>
            <span className="text-xl font-bold text-text">Miss Belle</span>
          </div>
          <button
            onClick={onEnterClick}
            className="bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-soft"
          >
            Entrar
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-16 pb-24 px-4 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-marmore/40 via-background to-champagne-nuvem/60 -z-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/3 -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full translate-y-1/2 -translate-x-1/3 -z-10" />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          {/* Texto */}
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-3 py-1.5 rounded-full mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Gestão para clínicas estéticas
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-text leading-tight mb-6">
              Sua clínica estética no{' '}
              <span className="text-primary">controle total</span>
            </h1>
            <p className="text-lg text-text-light leading-relaxed mb-8">
              Agendamentos, pagamentos e clientes em um só lugar. Miss Belle foi
              criado para profissionais de estética que querem mais tempo para o
              que importa — cuidar das clientes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onEnterClick}
                className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold px-6 py-3.5 rounded-xl transition-colors shadow-soft-lg"
              >
                Começar agora
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onEnterClick}
                className="flex items-center justify-center gap-2 bg-white text-text font-medium px-6 py-3.5 rounded-xl border border-accent/20 hover:border-primary/30 transition-colors shadow-soft"
              >
                Já tenho uma conta
              </button>
            </div>
          </div>

          {/* Mockup visual */}
          <div className="relative">
            <div className="bg-white rounded-2xl shadow-soft-lg p-5 border border-accent/10">
              {/* Header do mockup */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-text-muted">Segunda, 18 mar</p>
                  <h3 className="font-semibold text-text">Minha Agenda</h3>
                </div>
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
              </div>

              {/* Agendamentos mock */}
              {[
                {
                  time: '09:00',
                  name: 'Ana Carolina',
                  service: 'Limpeza de Pele',
                  color: 'bg-primary/10 border-primary/20',
                },
                {
                  time: '10:30',
                  name: 'Mariana Silva',
                  service: 'Design de Sobrancelha',
                  color: 'bg-accent/15 border-accent/25',
                },
                {
                  time: '14:00',
                  name: 'Juliana Costa',
                  service: 'Micropigmentação',
                  color: 'bg-rose-marmore/60 border-primary/15',
                },
              ].map((apt, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${apt.color} mb-2 last:mb-0`}
                >
                  <div className="text-center min-w-[42px]">
                    <p className="text-xs font-bold text-text">{apt.time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{apt.name}</p>
                    <p className="text-xs text-text-muted truncate">{apt.service}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                </div>
              ))}

              {/* Card financeiro mock */}
              <div className="mt-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-3 border border-primary/10">
                <p className="text-xs text-text-muted mb-1">Receita do mês</p>
                <p className="text-2xl font-bold text-text">R$ 8.450</p>
                <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="w-3 h-3" />
                  +12% vs. mês anterior
                </p>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-5 -left-5 bg-white rounded-xl shadow-soft-lg px-4 py-3 border border-accent/10 flex items-center gap-2">
              <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text">Pagamento confirmado</p>
                <p className="text-xs text-text-muted">Ana Carolina · R$ 150,00</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="bg-white border-y border-accent/10 py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { value: '+500', label: 'Agendamentos por mês' },
            { value: '3x', label: 'Mais produtividade' },
            { value: '100%', label: 'Feito para estética' },
          ].map((stat, i) => (
            <div key={i}>
              <p className="text-3xl font-bold text-primary">{stat.value}</p>
              <p className="text-sm text-text-muted mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4 sm:px-6 bg-champagne-nuvem/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text mb-3">Tudo que você precisa</h2>
            <p className="text-text-muted max-w-xl mx-auto">
              Uma plataforma completa pensada do zero para clínicas de estética
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Calendar,
                title: 'Agenda Inteligente',
                desc: 'Visualização por dia, semana ou mês. Detecta conflitos de horário automaticamente.',
                iconClass: 'text-primary bg-primary/10',
              },
              {
                icon: CreditCard,
                title: 'Controle Financeiro',
                desc: 'Acompanhe receitas, despesas, sinais e pagamentos pendentes em tempo real.',
                iconClass: 'text-amber-600 bg-amber-50',
              },
              {
                icon: Users,
                title: 'Gestão de Clientes',
                desc: 'Cadastro completo com histórico de atendimentos e créditos disponíveis.',
                iconClass: 'text-pink-500 bg-pink-50',
              },
              {
                icon: BarChart3,
                title: 'Dashboard Executivo',
                desc: 'Métricas e gráficos para tomar decisões inteligentes no seu negócio.',
                iconClass: 'text-violet-500 bg-violet-50',
              },
            ].map((feat, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-shadow border border-accent/5"
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${feat.iconClass}`}
                >
                  <feat.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-text mb-2">{feat.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text mb-3">Como funciona</h2>
            <p className="text-text-muted">Comece em minutos, sem complicação</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Sparkles,
                title: 'Configure sua clínica',
                desc: 'Cadastre seus serviços, profissionais e tabela de preços em minutos.',
              },
              {
                step: '02',
                icon: Calendar,
                title: 'Gerencie agendamentos',
                desc: 'Agende, confirme e acompanhe todos os atendimentos com facilidade.',
              },
              {
                step: '03',
                icon: TrendingUp,
                title: 'Controle suas finanças',
                desc: 'Veja receitas, gerencie pagamentos e feche o caixa do dia.',
              },
            ].map((s, i) => (
              <div key={i} className="text-center relative">
                {i < 2 && (
                  <div className="hidden sm:block absolute top-7 left-[calc(50%+2.5rem)] right-0 h-px bg-gradient-to-r from-accent/50 to-transparent" />
                )}
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 relative z-10">
                  <s.icon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-xs font-bold text-primary mb-2 tracking-widest">{s.step}</p>
                <h3 className="font-semibold text-text mb-2">{s.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 px-4 sm:px-6 bg-rose-marmore/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text mb-3">Profissionais que confiam</h2>
            <p className="text-text-muted">Veja o que estão dizendo</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                name: 'Carla Mendes',
                role: 'Esteticista · São Paulo',
                text: 'Antes eu perdia horas com planilhas. Agora tudo está num só lugar e consigo ver minha receita em tempo real.',
              },
              {
                name: 'Patrícia Lima',
                role: 'Micropigmentadora · Rio de Janeiro',
                text: 'O controle de sinal e cancelamentos me salvou de muita dor de cabeça. Recomendo para todas as colegas!',
              },
              {
                name: 'Fernanda Costa',
                role: 'Proprietária · Belo Horizonte',
                text: 'Tenho 3 profissionais na minha clínica e o Miss Belle organiza tudo perfeitamente para cada uma delas.',
              },
            ].map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-card border border-accent/5"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-text-light text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-semibold text-sm">{t.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">{t.name}</p>
                    <p className="text-xs text-text-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 px-4 sm:px-6 bg-champagne-nuvem/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-3 py-1.5 rounded-full mb-4">
              <Zap className="w-3.5 h-3.5" />
              Preços simples e transparentes
            </div>
            <h2 className="text-3xl font-bold text-text mb-3">Escolha seu plano</h2>
            <p className="text-text-muted max-w-md mx-auto">
              Comece grátis. Faça upgrade quando precisar crescer.
              Sem taxas ocultas, cancele quando quiser.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {PLAN_ORDER.map((pid) => {
              const p = PLANS[pid];
              return (
                <div
                  key={pid}
                  className={`relative bg-white rounded-2xl p-6 border-2 ${
                    p.highlight
                      ? 'border-primary shadow-soft-lg'
                      : 'border-accent/10 shadow-card'
                  }`}
                >
                  {p.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Mais popular
                      </span>
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="text-lg font-bold text-text mb-1">{p.label}</h3>
                    <div className="flex items-end gap-1">
                      {p.price === 0 ? (
                        <span className="text-3xl font-bold text-text">Grátis</span>
                      ) : (
                        <>
                          <span className="text-3xl font-bold text-text">R$ {p.price}</span>
                          <span className="text-text-muted text-sm mb-1">/mês</span>
                        </>
                      )}
                    </div>
                    {p.price > 0 && (
                      <p className="text-xs text-primary mt-1">14 dias grátis para testar</p>
                    )}
                    <p className="text-xs text-text-muted mt-1">{p.description}</p>
                  </div>

                  <ul className="space-y-2.5 mb-6">
                    {p.featureList.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-light">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={onEnterClick}
                    className={`w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition-colors text-sm ${
                      p.highlight
                        ? 'bg-primary hover:bg-primary-hover text-white shadow-soft'
                        : 'bg-champagne-nuvem hover:bg-accent/20 text-text border border-accent/20'
                    }`}
                  >
                    {p.price === 0 ? 'Começar grátis' : 'Iniciar trial de 14 dias'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-text-muted mt-8">
            Nos planos pagos, nenhuma cobrança durante os 14 dias de trial. Cancele a qualquer momento.
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-primary/10 via-background to-champagne-nuvem">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-soft-lg">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h2 className="text-3xl font-bold text-text mb-4">
            Pronta para transformar sua clínica?
          </h2>
          <p className="text-text-muted mb-8 text-lg">
            Junte-se a profissionais que já simplificaram a gestão da sua clínica
            com o Miss Belle.
          </p>
          <button
            onClick={onEnterClick}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold px-8 py-4 rounded-xl transition-colors shadow-soft-lg"
          >
            Criar minha conta
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-accent/10 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-white" fill="white" />
            </div>
            <span className="font-semibold text-text">Miss Belle</span>
          </div>
          <p className="text-text-muted text-sm">
            © 2026 Miss Belle · Gestão de Clínica Estética
          </p>
          <button
            onClick={onEnterClick}
            className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
          >
            Entrar na plataforma →
          </button>
        </div>
      </footer>
    </div>
  );
}
