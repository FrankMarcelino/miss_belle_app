import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCircle,
  DollarSign,
  Heart,
  Menu,
  X,
  LogOut,
  ChevronDown
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems: NavItem[] = isSuperAdmin
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Agenda Geral', icon: Calendar, path: '/agenda-geral' },
        { label: 'Usuários', icon: Users, path: '/usuarios', superAdminOnly: true },
        { label: 'Procedimentos', icon: Scissors, path: '/procedimentos' },
        { label: 'Pacientes', icon: UserCircle, path: '/pacientes' },
        { label: 'Fechamentos', icon: DollarSign, path: '/fechamentos', superAdminOnly: true },
      ]
    : [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Minha Agenda', icon: Calendar, path: '/minha-agenda' },
        { label: 'Pacientes', icon: UserCircle, path: '/pacientes' },
        { label: 'Fechar Caixa', icon: DollarSign, path: '/fechar-caixa' },
      ];

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-background-card border-r border-accent/20 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-accent/20">
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
                  onClick={() => navigate(item.path)}
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
          </nav>

          <div className="p-4 border-t border-accent/20">
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
        <header className="sticky top-0 z-40 bg-champagne-nuvem border-b border-accent/20 px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-text hover:bg-background-card rounded-lg transition-colors"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <div className="flex-1 lg:flex-none">
              <h2 className="text-xl font-semibold text-text">Dashboard</h2>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-grafite-rosado/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
