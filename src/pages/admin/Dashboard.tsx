import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Boxes, ChevronDown, ChevronUp, ClipboardList, Euro, FolderKanban,
  Hammer, Settings2, TriangleAlert,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { PageHeader, Panel } from '@/components/ui/Layout';
import { ErrorBox, Loading } from '@/components/ui/Feedback';
import { dashboardSummary } from '@/services/reports';
import { setPreferences } from '@/services/settings';
import { PHASE_LABEL, PHASES } from '@/config/constants';
import {
  PERIOD_LABEL, fmtDate, fmtEur, fmtHours, fmtNumber, periodLabel, periodRange,
  todayMadrid, type PeriodKey,
} from '@/lib/format';
import type { ProjectPhase } from '@/types/db';

type CardKey = 'alertas' | 'produccion' | 'ordenes' | 'proyectos' | 'material' | 'economico';

const CARDS: { key: CardKey; label: string; hint: string }[] = [
  { key: 'alertas',    label: 'Lo que requiere atención', hint: 'Órdenes atrasadas, material retrasado y avisos' },
  { key: 'produccion', label: 'Producción',               hint: 'Horas de fabricación y montaje del periodo' },
  { key: 'ordenes',    label: 'Órdenes de trabajo',       hint: 'Cómo están las órdenes ahora mismo' },
  { key: 'proyectos',  label: 'Proyectos',                hint: 'Activos, creados, finalizados y reparto por fase' },
  { key: 'material',   label: 'Material',                 hint: 'Pendiente, retrasado y recibido' },
  { key: 'economico',  label: 'Economía',                 hint: 'Presupuestado, cobrado y pendiente de cobro' },
];

const DEFAULT_CARDS: CardKey[] = ['alertas', 'produccion', 'ordenes', 'proyectos', 'material', 'economico'];
const PERIODS: PeriodKey[] = ['semana', 'mes', 'trimestre', 'ano', 'personalizado'];

/**
 * Panel de inicio de administración.
 *
 * Reúne producción, proyectos, órdenes, alertas, material y la parte
 * económica. Cada persona decide qué tarjetas ve y en qué orden, y sus
 * preferencias se guardan en su perfil.
 *
 * El periodo por defecto es ESTE MES. A propósito no hay ninguna alerta
 * de exceso de horas.
 */
export default function Dashboard() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useDialogs();
  const today = todayMadrid();

  const saved = (profile?.preferences ?? {}) as {
    dashboard?: CardKey[]; dashboardPeriod?: PeriodKey;
  };

  const [period, setPeriod] = useState<PeriodKey>(saved.dashboardPeriod ?? 'mes');
  const [custom, setCustom] = useState(() => periodRange('mes', today));
  const [cards, setCards] = useState<CardKey[]>(saved.dashboard?.length ? saved.dashboard : DEFAULT_CARDS);
  const [configuring, setConfiguring] = useState(false);

  // Si el perfil llega más tarde, se adoptan sus preferencias guardadas.
  useEffect(() => {
    const prefs = (profile?.preferences ?? {}) as { dashboard?: CardKey[]; dashboardPeriod?: PeriodKey };
    if (prefs.dashboard?.length) setCards(prefs.dashboard);
    if (prefs.dashboardPeriod) setPeriod(prefs.dashboardPeriod);
  }, [profile?.id]);

  const range = useMemo(
    () => (period === 'personalizado' ? custom : periodRange(period, today)),
    [period, custom, today],
  );

  const data = useAsync(() => dashboardSummary(range.from, range.to), [range.from, range.to]);

  async function save(next: { dashboard?: CardKey[]; dashboardPeriod?: PeriodKey }) {
    try {
      await setPreferences(next);
      await refreshProfile();
    } catch { toast.error(new Error('No se han podido guardar tus preferencias.')); }
  }

  function toggleCard(key: CardKey) {
    const next = cards.includes(key) ? cards.filter((c) => c !== key) : [...cards, key];
    setCards(next);
    void save({ dashboard: next });
  }

  function move(key: CardKey, direction: -1 | 1) {
    const index = cards.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    setCards(next);
    void save({ dashboard: next });
  }

  function choosePeriod(key: PeriodKey) {
    setPeriod(key);
    if (key !== 'personalizado') void save({ dashboardPeriod: key });
  }

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} />;
  if (!data.data) return null;

  const d = data.data;
  const alerts = [
    { n: d.alertas.ordenes_por_revisar, label: 'órdenes pendientes de revisión', to: '/admin/ordenes' },
    { n: d.alertas.ordenes_atrasadas, label: 'órdenes atrasadas sin enviar', to: '/admin/ordenes' },
    { n: d.alertas.material_retrasado, label: 'materiales que no han llegado a tiempo', to: '/admin/material' },
    { n: d.alertas.avisos_taller, label: 'avisos de material del taller por revisar', to: '/admin/material' },
    { n: d.alertas.fichas_por_asignar, label: 'fichas por asignar', to: '/admin/fichas' },
    { n: d.alertas.presupuestos_enviados, label: 'presupuestos enviados esperando respuesta', to: '/admin/fichas' },
  ].filter((a) => a.n > 0);

  const porFase = d.proyectos.por_fase ?? {};
  const maxFase = Math.max(1, ...PHASES.map((p) => porFase[p] ?? 0));

  const content: Record<CardKey, React.ReactNode> = {
    alertas: (
      <Panel key="alertas" title={<span className="row" style={{ gap: 7 }}>
        <TriangleAlert size={17} />Requiere tu atención</span>}>
        {alerts.length ? (
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.label}>
                <Link to={a.to}>
                  <strong className="num">{a.n}</strong>
                  <span>{a.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted row" style={{ margin: 0, gap: 8 }}>
            <AlertTriangle size={17} aria-hidden />Nada pendiente. Todo al día.
          </p>
        )}
      </Panel>
    ),

    produccion: (
      <Panel key="produccion" title={<span className="row" style={{ gap: 7 }}>
        <Hammer size={17} />Producción</span>}>
        <div className="figure-row">
          <span className="figure"><b>{fmtHours(d.produccion.horas_fabricacion)}</b><span>Fabricación</span></span>
          <span className="figure"><b>{fmtHours(d.produccion.horas_montaje)}</b><span>Montaje</span></span>
          <span className="figure"><b>{fmtHours(d.produccion.horas_totales)}</b><span>Total del periodo</span></span>
          <span className="figure"><b>{fmtNumber(d.produccion.ordenes_validadas)}</b><span>Órdenes validadas</span></span>
          <span className="figure"><b>{fmtNumber(d.produccion.trabajadores)}</b><span>Personas con horas</span></span>
        </div>
      </Panel>
    ),

    ordenes: (
      <Panel key="ordenes" title={<span className="row" style={{ gap: 7 }}>
        <ClipboardList size={17} />Órdenes de trabajo</span>}
        actions={<Link className="btn btn-sm" to="/admin/ordenes">Ver todas</Link>}>
        <div className="figure-row">
          <span className="figure"><b>{fmtNumber(d.ordenes.hoy)}</b><span>Hoy</span></span>
          <span className="figure"><b>{fmtNumber(d.ordenes.pendientes)}</b><span>Pendientes</span></span>
          <span className="figure"><b>{fmtNumber(d.ordenes.en_curso)}</b><span>En curso</span></span>
          <span className="figure"><b>{fmtNumber(d.ordenes.por_revisar)}</b><span>Por revisar</span></span>
          <span className="figure"><b>{fmtNumber(d.ordenes.devueltas)}</b><span>Devueltas</span></span>
        </div>
      </Panel>
    ),

    proyectos: (
      <Panel key="proyectos" title={<span className="row" style={{ gap: 7 }}>
        <FolderKanban size={17} />Proyectos</span>}
        actions={<Link className="btn btn-sm" to="/admin/proyectos">Ver todos</Link>}>
        <div className="figure-row" style={{ marginBottom: 14 }}>
          <span className="figure"><b>{fmtNumber(d.proyectos.activos)}</b><span>Activos</span></span>
          <span className="figure"><b>{fmtNumber(d.proyectos.creados)}</b><span>Creados en el periodo</span></span>
          <span className="figure"><b>{fmtNumber(d.proyectos.finalizados)}</b><span>Finalizados</span></span>
          <span className="figure">
            <b>{d.proyectos.dias_medio ? `${fmtNumber(d.proyectos.dias_medio)} días` : '—'}</b>
            <span>Tiempo medio</span>
          </span>
        </div>
        <div className="bar-list">
          {PHASES.filter((p) => p !== 'finalizado').map((phase) => (
            <div key={phase} className="bar-row">
              <span className="bar-label">{PHASE_LABEL[phase as ProjectPhase]}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${((porFase[phase] ?? 0) / maxFase) * 100}%` }} />
              </span>
              <span className="bar-value num">{fmtNumber(porFase[phase] ?? 0)}</span>
            </div>
          ))}
        </div>
      </Panel>
    ),

    material: (
      <Panel key="material" title={<span className="row" style={{ gap: 7 }}>
        <Boxes size={17} />Material</span>}
        actions={<Link className="btn btn-sm" to="/admin/material">Ver todo</Link>}>
        <div className="figure-row">
          <span className="figure"><b>{fmtNumber(d.material.pendientes)}</b><span>Pendiente de llegar</span></span>
          <span className="figure"><b>{fmtNumber(d.material.retrasados)}</b><span>Retrasado</span></span>
          <span className="figure"><b>{fmtNumber(d.material.recibidos)}</b><span>Recibido en el periodo</span></span>
        </div>
      </Panel>
    ),

    economico: (
      <Panel key="economico" title={<span className="row" style={{ gap: 7 }}>
        <Euro size={17} />Economía</span>}
        actions={<Link className="btn btn-sm" to="/admin/facturacion">Facturación</Link>}>
        <div className="figure-row">
          <span className="figure"><b>{fmtEur(d.economico.presupuestado)}</b><span>Presupuestado (activos)</span></span>
          <span className="figure"><b>{fmtEur(d.economico.cobrado)}</b><span>Cobrado</span></span>
          <span className="figure"><b>{fmtEur(d.economico.pendiente)}</b><span>Pendiente de cobro</span></span>
          <span className="figure"><b>{fmtEur(d.cobrado_periodo)}</b><span>Cobrado en el periodo</span></span>
        </div>
      </Panel>
    ),
  };

  return (
    <>
      <PageHeader
        title={`Hola, ${profile?.full_name.split(' ')[0] ?? ''}`}
        sub={`${PERIOD_LABEL[period]} · ${periodLabel(range.from, range.to)}`}
        actions={
          <button className="btn" onClick={() => setConfiguring((v) => !v)} aria-expanded={configuring}>
            <Settings2 />Configurar panel
          </button>
        }
      />

      <div className="toolbar" style={{ border: 0, paddingLeft: 0, paddingRight: 0 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button key={p} className="chip" aria-pressed={period === p} onClick={() => choosePeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {period === 'personalizado' && (
          <div className="row" style={{ gap: 8 }}>
            <label htmlFor="db-from" className="label" style={{ margin: 0 }}>Desde</label>
            <input id="db-from" className="input" type="date" value={custom.from}
                   onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <label htmlFor="db-to" className="label" style={{ margin: 0 }}>Hasta</label>
            <input id="db-to" className="input" type="date" value={custom.to}
                   onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </div>

      {configuring && (
        <Panel title="Qué quieres ver en tu panel">
          <p className="hint" style={{ marginTop: 0 }}>
            Marca las tarjetas que te interesan y ordénalas. Se guarda para ti,
            no cambia el panel de nadie más.
          </p>
          <ul className="card-config">
            {[...cards, ...CARDS.map((c) => c.key).filter((k) => !cards.includes(k))].map((key) => {
              const card = CARDS.find((c) => c.key === key);
              if (!card) return null;
              const shown = cards.includes(key);
              return (
                <li key={key}>
                  <label className="checkbox" style={{ margin: 0, flex: 1 }}>
                    <input type="checkbox" checked={shown} onChange={() => toggleCard(key)} />
                    <span className="cell-main">
                      <strong>{card.label}</strong>
                      <small>{card.hint}</small>
                    </span>
                  </label>
                  {shown && (
                    <span className="row" style={{ gap: 2 }}>
                      <button className="btn btn-ghost icon-btn" aria-label={`Subir ${card.label}`}
                              disabled={cards.indexOf(key) === 0}
                              onClick={() => move(key, -1)}><ChevronUp /></button>
                      <button className="btn btn-ghost icon-btn" aria-label={`Bajar ${card.label}`}
                              disabled={cards.indexOf(key) === cards.length - 1}
                              onClick={() => move(key, 1)}><ChevronDown /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="stack" style={{ gap: 16, marginTop: configuring ? 16 : 0 }}>
        {cards.length
          ? cards.map((key) => content[key])
          : <Panel title="Panel vacío">
              <p className="muted" style={{ margin: 0 }}>
                No has dejado ninguna tarjeta visible. Pulsa «Configurar panel» para elegirlas.
              </p>
            </Panel>}
      </div>

      <p className="hint" style={{ marginTop: 16 }}>
        Datos a {fmtDate(today)}. Las horas y los importes del periodo se recalculan al cambiar las fechas.
      </p>
    </>
  );
}
