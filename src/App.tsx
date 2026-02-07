import { useAuth } from './contexts/AuthContext';
import { useRouter } from './contexts/RouterContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Procedures from './pages/Procedures';
import Patients from './pages/Patients';
import Agenda from './pages/Agenda';
import CashRegister from './pages/CashRegister';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

function App() {
  const { user, loading, profile } = useAuth();
  const { currentRoute, navigate, getDefaultRoute } = useRouter();

  console.log('🎯 App render - loading:', loading, 'user:', user?.id, 'profile:', profile?.id, 'currentRoute:', currentRoute);

  // ✨ Redirecionar para rota apropriada quando usuário está logado
  useEffect(() => {
    if (!loading && user && profile) {
      console.log('🔄 App: User logged in, ensuring proper route');
      const defaultRoute = getDefaultRoute(profile.role === 'super_admin');
      
      // Se não está em nenhuma rota válida, navegar para a padrão
      if (!currentRoute || currentRoute === '/') {
        console.log('➡️ App: Navigating to default route:', defaultRoute);
        navigate(defaultRoute);
      }
    }
  }, [loading, user, profile, currentRoute, navigate, getDefaultRoute]);

  if (loading) {
    console.log('⏳ App: Still loading...');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('🚪 App: No user, showing login');
    return <Login />;
  }

  console.log('✅ App: User logged in, rendering protected content');

  const renderPage = () => {
    switch (currentRoute) {
      case '/dashboard':
        return <Dashboard />;
      case '/usuarios':
        return <Users />;
      case '/procedimentos':
        return <Procedures />;
      case '/pacientes':
        return <Patients />;
      case '/minha-agenda':
        return <Agenda />;
      case '/agenda-geral':
        return <Agenda />;
      case '/fechar-caixa':
        return <CashRegister />;
      case '/fechamentos':
        return <CashRegister />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        {renderPage()}
      </Layout>
    </ProtectedRoute>
  );
}

export default App;
