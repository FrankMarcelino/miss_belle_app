import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { Heart, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginProps {
  initialMode?: 'login' | 'signup';
}

export default function Login({ initialMode = 'login' }: LoginProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, profile, user } = useAuth();
  const { navigate, getDefaultRoute } = useRouter();

  useEffect(() => {
    if (user && profile) {
      navigate(getDefaultRoute(profile.role === 'super_admin'));
    }
  }, [user, profile, navigate, getDefaultRoute]);

  function switchMode(next: 'login' | 'signup' | 'forgot') {
    setMode(next);
    setError('');
    setSuccess('');
    setPassword('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Por favor, informe seu nome completo.');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, fullName);
      if (error) setError(error.message || 'Erro ao criar conta. Tente novamente.');

    } else if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError('E-mail ou senha incorretos.');

    } else {
      // forgot
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?reset=true`,
      });
      if (error) {
        setError('Erro ao enviar e-mail. Verifique o endereço e tente novamente.');
      } else {
        setSuccess('E-mail enviado! Verifique sua caixa de entrada para redefinir a senha.');
      }
    }

    setLoading(false);
  }

  const title = mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Redefinir senha' : 'Entrar';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-champagne-nuvem flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4 shadow-soft">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1 className="text-3xl font-bold text-text mb-1">Miss Belle</h1>
          <p className="text-text-muted text-sm">Gestão de Clínica Estética</p>
        </div>

        <div className="bg-white rounded-2xl shadow-soft-lg p-8 border border-accent/10">
          {/* Header do card */}
          <div className="flex items-center gap-3 mb-6">
            {mode === 'forgot' && (
              <button
                onClick={() => switchMode('login')}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-champagne-nuvem transition-colors text-text-muted"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-2xl font-semibold text-text">{title}</h2>
          </div>

          {mode === 'forgot' && !success && (
            <p className="text-sm text-text-muted mb-5">
              Informe seu e-mail e enviaremos um link para você criar uma nova senha.
            </p>
          )}

          {success ? (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl text-sm text-center">
              {success}
              <button
                onClick={() => switchMode('login')}
                className="block mx-auto mt-3 text-primary hover:text-primary-hover font-medium text-sm"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-text mb-1.5">
                    Nome completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-text placeholder-text-muted"
                    placeholder="Seu nome completo"
                    required
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text mb-1.5">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-text placeholder-text-muted"
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  autoComplete={mode === 'signup' ? 'email' : 'username'}
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-text">
                      Senha
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-primary hover:text-primary-hover transition-colors"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-11 bg-champagne-nuvem border border-accent/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all text-text placeholder-text-muted"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="text-xs text-text-muted mt-1">Mínimo de 6 caracteres</p>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-soft mt-2"
              >
                {loading
                  ? mode === 'signup' ? 'Criando conta...'
                    : mode === 'forgot' ? 'Enviando...'
                    : 'Entrando...'
                  : mode === 'signup' ? 'Criar conta grátis'
                    : mode === 'forgot' ? 'Enviar link de redefinição'
                    : 'Entrar'}
              </button>
            </form>
          )}

          {/* Toggle login/signup */}
          {mode !== 'forgot' && (
            <div className="mt-5 text-center">
              <span className="text-sm text-text-muted">
                {mode === 'signup' ? 'Já tem uma conta? ' : 'Não tem uma conta? '}
              </span>
              <button
                onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
              >
                {mode === 'signup' ? 'Entrar' : 'Criar conta grátis'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          Ao criar uma conta, você concorda com nossos Termos de Uso e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
