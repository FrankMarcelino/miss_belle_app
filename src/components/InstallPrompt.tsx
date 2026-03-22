import { useEffect, useState } from 'react';
import { Download, X, Share, MoreVertical } from 'lucide-react';

const DISMISSED_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 7;
const SHOW_DELAY_MS = 8_000; // 8 segundos após o carregamento

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

function wasDismissed() {
  const until = localStorage.getItem(DISMISSED_KEY);
  return !!until && Date.now() < parseInt(until);
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const ios     = isIOS();
    const android = isAndroid();

    if (!ios && !android) return; // Desktop: não mostrar

    setPlatform(ios ? 'ios' : 'android');

    // Capturar evento nativo do Chrome (Android) se disponível
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Mostrar banner após SHOW_DELAY_MS, independente do evento
    // (o evento nativo pode nunca disparar dependendo do engajamento)
    const timer = setTimeout(() => {
      if (!isStandalone() && !wasDismissed()) setShow(true);
    }, SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, String(until));
    setShow(false);
  }

  async function handleNativeInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      // Não mostrar mais por 1 ano
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + 365 * 24 * 60 * 60 * 1000));
    }
    setDeferredPrompt(null);
    setShow(false);
  }

  if (!show) return null;

  // Android com evento nativo disponível → botão direto
  if (platform === 'android' && deferredPrompt) {
    return (
      <Banner onClose={dismiss}>
        <p className="font-semibold text-text text-sm">Instalar Miss Belle</p>
        <p className="text-xs text-text-muted mt-0.5">
          Acesse direto da sua tela inicial, sem abrir o browser.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={dismiss} className="flex-1 py-2 text-xs font-medium text-text-muted">
            Agora não
          </button>
          <button
            onClick={handleNativeInstall}
            className="flex-1 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Instalar
          </button>
        </div>
      </Banner>
    );
  }

  // Android sem evento nativo → instruções manuais (menu do Chrome)
  if (platform === 'android') {
    return (
      <Banner onClose={dismiss}>
        <p className="font-semibold text-text text-sm">Instalar Miss Belle</p>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Toque em{' '}
          <MoreVertical className="w-3 h-3 inline text-primary" />{' '}
          <strong>Menu</strong> no topo do Chrome, depois em{' '}
          <strong>"Adicionar à tela inicial"</strong>.
        </p>
      </Banner>
    );
  }

  // iOS → instruções Safari
  return (
    <Banner onClose={dismiss}>
      <p className="font-semibold text-text text-sm">Instalar Miss Belle</p>
      <p className="text-xs text-text-muted mt-1 leading-relaxed">
        Toque em{' '}
        <Share className="w-3 h-3 inline text-primary" />{' '}
        <strong>Compartilhar</strong> na barra do Safari, depois em{' '}
        <strong>"Adicionar à Tela de Início"</strong>.
      </p>
    </Banner>
  );
}

function Banner({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50">
      <div className="bg-white rounded-2xl shadow-soft-lg border border-accent/15 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            {children}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-champagne-nuvem transition-colors text-text-muted"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
