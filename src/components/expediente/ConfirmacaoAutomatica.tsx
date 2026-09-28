import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Confirmação automática 24 h antes, por profissional (#8).
 *
 * Duas chaves, como no banco: ligada + data de início. Sem data, nada sai — é o
 * que impede o primeiro dia ligado de pegar agendamentos antigos de surpresa.
 * Por isso ligar sem data não liga: a tela pede a data primeiro.
 *
 * Carrega à parte: se falhar, a seção some e o expediente continua de pé.
 */
type Props = {
  professionalId: string;
  onToast: (type: 'success' | 'error', title: string, description?: string) => void;
};

export default function ConfirmacaoAutomatica({ professionalId, onToast }: Props) {
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [aPartirDe, setAPartirDe] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    const id = ++pedido.current;
    setLigada(null);
    supabase
      .from('profiles')
      .select('confirmation_enabled, confirmation_starts_on')
      .eq('id', professionalId)
      .single()
      .then(({ data, error }) => {
        if (id !== pedido.current || error || !data) return;
        setLigada(Boolean(data.confirmation_enabled));
        setAPartirDe(data.confirmation_starts_on ?? '');
      });
  }, [professionalId]);

  if (ligada === null) return null;

  async function gravar(campos: { confirmation_enabled?: boolean; confirmation_starts_on?: string | null }) {
    setSalvando(true);
    const { error } = await supabase.from('profiles').update(campos).eq('id', professionalId);
    setSalvando(false);
    if (error) {
      onToast('error', 'Confirmação não foi alterada', error.message);
      return false;
    }
    return true;
  }

  async function alternar() {
    const nova = !ligada;
    if (nova && !aPartirDe) {
      onToast('error', 'Escolha a data de início', 'Só agendamentos a partir dessa data recebem a confirmação.');
      return;
    }
    if (await gravar({ confirmation_enabled: nova })) {
      setLigada(nova);
      onToast('success', nova ? 'Confirmação automática ligada' : 'Confirmação automática desligada');
    }
  }

  async function mudarData(valor: string) {
    const anterior = aPartirDe;
    setAPartirDe(valor);
    if (!(await gravar({ confirmation_starts_on: valor || null }))) {
      setAPartirDe(anterior);
      return;
    }
    onToast('success', valor ? 'Data de início atualizada' : 'Sem data de início: nenhuma confirmação sai');
  }

  return (
    <section aria-labelledby="confirmacao" className="space-y-3">
      <h2 id="confirmacao" className="text-base font-semibold text-text">
        Confirmação automática
      </h2>
      <p className="text-sm text-text-light max-w-prose">
        Na véspera, às 9h, a cliente recebe uma mensagem pedindo para confirmar. Sem resposta, vai um
        segundo aviso 4 horas depois. Sem resposta em mais 4 horas, <strong>o horário é liberado</strong> e
        ela é avisada. Qualquer resposta dela suspende o cancelamento. Vale para todos os agendamentos
        desta profissional, inclusive os marcados por aqui.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-light">Confirmar agendamentos a partir de</span>
          <input
            type="date"
            value={aPartirDe}
            disabled={salvando}
            onChange={(e) => mudarData(e.target.value)}
            className="px-3 py-2 bg-white border border-accent/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-label="Confirmar agendamentos automaticamente"
          disabled={salvando}
          onClick={alternar}
          className="flex items-center gap-3 py-2"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${ligada ? 'bg-primary' : 'bg-accent/30'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${ligada ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </span>
          <span className="text-sm text-text">{ligada ? 'Ligada' : 'Desligada'}</span>
        </button>
      </div>
    </section>
  );
}
