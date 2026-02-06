import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
  description?: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ type, message, description, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const styles = {
    success: {
      container: 'bg-green-50 border-green-200 text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-600',
    },
    error: {
      container: 'bg-red-50 border-red-200 text-red-800',
      icon: XCircle,
      iconColor: 'text-red-600',
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600',
    },
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: Info,
      iconColor: 'text-blue-600',
    },
  };

  const config = styles[type];
  const Icon = config.icon;

  return (
    <div className="fixed top-20 right-4 left-4 md:left-auto md:w-96 z-[100] animate-slide-down">
      <div className={`${config.container} border-2 rounded-xl shadow-lg p-4 flex items-start gap-3`}>
        <Icon className={`${config.iconColor} w-6 h-6 flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm mb-1">{message}</p>
          {description && <p className="text-xs opacity-90">{description}</p>}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 rounded-lg transition-colors flex-shrink-0"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toast, setToast] = useState<{
    type: ToastType;
    message: string;
    description?: string;
  } | null>(null);

  const showToast = (type: ToastType, message: string, description?: string) => {
    setToast({ type, message, description });
  };

  const hideToast = () => {
    setToast(null);
  };

  const ToastComponent = toast ? (
    <Toast
      type={toast.type}
      message={toast.message}
      description={toast.description}
      onClose={hideToast}
    />
  ) : null;

  return { showToast, ToastComponent };
}
