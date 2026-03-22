import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISSED_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 7;

// Detectar iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

// Detectar se já está instalado como PWA
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // Não mostrar se já está instalado
    if (isStandalone()) return;

    // Não mostrar se foi dispensado recentemente
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    if (iosDevice) {
      // iOS: mostrar instruções manuais após 30s
      const timer = setTimeout(() => setShow(true), 30_000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: capturar evento nativo de instalação
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Mostrar banner após 30s
      setTimeout(() => setShow(true), 30_000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, String(until));
    setShow(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + 365 * 24 * 60 * 60 * 1000));
    }
    setDeferredPrompt(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-2xl shadow-soft-lg border border-accent/15 p-4">
        <div className="flex items-start gap-3">
          {/* Ícone */}
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text text-sm">Instalar Miss Belle</p>
            {ios ? (
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                Toque em{' '}
                <Share className="w-3 h-3 inline text-primary" />{' '}
                <strong>Compartilhar</strong> e depois em{' '}
                <strong>"Adicionar à Tela de Início"</strong>
              </p>
            ) : (
              <p className="text-xs text-text-muted mt-0.5">
                Acesse mais rápido direto da sua tela inicial, sem browser.
              </p>
            )}
          </div>

          {/* Fechar */}
          <button
            onClick={dismiss}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-champagne-nuvem transition-colors text-text-muted"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Botões (só Android/Chrome — iOS não tem evento de instalação) */}
        {!ios && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={dismiss}
              className="flex-1 py-2 text-xs font-medium text-text-muted hover:text-text transition-colors"
            >
              Agora não
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Instalar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
