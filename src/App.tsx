import { useAuth } from './contexts/AuthContext';
import { useRouter } from './contexts/RouterContext';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Procedures from './pages/Procedures';
import Patients from './pages/Patients';
import Agenda from './pages/Agenda';
import CashRegister from './pages/CashRegister';
import Expenses from './pages/Expenses';
import Financeiro from './pages/Financeiro';
import Plano from './pages/Plano';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

function App() {
  const { user, loading, profile } = useAuth();
  const { currentRoute, navigate, getDefaultRoute } = useRouter();
  const [showLogin, setShowLogin] = useState(false);

  // Mostrar landing page novamente ao fazer logout
  useEffect(() => {
    if (!user && !loading) {
      setShowLogin(false);
    }
  }, [user, loading]);

  // ✨ Redirecionar para rota apropriada quando usuário está logado
  useEffect(() => {
    if (!loading && user && profile) {
      const defaultRoute = getDefaultRoute(profile.role === 'super_admin');

      // Se não está em nenhuma rota válida, navegar para a padrão
      if (!currentRoute || currentRoute === '/') {
        navigate(defaultRoute);
      }
    }
  }, [loading, user, profile, currentRoute, navigate, getDefaultRoute]);

  if (loading) {
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
    if (!showLogin) {
      return <Landing onEnterClick={() => setShowLogin(true)} />;
    }
    return <Login />;
  }


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
      case '/despesas':
        return <Expenses />;
      case '/financeiro':
        return <Financeiro />;
      case '/plano':
        return <Plano />;
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
