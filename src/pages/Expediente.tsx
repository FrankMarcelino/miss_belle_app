import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, CalendarOff, CalendarPlus, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { parseSupabaseError } from '../lib/errorHandling';
import { DAY_LONG, WEEK_ORDER, formatRange, type ShiftRow } from '../lib/scheduleBar';
import WeekBar, { HourScale } from '../components/expediente/WeekBar';
import DayEditorSheet, { type RangeInput } from '../components/expediente/DayEditorSheet';
import ExceptionSheet, { type ExceptionInput } from '../components/expediente/ExceptionSheet';

interface ExceptionRow {
  id: string;
  exception_date: string;
  kind: 'block' | 'extra';
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
}

const STEPS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
] as const;

/** Hoje em Brasília, no formato do <input type="date">. Mesma régua do motor (app_local_now). */
function todayInBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatExceptionDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  // Meio-dia evita que o fuso do navegador empurre a data para o dia anterior.
  const date = new Date(y, m - 1, d, 12);
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function errorMessage(err: { code?: string } | null): string {
  if (err?.code === '23P01') {
    return 'Essas faixas se sobrepõem a outra — pode ser neste dia ou no turno da véspera ou do dia seguinte que atravessa a meia-noite. Ajuste os horários.';
  }
  if (err?.code === '42501') {
    return 'Você não tem permissão para alterar o expediente desta profissional.';
  }
  const parsed = parseSupabaseError(err);
  return parsed.description ?? parsed.title;
}

export default function Expediente() {
  const { user, isSuperAdmin } = useAuth();
  const { showToast, ToastComponent } = useToast();

  const [professionals, setProfessionals] = useState<{ id: string; full_name: string }[]>([]);
  const [professionalId, setProfessionalId] = useState<string>('');
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [step, setStep] = useState<number | null>(null);
  const [minNotice, setMinNotice] = useState<number | null>(null);
  const [maxReschedules, setMaxReschedules] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingDow, setEditingDow] = useState<number | null>(null);
  const [addingException, setAddingException] = useState(false);
  const requestId = useRef(0);

  const today = todayInBrasilia();

  useEffect(() => {
    if (user) setProfessionalId((current) => current || user.id);
  }, [user]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setProfessionals(data ?? []));
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    if (!professionalId) return;
    // Trocar de profissional rápido: a resposta antiga não pode pintar a tela nova.
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);

    const [schedRes, excRes, profRes] = await Promise.all([
      supabase.from('professional_schedules').select('day_of_week, starts_at, ends_at').eq('professional_id', professionalId),
      supabase
        .from('schedule_exceptions')
        .select('id, exception_date, kind, starts_at, ends_at, reason')
        .eq('professional_id', professionalId)
        .gte('exception_date', today)
        .order('exception_date'),
      supabase.from('profiles').select('slot_step_minutes, min_notice_hours, max_reschedules').eq('id', professionalId).single(),
    ]);
    if (id !== requestId.current) return;

    if (schedRes.error || excRes.error || profRes.error) {
      setLoadError('Não foi possível carregar o expediente. Recarregue a página.');
    } else {
      setRows(schedRes.data ?? []);
      setExceptions((excRes.data ?? []) as ExceptionRow[]);
      setStep(profRes.data?.slot_step_minutes ?? null);
      setMinNotice(profRes.data?.min_notice_hours ?? null);
      setMaxReschedules(profRes.data?.max_reschedules ?? null);
      saved.current = {
        min_notice_hours: profRes.data?.min_notice_hours ?? null,
        max_reschedules: profRes.data?.max_reschedules ?? null,
      };
    }
    setLoading(false);
  }, [professionalId, today]);

  useEffect(() => {
    load();
  }, [load]);

  const editingInitial = useMemo<RangeInput[]>(
    () =>
      editingDow === null
        ? []
        : rows
            .filter((r) => r.day_of_week === editingDow)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((r) => ({ starts_at: r.starts_at, ends_at: r.ends_at })),
    [rows, editingDow],
  );

  async function saveDay(ranges: RangeInput[]): Promise<string | null> {
    if (editingDow === null) return null;
    const { error } = await supabase.rpc('set_day_schedule', {
      p_professional_id: professionalId,
      p_day_of_week: editingDow,
      p_ranges: ranges,
    });
    if (error) return errorMessage(error);
    showToast('success', `Expediente de ${DAY_LONG[editingDow].toLowerCase()} salvo`);
    await load();
    return null;
  }

  const saved = useRef<{ min_notice_hours: number | null; max_reschedules: number | null }>({
    min_notice_hours: null,
    max_reschedules: null,
  });

  async function savePolicy(field: 'min_notice_hours' | 'max_reschedules', value: number) {
    if (saved.current[field] === value) return; // nada mudou: não grava nem avisa

    const setter = field === 'min_notice_hours' ? setMinNotice : setMaxReschedules;
    const previous = saved.current[field];
    setter(value);

    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', professionalId);
    if (error) {
      setter(previous);
      showToast('error', 'Regra não foi alterada', errorMessage(error));
    } else {
      saved.current[field] = value;
      showToast('success', 'Regra atualizada');
    }
  }

  async function saveStep(value: number) {
    const previous = step;
    setStep(value);
    const { error } = await supabase.from('profiles').update({ slot_step_minutes: value }).eq('id', professionalId);
    if (error) {
      setStep(previous);
      showToast('error', 'Intervalo não foi alterado', errorMessage(error));
    } else {
      showToast('success', 'Intervalo entre horários atualizado');
    }
  }

  async function addException(input: ExceptionInput): Promise<string | null> {
    const { error } = await supabase.from('schedule_exceptions').insert({ ...input, professional_id: professionalId });
    if (error) return errorMessage(error);
    showToast('success', 'Exceção adicionada');
    await load();
    return null;
  }

  async function removeException(id: string) {
    const { error } = await supabase.from('schedule_exceptions').delete().eq('id', id);
    if (error) {
      showToast('error', 'Exceção não foi removida', errorMessage(error));
      return;
    }
    showToast('success', 'Exceção removida');
    setExceptions((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-24">
      {ToastComponent}

      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold text-text">Expediente</h1>
          {isSuperAdmin && professionals.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-text-light">
              <span>Profissional</span>
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="px-3 py-2 bg-white border border-accent/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-sm text-text-light max-w-prose">
          A agenda só oferece horário dentro destas faixas. Toque num dia para mudar.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {loadError}
        </p>
      ) : (
        <>
          <section aria-labelledby="semana" className="bg-white rounded-2xl shadow-card py-2">
            <h2 id="semana" className="sr-only">
              Semana
            </h2>
            {WEEK_ORDER.map((dow) => (
              <WeekBar key={dow} dow={dow} rows={rows} onEdit={() => setEditingDow(dow)} />
            ))}
            <HourScale />
          </section>

          <section aria-labelledby="intervalo" className="space-y-3">
            <h2 id="intervalo" className="text-base font-semibold text-text">
              Intervalo entre horários
            </h2>
            <p className="text-sm text-text-light">Com 30 min, a agenda oferece 09:00, 09:30, 10:00…</p>
            <div role="radiogroup" aria-labelledby="intervalo" className="inline-flex p-1 bg-champagne-nuvem rounded-xl">
              {STEPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={step === s.value}
                  onClick={() => step !== s.value && saveStep(s.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    step === s.value ? 'bg-white text-text shadow-card' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="whatsapp" className="space-y-3">
            <h2 id="whatsapp" className="text-base font-semibold text-text">
              Agendamentos pelo WhatsApp
            </h2>
            <p className="text-sm text-text-light max-w-prose">
              Valem só para a cliente que marca sozinha pelo assistente. Você continua cancelando e
              remarcando por aqui sem limite.
            </p>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-light">Antecedência mínima para cancelar</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={72}
                    value={minNotice ?? 0}
                    onChange={(e) => setMinNotice(Math.max(0, Number(e.target.value)))}
                    onBlur={(e) => savePolicy('min_notice_hours', Math.max(0, Number(e.target.value)))}
                    className="w-20 px-3 py-2 bg-white border border-accent/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-sm text-text-muted">horas</span>
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-light">Remarcações permitidas</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={maxReschedules ?? 0}
                    onChange={(e) => setMaxReschedules(Math.max(0, Number(e.target.value)))}
                    onBlur={(e) => savePolicy('max_reschedules', Math.max(0, Number(e.target.value)))}
                    className="w-20 px-3 py-2 bg-white border border-accent/20 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-sm text-text-muted">por agendamento</span>
                </span>
              </label>
            </div>
          </section>

          <section aria-labelledby="excecoes" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="excecoes" className="text-base font-semibold text-text">
                Exceções
              </h2>
              <button
                type="button"
                onClick={() => setAddingException(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-grafite-rosado text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {exceptions.length === 0 ? (
              <p className="text-sm text-text-muted bg-champagne-nuvem rounded-xl px-4 py-4">
                Nenhuma folga ou horário extra marcado. Use exceções para feriados, folgas e encaixes fora do expediente.
              </p>
            ) : (
              <ul className="bg-white rounded-2xl shadow-card divide-y divide-accent/15">
                {exceptions.map((e) => {
                  const Icon = e.kind === 'extra' ? CalendarPlus : e.starts_at ? Ban : CalendarOff;
                  const what =
                    e.kind === 'extra'
                      ? `Atende ${formatRange(e.starts_at!, e.ends_at!)}`
                      : e.starts_at
                        ? `Bloqueado ${formatRange(e.starts_at, e.ends_at!)}`
                        : 'Folga o dia inteiro';
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <Icon className={`w-5 h-5 flex-shrink-0 ${e.kind === 'extra' ? 'text-dourado-neblina' : 'text-rosa-aurora'}`} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text capitalize">{formatExceptionDate(e.exception_date)}</p>
                        <p className="text-xs text-text-light">{what}</p>
                        {e.reason && <p className="text-xs text-text-muted truncate">{e.reason}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeException(e.id)}
                        aria-label={`Remover exceção de ${formatExceptionDate(e.exception_date)}`}
                        className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <DayEditorSheet dow={editingDow} initial={editingInitial} onClose={() => setEditingDow(null)} onSave={saveDay} />
      <ExceptionSheet isOpen={addingException} minDate={today} onClose={() => setAddingException(false)} onSave={addException} />
    </div>
  );
}
