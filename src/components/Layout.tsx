import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { usePlan } from '../hooks/usePlan';
import BottomNav from './mobile/BottomNav';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCircle,
  Wallet,
  Heart,
  Menu,
  X,
  LogOut,
  ChevronDown,
  CreditCard,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  superAdminOnly?: boolean;
}

export default function Layout({ children }: LayoutProps) {
  const { profile, signOut, isSuperAdmin } = useAuth();
  const { currentRoute, navigate } = useRouter();
  const { plan, isTrialing, isPastDue, trialDaysLeft } = usePlan();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems: NavItem[] = isSuperAdmin
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Agenda Geral', icon: Calendar, path: '/agenda-geral' },
        { label: 'Usuários', icon: Users, path: '/usuarios', superAdminOnly: true },
        { label: 'Procedimentos', icon: Scissors, path: '/procedimentos' },
        { label: 'Clientes', icon: UserCircle, path: '/pacientes' },
        { label: 'Financeiro', icon: Wallet, path: '/financeiro' },
      ]
    : [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Minha Agenda', icon: Calendar, path: '/minha-agenda' },
        { label: 'Clientes', icon: UserCircle, path: '/pacientes' },
        { label: 'Meus Serviços', icon: Scissors, path: '/procedimentos' },
        { label: 'Financeiro', icon: Wallet, path: '/financeiro' },
      ];

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-accent/10 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-accent/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <Heart className="w-5 h-5 text-white" fill="white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text">Miss Belle</h1>
                <p className="text-xs text-text-muted">
                  {isSuperAdmin ? 'Admin' : 'Profissional'}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-text hover:bg-champagne-nuvem rounded-lg transition-colors group ${
                    currentRoute === item.path ? 'bg-champagne-nuvem' : ''
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-colors ${
                    currentRoute === item.path ? 'text-primary' : 'text-text-muted group-hover:text-primary'
                  }`} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}

            {/* Item Meu Plano */}
            <button
              onClick={() => { navigate('/plano'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-text hover:bg-champagne-nuvem rounded-lg transition-colors group ${
                currentRoute === '/plano' ? 'bg-champagne-nuvem' : ''
              }`}
            >
              <CreditCard className={`w-5 h-5 transition-colors ${
                currentRoute === '/plano' ? 'text-primary' : 'text-text-muted group-hover:text-primary'
              }`} />
              <span className="font-medium flex-1 text-left">Meu Plano</span>
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {plan.label}
              </span>
            </button>
          </nav>

          <div className="p-4 border-t border-accent/10">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 px-4 py-3 text-text hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                <UserCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-text truncate">{profile?.full_name}</p>
                <p className="text-xs text-text-muted truncate">{profile?.email}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="mt-2 space-y-1">
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-4 py-2 text-text hover:bg-champagne-nuvem rounded-lg transition-colors text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed top-4 left-4 z-40 p-2 text-text bg-white/80 backdrop-blur-lg rounded-lg shadow-soft border border-accent/10"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Banner trial */}
        {isTrialing && (
          <div className="mx-4 mt-16 lg:mt-4 lg:mx-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700 flex-1">
              <strong>Trial:</strong> {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''} restante{trialDaysLeft !== 1 ? 's' : ''} — seu cartão será cobrado ao final.
            </p>
            <button
              onClick={() => navigate('/plano')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0"
            >
              Ver planos →
            </button>
          </div>
        )}

        {/* Banner past_due */}
        {isPastDue && (
          <div className="mx-4 mt-16 lg:mt-4 lg:mx-0 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">
              <strong>Pagamento pendente</strong> — atualize seu método de pagamento para continuar usando o Miss Belle.
            </p>
            <button
              onClick={() => navigate('/plano')}
              className="text-xs font-semibold text-red-700 hover:text-red-900 flex-shrink-0"
            >
              Resolver →
            </button>
          </div>
        )}

        <main className={`p-4 lg:p-8 pb-24 md:pb-8 ${isTrialing || isPastDue ? 'pt-4' : 'pt-16 lg:pt-8'}`}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-grafite-rosado/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
