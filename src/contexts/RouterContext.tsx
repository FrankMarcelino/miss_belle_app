import { createContext, useContext, useState, ReactNode } from 'react';

type Route = string;

interface RouterContextType {
  currentRoute: Route;
  navigate: (route: Route) => void;
  getDefaultRoute: (isSuperAdmin: boolean) => Route;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [currentRoute, setCurrentRoute] = useState<Route>('/dashboard');

  const navigate = (route: Route) => {
    setCurrentRoute(route);
  };

  // ✨ NOVO: Função para obter rota padrão baseada no perfil
  const getDefaultRoute = (isSuperAdmin: boolean): Route => {
    // Super admin vai para dashboard (visão geral)
    if (isSuperAdmin) {
      return '/dashboard';
    }
    // Profissional vai direto para sua agenda
    return '/minha-agenda';
  };

  return (
    <RouterContext.Provider value={{ currentRoute, navigate, getDefaultRoute }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const context = useContext(RouterContext);
  if (context === undefined) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}
