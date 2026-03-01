import { Home, Calendar, Users, Wallet } from 'lucide-react';
import { useRouter } from '../../contexts/RouterContext';
import { useAuth } from '../../contexts/AuthContext';

export default function BottomNav() {
  const { currentRoute, navigate } = useRouter();
  const { isSuperAdmin } = useAuth();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Início',
      icon: Home,
      route: '/dashboard',
    },
    {
      id: 'agenda',
      label: 'Agenda',
      icon: Calendar,
      route: isSuperAdmin ? '/agenda-geral' : '/minha-agenda',
    },
    {
      id: 'patients',
      label: 'Clientes',
      icon: Users,
      route: '/pacientes',
    },
    {
      id: 'financeiro',
      label: 'Financeiro',
      icon: Wallet,
      route: '/financeiro',
    },
  ];

  return (
    <nav className="bottom-nav-bar md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = currentRoute === item.route;

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.route)}
            className={`bottom-nav-item ${active ? 'bottom-nav-item-active' : ''}`}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="w-6 h-6 mb-0.5" strokeWidth={active ? 2.5 : 2} />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
