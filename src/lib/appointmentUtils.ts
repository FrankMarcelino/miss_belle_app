import { CheckCircle2, DollarSign, RotateCcw, AlertTriangle, Star } from 'lucide-react';

export function getPaymentStatusConfig(ps?: string) {
  switch (ps) {
    case 'paid':
      return { Icon: CheckCircle2, label: 'Pago', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
    case 'partial':
      return { Icon: DollarSign, label: 'Sinal', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
    case 'reopened':
      return { Icon: RotateCcw, label: 'Correção', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' };
    case 'reversed':
      return { Icon: AlertTriangle, label: 'Estornado', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    case 'credited':
      return { Icon: Star, label: 'Crédito', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
    default:
      return null;
  }
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'scheduled':
      return 'bg-accent/10 text-accent border-accent/10';
    case 'confirmed':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'completed':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'cancelled':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusLabel(status: string) {
  switch (status) {
    case 'scheduled':
      return 'Marcado';
    case 'confirmed':
      return 'Confirmado';
    case 'completed':
      return 'Realizado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}
