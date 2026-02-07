import { PaymentSplit } from './supabase';

/**
 * Resultado da validação de pagamentos
 */
export interface PaymentValidationResult {
  isValid: boolean;
  message?: string;
}

/**
 * Valida se os pagamentos divididos somam o valor esperado
 * @param splits - Array de pagamentos divididos
 * @param expectedTotal - Valor total esperado
 * @returns Resultado da validação
 */
export function validatePaymentSplits(
  splits: PaymentSplit[],
  expectedTotal: number
): PaymentValidationResult {
  // Validar se há pelo menos uma forma de pagamento
  if (splits.length === 0) {
    return {
      isValid: false,
      message: 'Adicione pelo menos uma forma de pagamento',
    };
  }

  // Calcular total dos pagamentos
  const total = splits.reduce((sum, split) => sum + split.amount, 0);

  // Validar valores individuais
  for (const split of splits) {
    if (split.amount <= 0) {
      return {
        isValid: false,
        message: 'Valores devem ser maiores que zero',
      };
    }

    if (isNaN(split.amount)) {
      return {
        isValid: false,
        message: 'Valores devem ser numéricos',
      };
    }
  }

  // Validar se soma bate (com tolerância de 0.01 para evitar erros de ponto flutuante)
  const difference = Math.abs(total - expectedTotal);
  if (difference > 0.01) {
    return {
      isValid: false,
      message: `Total informado (R$ ${total.toFixed(
        2
      )}) diferente do esperado (R$ ${expectedTotal.toFixed(2)})`,
    };
  }

  return { isValid: true };
}

/**
 * Valida o calção (entrada) de um agendamento
 * @param downpaymentAmount - Valor do calção
 * @param totalAmount - Valor total do serviço
 * @param downpaymentMethod - Forma de pagamento do calção
 * @returns Resultado da validação
 */
export function validateDownpayment(
  downpaymentAmount: number,
  totalAmount: number,
  downpaymentMethod: string | null
): PaymentValidationResult {
  // Se não houver calção, é válido
  if (downpaymentAmount === 0 || !downpaymentAmount) {
    return { isValid: true };
  }

  // Validar se calção é positivo
  if (downpaymentAmount < 0) {
    return {
      isValid: false,
      message: 'O valor do calção deve ser positivo',
    };
  }

  // Validar se calção não é maior que o total
  if (downpaymentAmount >= totalAmount) {
    return {
      isValid: false,
      message: 'O calção deve ser menor que o valor total do serviço',
    };
  }

  // Validar se foi informada a forma de pagamento
  if (!downpaymentMethod) {
    return {
      isValid: false,
      message: 'Informe a forma de pagamento do calção',
    };
  }

  return { isValid: true };
}

/**
 * Formata valor em reais para exibição
 * @param value - Valor numérico
 * @returns String formatada (ex: "R$ 150,00")
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Obtém label amigável para forma de pagamento
 * @param method - Forma de pagamento
 * @returns Label formatada
 */
export function getPaymentMethodLabel(
  method: 'dinheiro' | 'credito' | 'debito' | 'pix'
): string {
  const labels: Record<string, string> = {
    dinheiro: 'Dinheiro',
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
    pix: 'PIX',
  };

  return labels[method] || method;
}

/**
 * Calcula o valor restante a pagar
 * @param totalAmount - Valor total do serviço
 * @param downpaymentAmount - Valor do calção já pago
 * @returns Valor restante
 */
export function calculateRemainingAmount(
  totalAmount: number,
  downpaymentAmount: number
): number {
  return Math.max(0, totalAmount - (downpaymentAmount || 0));
}
