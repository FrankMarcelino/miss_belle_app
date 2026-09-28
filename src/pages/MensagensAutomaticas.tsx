import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/Toast';
import {
  ajustarTextos,
  linhaDoTempo,
  previa,
  validar,
  TEXTO_CANCELAMENTO,
  TEXTOS_CONFIRMACAO,
  TEXTOS_RETOQUE,
  VARIAVEIS,
  type ConfigConfirmacao,
  type ConfigRetoque,
} from '../lib/mensagensAutomaticas';

/**
 * Mensagens automáticas (#12): o que a clínica manda sozinha, quando e com que
 * texto. Qualquer usuária da clínica edita (RLS por tenant). Quem participa é
 * decidido por profissional, no Expediente.
 */

const PADRAO_CONFIRMACAO: ConfigConfirmacao = {
  kind: 'confirmacao', enabled: false, send_time: '09:00', attempts: 2, interval_hours: 4,
  on_no_reply: 'cancelar', texts: TEXTOS_CONFIRMACAO, cancel_text: TEXTO_CANCELAMENTO,
};

const PADRAO_RETOQUE: ConfigRetoque = {
  kind: 'retoque', enabled: false, send_time: '10:00', attempts: 1, days_after: 40, interval_days: 15,
  texts: TEXTOS_RETOQUE.slice(0, 1), procedure_pairs: [{ gatilho: '', retoque: '' }],
};

const campo =
  'px-3 py-2 bg-white border border-accent/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary';

type Procedimento = { id: string; name: string };

export default function MensagensAutomaticas() {
  const { showToast, ToastComponent } = useToast();
  const [confirmacao, setConfirmacao] = useState<ConfigConfirmacao | null>(null);
  const [retoque, setRetoque] = useState<ConfigRetoque | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [erroCarga, setErroCarga] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('automated_messages').select('*'),
      supabase.from('procedures').select('id, name').order('name'),
    ]).then(([msgs, procs]) => {
      if (msgs.error || procs.error) {
        setErroCarga(true);
        return;
      }
      const linhas = (msgs.data ?? []) as Record<string, unknown>[];
      const conf = linhas.find((l) => l.kind === 'confirmacao');
      const ret = linhas.find((l) => l.kind === 'retoque');
      setConfirmacao(conf ? ({ ...(conf as ConfigConfirmacao), send_time: String(conf.send_time).slice(0, 5) }) : PADRAO_CONFIRMACAO);
      setRetoque(ret ? ({ ...(ret as ConfigRetoque), send_time: String(ret.send_time).slice(0, 5) }) : PADRAO_RETOQUE);
      setProcedimentos((procs.data ?? []) as Procedimento[]);
    });
  }, []);

  async function salvar(c: ConfigConfirmacao | ConfigRetoque): Promise<string | undefined> {
    const erros = validar(c);
    if (erros.length) {
      showToast('error', 'Não foi salvo', erros.join(' '));
      return undefined;
    }
    const { id, ...campos } = c;
    const res = id
      ? await supabase.from('automated_messages').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id).select('id').single()
      : await supabase.from('automated_messages').insert(campos).select('id').single();
    if (res.error) {
      showToast('error', 'Não foi salvo', res.error.message);
      return undefined;
    }
    showToast('success', c.enabled ? 'Salvo e ligado' : 'Salvo');
    return res.data.id as string;
  }

  if (erroCarga) {
    return (
      <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        Não foi possível carregar as mensagens automáticas. Recarregue a página.
      </p>
    );
  }
  if (!confirmacao || !retoque) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {ToastComponent}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-text">Mensagens automáticas</h1>
        <p className="text-sm text-text-light max-w-prose">
          Mensagens que a clínica manda sozinha pelo WhatsApp. Quem participa da confirmação é escolhido em
          cada profissional, no Expediente.
        </p>
      </header>

      <Automacao
        titulo="Confirmação da véspera"
        descricao="Pede à cliente para confirmar o horário de amanhã. Qualquer resposta dela suspende o cancelamento."
        config={confirmacao}
        variaveis={VARIAVEIS.confirmacao}
        padraoTextos={TEXTOS_CONFIRMACAO}
        onChange={(c) => setConfirmacao(c as ConfigConfirmacao)}
        onSalvar={async () => {
          const id = await salvar(confirmacao);
          if (id) setConfirmacao({ ...confirmacao, id });
        }}
      >
        <Numero rotulo="Intervalo entre mensagens" sufixo="horas" min={1} max={12}
          valor={confirmacao.interval_hours} onChange={(v) => setConfirmacao({ ...confirmacao, interval_hours: v })} />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-light">Sem resposta</span>
          <select className={campo} value={confirmacao.on_no_reply}
            onChange={(e) => setConfirmacao({ ...confirmacao, on_no_reply: e.target.value as 'cancelar' | 'nada' })}>
            <option value="cancelar">Liberar o horário e avisar a cliente</option>
            <option value="nada">Só parar de mandar</option>
          </select>
        </label>
      </Automacao>

      {confirmacao.on_no_reply === 'cancelar' && (
        <TextoComPrevia rotulo="Aviso de horário liberado" valor={confirmacao.cancel_text}
          onChange={(v) => setConfirmacao({ ...confirmacao, cancel_text: v })} />
      )}

      <Automacao
        titulo="Lembrete de retoque"
        descricao="Lembra da segunda sessão quem concluiu o procedimento. Sai no dia certo — ligar não manda para quem já passou do prazo — e para se a cliente responder ou marcar o retoque."
        config={retoque}
        variaveis={VARIAVEIS.retoque}
        padraoTextos={TEXTOS_RETOQUE}
        onChange={(c) => setRetoque(c as ConfigRetoque)}
        onSalvar={async () => {
          const id = await salvar(retoque);
          if (id) setRetoque({ ...retoque, id });
        }}
      >
        <Numero rotulo="Primeiro lembrete" sufixo="dias depois do procedimento" min={1} max={365}
          valor={retoque.days_after} onChange={(v) => setRetoque({ ...retoque, days_after: v })} />
        <Numero rotulo="Intervalo entre lembretes" sufixo="dias" min={1} max={90}
          valor={retoque.interval_days} onChange={(v) => setRetoque({ ...retoque, interval_days: v })} />
        <fieldset className="w-full space-y-2">
          <legend className="text-sm text-text-light">Procedimento e o retoque dele</legend>
          {retoque.procedure_pairs.map((par, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label="Procedimento" className={campo} value={par.gatilho}
                onChange={(e) => setRetoque({ ...retoque, procedure_pairs: retoque.procedure_pairs.map((p, j) => (j === i ? { ...p, gatilho: e.target.value } : p)) })}>
                <option value="">Procedimento…</option>
                {procedimentos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="text-sm text-text-muted">leva a</span>
              <select aria-label="Retoque" className={campo} value={par.retoque}
                onChange={(e) => setRetoque({ ...retoque, procedure_pairs: retoque.procedure_pairs.map((p, j) => (j === i ? { ...p, retoque: e.target.value } : p)) })}>
                <option value="">Retoque…</option>
                {procedimentos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {retoque.procedure_pairs.length > 1 && (
                <button type="button" aria-label="Tirar este par" className="p-2 text-text-muted hover:text-red-700"
                  onClick={() => setRetoque({ ...retoque, procedure_pairs: retoque.procedure_pairs.filter((_, j) => j !== i) })}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="flex items-center gap-1 text-sm text-primary"
            onClick={() => setRetoque({ ...retoque, procedure_pairs: [...retoque.procedure_pairs, { gatilho: '', retoque: '' }] })}>
            <Plus className="w-4 h-4" /> Outro procedimento
          </button>
        </fieldset>
      </Automacao>
    </div>
  );
}

type AutomacaoProps = {
  titulo: string;
  descricao: string;
  config: ConfigConfirmacao | ConfigRetoque;
  variaveis: readonly string[];
  padraoTextos: string[];
  onChange: (c: ConfigConfirmacao | ConfigRetoque) => void;
  onSalvar: () => Promise<void>;
  children: React.ReactNode;
};

function Automacao({ titulo, descricao, config, variaveis, padraoTextos, onChange, onSalvar, children }: AutomacaoProps) {
  const [salvando, setSalvando] = useState(false);
  const id = titulo.toLowerCase().replace(/\s+/g, '-');

  return (
    <section aria-labelledby={id} className="bg-white rounded-2xl shadow-card p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id={id} className="text-base font-semibold text-text">{titulo}</h2>
          <p className="text-sm text-text-light max-w-prose">{descricao}</p>
        </div>
        <button type="button" role="switch" aria-checked={config.enabled} aria-label={`${titulo} ligada`}
          onClick={() => onChange({ ...config, enabled: !config.enabled })} className="flex items-center gap-2 shrink-0 py-1">
          <span aria-hidden="true" className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${config.enabled ? 'bg-primary' : 'bg-accent/30'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </span>
          <span className="text-sm text-text">{config.enabled ? 'Ligada' : 'Desligada'}</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-light">Horário</span>
          <input type="time" min="06:00" max="20:00" className={campo} value={config.send_time}
            onChange={(e) => onChange({ ...config, send_time: e.target.value })} />
        </label>
        <Numero rotulo="Mensagens" sufixo="no máximo" min={1} max={5} valor={config.attempts}
          onChange={(v) => onChange({ ...config, attempts: v, texts: ajustarTextos(config.texts, v, padraoTextos) })} />
        {children}
      </div>

      <ol className="border-l-2 border-primary/30 pl-4 space-y-2" aria-label="O que acontece com a cliente">
        {linhaDoTempo(config).map((p, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-text">{p.quando}</span>
            <span className="text-text-light"> — {p.oQue}</span>
          </li>
        ))}
      </ol>

      {config.texts.map((t, i) => (
        <TextoComPrevia key={i} rotulo={`${i + 1}ª mensagem`} valor={t}
          onChange={(v) => onChange({ ...config, texts: config.texts.map((x, j) => (j === i ? v : x)) })} />
      ))}
      <p className="text-xs text-text-muted">
        Dá para usar: {variaveis.join(', ')}. Na prévia, elas aparecem preenchidas com um exemplo.
      </p>

      <button type="button" disabled={salvando}
        onClick={async () => { setSalvando(true); await onSalvar(); setSalvando(false); }}
        className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-60">
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </section>
  );
}

function Numero({ rotulo, sufixo, min, max, valor, onChange }: {
  rotulo: string; sufixo: string; min: number; max: number; valor: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-text-light">{rotulo}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={valor} className={`w-20 ${campo}`}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
        <span className="text-sm text-text-muted">{sufixo}</span>
      </span>
    </label>
  );
}

function TextoComPrevia({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-light">{rotulo}</span>
        <textarea rows={5} className={campo} value={valor} onChange={(e) => onChange(e.target.value)} />
      </label>
      <div className="flex flex-col gap-1" aria-label={`Prévia: ${rotulo}`}>
        <span className="text-sm text-text-light">Como a cliente vê</span>
        <p className="self-start max-w-sm whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[#DCF8C6] px-3 py-2 text-sm text-text shadow-sm">
          {previa(valor)}
        </p>
      </div>
    </div>
  );
}
