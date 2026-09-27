import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  reportHoursByProject, reportHoursByWorker, reportMaterials, reportProjects,
  reportProjectsByPhase, reportSuppliers,
} from '@/services/reports';
import { makeXlsx, type XlsxSheet } from '@/lib/export/xlsx';
import { makePdf, type PdfTable } from '@/lib/export/pdf';
import { MIME, downloadBytes, safeFileName } from '@/lib/download';
import {
  PERIOD_LABEL, fmtDate, fmtDateTime, fmtEur, fmtHours, fmtNumber,
  periodLabel, periodRange, todayMadrid, type PeriodKey,
} from '@/lib/format';

type Tab = 'proyectos' | 'horas' | 'material';

const PERIODS: PeriodKey[] = ['semana', 'mes', 'trimestre', 'ano', 'personalizado'];

const TAB_TITLE: Record<Tab, string> = {
  proyectos: 'Informe de proyectos',
  horas: 'Informe de horas',
  material: 'Informe de material',
};

/**
 * Informes de la empresa, con exportación a Excel y a PDF.
 *
 * Los números los calcula la base de datos: la pantalla solo los
 * presenta, así que el Excel, el PDF y lo que se ve coinciden siempre.
 */
export default function ReportsPage() {
  const { companyName } = useAuth();
  const { toast } = useDialogs();
  const today = todayMadrid();

  const [tab, setTab] = useState<Tab>('proyectos');
  const [period, setPeriod] = useState<PeriodKey>('mes');
  const [custom, setCustom] = useState(() => periodRange('mes', today));

  const range = useMemo(
    () => (period === 'personalizado' ? custom : periodRange(period, today)),
    [period, custom, today],
  );
  const { from, to } = range;
  const subtitle = periodLabel(from, to);

  // Cada informe recorre todos los proyectos, partes de horas o material
  // del periodo. Se pide SOLO el de la pestaña que se está mirando: pedir
  // los seis de golpe era la pantalla más cara de la aplicación.
  const vacio = () => Promise.resolve([]);
  const enProyectos = tab === 'proyectos';
  const enHoras = tab === 'horas';
  const enMaterial = tab === 'material';

  const projects = useAsync(
    () => (enProyectos ? reportProjects(from, to) : vacio()), [from, to, tab]);
  const phases = useAsync(
    () => (enProyectos ? reportProjectsByPhase(from, to) : vacio()), [from, to, tab]);
  const byWorker = useAsync(
    () => (enHoras ? reportHoursByWorker(from, to) : vacio()), [from, to, tab]);
  const byProject = useAsync(
    () => (enHoras ? reportHoursByProject(from, to) : vacio()), [from, to, tab]);
  const materials = useAsync(
    () => (enMaterial ? reportMaterials(from, to) : vacio()), [from, to, tab]);
  const suppliers = useAsync(
    () => (enMaterial ? reportSuppliers(from, to) : vacio()), [from, to, tab]);

  const activos = enProyectos ? [projects, phases]
    : enHoras ? [byWorker, byProject]
    : [materials, suppliers];
  const loading = activos.some((q) => q.loading && !q.data);
  const failed = activos.find((q) => q.error);

  // ------------------------------------------------------------------
  // Totales
  // ------------------------------------------------------------------
  const p = projects.data ?? [];
  const finished = p.filter((r) => r.dias !== null);
  const totals = {
    creados: p.filter((r) => r.creado >= from && r.creado <= to).length,
    finalizados: finished.filter((r) => (r.finalizado ?? '') >= from && (r.finalizado ?? '') <= to).length,
    diasMedio: finished.length
      ? Math.round(finished.reduce((s, r) => s + (r.dias ?? 0), 0) / finished.length) : 0,
    presupuesto: p.reduce((s, r) => s + Number(r.presupuesto), 0),
    cobrado: p.reduce((s, r) => s + Number(r.cobrado), 0),
    pendiente: p.reduce((s, r) => s + Number(r.pendiente), 0),
    horas: p.reduce((s, r) => s + Number(r.horas_reales), 0),
  };

  const w = byWorker.data ?? [];
  const hoursTotals = {
    fabricacion: w.reduce((s, r) => s + Number(r.fabricacion), 0),
    montaje: w.reduce((s, r) => s + Number(r.montaje), 0),
    total: w.reduce((s, r) => s + Number(r.total), 0),
  };

  const m = materials.data ?? [];
  const materialTotals = {
    pendientes: m.filter((r) => !r.recibido).length,
    retrasados: m.filter((r) => r.dias_retraso > 0).length,
    proveedores: (suppliers.data ?? []).length,
  };

  // ------------------------------------------------------------------
  // Exportación
  // ------------------------------------------------------------------
  function sheetsFor(active: Tab): XlsxSheet[] {
    if (active === 'proyectos') {
      return [
        {
          name: 'Proyectos', title: TAB_TITLE.proyectos, subtitle,
          columns: [
            { key: 'code', label: 'Código', width: 16 },
            { key: 'name', label: 'Proyecto', width: 34 },
            { key: 'cliente', label: 'Cliente', width: 26 },
            { key: 'fase', label: 'Fase', width: 16 },
            { key: 'estado_cobro', label: 'Facturación', width: 20 },
            { key: 'creado', label: 'Creado', type: 'date', width: 13 },
            { key: 'finalizado', label: 'Finalizado', type: 'date', width: 13 },
            { key: 'dias', label: 'Días', type: 'int', width: 9 },
            { key: 'presupuesto', label: 'Presupuesto', type: 'eur', width: 15 },
            { key: 'cobrado', label: 'Cobrado', type: 'eur', width: 15 },
            { key: 'pendiente', label: 'Pendiente', type: 'eur', width: 15 },
            { key: 'horas_previstas', label: 'Horas previstas', type: 'hours', width: 15 },
            { key: 'horas_reales', label: 'Horas reales', type: 'hours', width: 14 },
          ],
          rows: p,
          totals: {
            code: 'TOTAL', presupuesto: totals.presupuesto, cobrado: totals.cobrado,
            pendiente: totals.pendiente, horas_reales: totals.horas,
          },
        },
        {
          name: 'Por fase', title: 'Proyectos por fase', subtitle,
          columns: [
            { key: 'fase', label: 'Fase', width: 22 },
            { key: 'proyectos', label: 'Proyectos', type: 'int', width: 12 },
            { key: 'presupuesto', label: 'Presupuesto', type: 'eur', width: 16 },
            { key: 'horas_reales', label: 'Horas reales', type: 'hours', width: 14 },
          ],
          rows: phases.data ?? [],
        },
      ];
    }

    if (active === 'horas') {
      return [
        {
          name: 'Por trabajador', title: 'Horas por trabajador', subtitle,
          columns: [
            { key: 'trabajador', label: 'Trabajador', width: 28 },
            { key: 'fabricacion', label: 'Fabricación', type: 'hours', width: 14 },
            { key: 'montaje', label: 'Montaje', type: 'hours', width: 14 },
            { key: 'total', label: 'Total', type: 'hours', width: 14 },
            { key: 'ordenes', label: 'Órdenes', type: 'int', width: 11 },
          ],
          rows: w,
          totals: {
            trabajador: 'TOTAL', fabricacion: hoursTotals.fabricacion,
            montaje: hoursTotals.montaje, total: hoursTotals.total,
          },
        },
        {
          name: 'Por proyecto', title: 'Horas por proyecto', subtitle,
          columns: [
            { key: 'code', label: 'Código', width: 16 },
            { key: 'name', label: 'Proyecto', width: 32 },
            { key: 'cliente', label: 'Cliente', width: 24 },
            { key: 'previstas', label: 'Previstas', type: 'hours', width: 13 },
            { key: 'fabricacion', label: 'Fabricación', type: 'hours', width: 14 },
            { key: 'montaje', label: 'Montaje', type: 'hours', width: 13 },
            { key: 'total', label: 'Reales', type: 'hours', width: 13 },
            { key: 'desvio', label: 'Desvío', type: 'hours', width: 13 },
          ],
          rows: byProject.data ?? [],
        },
      ];
    }

    return [
      {
        name: 'Material', title: 'Material', subtitle,
        columns: [
          { key: 'material', label: 'Material', width: 32 },
          { key: 'unidades', label: 'Unidades', type: 'number', width: 12 },
          { key: 'proveedor', label: 'Proveedor', width: 24 },
          { key: 'proyecto', label: 'Proyecto', width: 16 },
          { key: 'pedido', label: 'Pedido', type: 'date', width: 13 },
          { key: 'previsto', label: 'Previsto', type: 'date', width: 13 },
          { key: 'recibido_texto', label: 'Recibido', width: 12 },
          { key: 'dias_retraso', label: 'Días de retraso', type: 'int', width: 15 },
        ],
        rows: m.map((r) => ({ ...r, recibido_texto: r.recibido ? 'Sí' : 'No' })),
      },
      {
        name: 'Proveedores', title: 'Proveedores más utilizados', subtitle,
        columns: [
          { key: 'proveedor', label: 'Proveedor', width: 30 },
          { key: 'pedidos', label: 'Pedidos', type: 'int', width: 12 },
          { key: 'pendientes', label: 'Pendientes', type: 'int', width: 13 },
          { key: 'retrasados', label: 'Retrasados', type: 'int', width: 13 },
          { key: 'retraso_medio', label: 'Retraso medio (días)', type: 'number', width: 20 },
        ],
        rows: suppliers.data ?? [],
      },
    ];
  }

  function exportExcel() {
    try {
      const bytes = makeXlsx(sheetsFor(tab), { company: companyName, title: TAB_TITLE[tab] });
      downloadBytes(bytes, `${safeFileName(`${TAB_TITLE[tab]} ${from} ${to}`)}.xlsx`, MIME.xlsx);
      toast.success('Excel generado');
    } catch (e) { toast.error(e); }
  }

  function exportPdf() {
    try {
      const tables: PdfTable[] = [];
      let summary: { label: string; value: string }[] = [];

      if (tab === 'proyectos') {
        summary = [
          { label: 'Proyectos creados', value: fmtNumber(totals.creados) },
          { label: 'Finalizados', value: fmtNumber(totals.finalizados) },
          { label: 'Tiempo medio', value: totals.diasMedio ? `${totals.diasMedio} días` : '—' },
          { label: 'Pendiente de cobro', value: fmtEur(totals.pendiente) },
        ];
        tables.push({
          title: 'Proyectos por fase',
          columns: [
            { key: 'fase', label: 'Fase', width: 3 },
            { key: 'proyectos', label: 'Proyectos', width: 1, align: 'right' },
            { key: 'presupuesto', label: 'Presupuesto', width: 2, align: 'right' },
            { key: 'horas', label: 'Horas reales', width: 2, align: 'right' },
          ],
          rows: (phases.data ?? []).map((r) => ({
            fase: r.fase, proyectos: fmtNumber(r.proyectos),
            presupuesto: fmtEur(r.presupuesto), horas: fmtHours(r.horas_reales),
          })),
        });
        tables.push({
          title: 'Detalle de proyectos',
          columns: [
            { key: 'code', label: 'Código', width: 2 },
            { key: 'name', label: 'Proyecto', width: 4 },
            { key: 'cliente', label: 'Cliente', width: 3 },
            { key: 'fase', label: 'Fase', width: 2 },
            { key: 'dias', label: 'Días', width: 1, align: 'right' },
            { key: 'presupuesto', label: 'Presupuesto', width: 2, align: 'right' },
            { key: 'cobrado', label: 'Cobrado', width: 2, align: 'right' },
            { key: 'pendiente', label: 'Pendiente', width: 2, align: 'right' },
            { key: 'horas', label: 'Horas', width: 2, align: 'right' },
          ],
          rows: p.map((r) => ({
            code: r.code, name: r.name, cliente: r.cliente, fase: r.fase,
            dias: r.dias === null ? '—' : String(r.dias),
            presupuesto: fmtEur(r.presupuesto), cobrado: fmtEur(r.cobrado),
            pendiente: fmtEur(r.pendiente), horas: fmtHours(r.horas_reales),
          })),
          totals: {
            code: 'TOTAL', presupuesto: fmtEur(totals.presupuesto),
            cobrado: fmtEur(totals.cobrado), pendiente: fmtEur(totals.pendiente),
            horas: fmtHours(totals.horas),
          },
        });
      }

      if (tab === 'horas') {
        summary = [
          { label: 'Horas de fabricación', value: fmtHours(hoursTotals.fabricacion) },
          { label: 'Horas de montaje', value: fmtHours(hoursTotals.montaje) },
          { label: 'Horas totales', value: fmtHours(hoursTotals.total) },
          { label: 'Personas', value: fmtNumber(w.length) },
        ];
        tables.push({
          title: 'Horas por trabajador',
          columns: [
            { key: 'trabajador', label: 'Trabajador', width: 4 },
            { key: 'fabricacion', label: 'Fabricación', width: 2, align: 'right' },
            { key: 'montaje', label: 'Montaje', width: 2, align: 'right' },
            { key: 'total', label: 'Total', width: 2, align: 'right' },
            { key: 'ordenes', label: 'Órdenes', width: 1, align: 'right' },
          ],
          rows: w.map((r) => ({
            trabajador: r.trabajador, fabricacion: fmtHours(r.fabricacion),
            montaje: fmtHours(r.montaje), total: fmtHours(r.total), ordenes: fmtNumber(r.ordenes),
          })),
          totals: {
            trabajador: 'TOTAL', fabricacion: fmtHours(hoursTotals.fabricacion),
            montaje: fmtHours(hoursTotals.montaje), total: fmtHours(hoursTotals.total),
          },
        });
        tables.push({
          title: 'Horas por proyecto',
          columns: [
            { key: 'code', label: 'Código', width: 2 },
            { key: 'name', label: 'Proyecto', width: 4 },
            { key: 'previstas', label: 'Previstas', width: 2, align: 'right' },
            { key: 'fabricacion', label: 'Fabricación', width: 2, align: 'right' },
            { key: 'montaje', label: 'Montaje', width: 2, align: 'right' },
            { key: 'total', label: 'Reales', width: 2, align: 'right' },
            { key: 'desvio', label: 'Desvío', width: 2, align: 'right' },
          ],
          rows: (byProject.data ?? []).map((r) => ({
            code: r.code, name: r.name, previstas: fmtHours(r.previstas),
            fabricacion: fmtHours(r.fabricacion), montaje: fmtHours(r.montaje),
            total: fmtHours(r.total), desvio: fmtHours(r.desvio),
          })),
        });
      }

      if (tab === 'material') {
        summary = [
          { label: 'Material pendiente', value: fmtNumber(materialTotals.pendientes) },
          { label: 'Con retraso', value: fmtNumber(materialTotals.retrasados) },
          { label: 'Proveedores', value: fmtNumber(materialTotals.proveedores) },
        ];
        tables.push({
          title: 'Material',
          columns: [
            { key: 'material', label: 'Material', width: 4 },
            { key: 'unidades', label: 'Unidades', width: 1, align: 'right' },
            { key: 'proveedor', label: 'Proveedor', width: 3 },
            { key: 'proyecto', label: 'Proyecto', width: 2 },
            { key: 'pedido', label: 'Pedido', width: 2 },
            { key: 'previsto', label: 'Previsto', width: 2 },
            { key: 'recibido', label: 'Recibido', width: 1 },
            { key: 'retraso', label: 'Retraso', width: 1, align: 'right' },
          ],
          rows: m.map((r) => ({
            material: r.material,
            unidades: r.unidades === null ? '—' : fmtNumber(r.unidades),
            proveedor: r.proveedor, proyecto: r.proyecto,
            pedido: r.pedido ? fmtDate(r.pedido) : '—',
            previsto: r.previsto ? fmtDate(r.previsto) : '—',
            recibido: r.recibido ? 'Sí' : 'No',
            retraso: r.dias_retraso ? `${r.dias_retraso} días` : '—',
          })),
        });
        tables.push({
          title: 'Proveedores más utilizados',
          columns: [
            { key: 'proveedor', label: 'Proveedor', width: 4 },
            { key: 'pedidos', label: 'Pedidos', width: 1, align: 'right' },
            { key: 'pendientes', label: 'Pendientes', width: 1, align: 'right' },
            { key: 'retrasados', label: 'Retrasados', width: 1, align: 'right' },
            { key: 'medio', label: 'Retraso medio', width: 2, align: 'right' },
          ],
          rows: (suppliers.data ?? []).map((r) => ({
            proveedor: r.proveedor, pedidos: fmtNumber(r.pedidos),
            pendientes: fmtNumber(r.pendientes), retrasados: fmtNumber(r.retrasados),
            medio: r.retraso_medio ? `${fmtNumber(r.retraso_medio)} días` : '—',
          })),
        });
      }

      const bytes = makePdf({
        company: companyName,
        title: TAB_TITLE[tab],
        subtitle,
        summary,
        tables,
        footer: `Generado el ${fmtDateTime(new Date().toISOString())} · METALPLAFER360`,
      });
      downloadBytes(bytes, `${safeFileName(`${TAB_TITLE[tab]} ${from} ${to}`)}.pdf`, MIME.pdf);
      toast.success('PDF generado');
    } catch (e) { toast.error(e); }
  }

  return (
    <>
      <PageHeader
        title="Informes"
        sub={`${PERIOD_LABEL[period]} · ${subtitle}`}
        actions={<>
          <button className="btn" onClick={exportExcel} disabled={loading}>
            <FileSpreadsheet />Excel
          </button>
          <button className="btn" onClick={exportPdf} disabled={loading}>
            <FileText />PDF
          </button>
        </>}
      />

      <div className="toolbar" style={{ border: 0, paddingLeft: 0, paddingRight: 0 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map((k) => (
            <button key={k} className="chip" aria-pressed={period === k} onClick={() => setPeriod(k)}>
              {PERIOD_LABEL[k]}
            </button>
          ))}
        </div>
        {period === 'personalizado' && (
          <div className="row" style={{ gap: 8 }}>
            <label htmlFor="rp-from" className="label" style={{ margin: 0 }}>Desde</label>
            <input id="rp-from" className="input" type="date" value={custom.from}
                   onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <label htmlFor="rp-to" className="label" style={{ margin: 0 }}>Hasta</label>
            <input id="rp-to" className="input" type="date" value={custom.to}
                   onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
      </div>

      <section className="panel">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'proyectos' as const, label: 'Proyectos' },
            { key: 'horas' as const, label: 'Horas' },
            { key: 'material' as const, label: 'Material' },
          ]}
        />
      </section>

      {failed ? <ErrorBox message={failed.error ?? ''} onRetry={failed.reload} />
        : loading ? <Loading />
        : (
          <div className="stack" style={{ gap: 16, marginTop: 16 }}>
            {tab === 'proyectos' && (
              <>
                <Panel title="En cifras">
                  <div className="figure-row">
                    <span className="figure"><b>{fmtNumber(totals.creados)}</b><span>Creados</span></span>
                    <span className="figure"><b>{fmtNumber(totals.finalizados)}</b><span>Finalizados</span></span>
                    <span className="figure">
                      <b>{totals.diasMedio ? `${totals.diasMedio} días` : '—'}</b>
                      <span>Tiempo medio</span>
                    </span>
                    <span className="figure"><b>{fmtEur(totals.presupuesto)}</b><span>Presupuestado</span></span>
                    <span className="figure"><b>{fmtEur(totals.cobrado)}</b><span>Cobrado</span></span>
                    <span className="figure"><b>{fmtEur(totals.pendiente)}</b><span>Pendiente</span></span>
                  </div>
                </Panel>

                <Panel title="Proyectos por fase" tight>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr>
                        <th>Fase</th><th className="right">Proyectos</th>
                        <th className="right">Presupuesto</th><th className="right">Horas reales</th>
                      </tr></thead>
                      <tbody>
                        {(phases.data ?? []).map((r) => (
                          <tr key={r.fase}>
                            <td>{r.fase}</td>
                            <td className="right num">{fmtNumber(r.proyectos)}</td>
                            <td className="right num">{fmtEur(r.presupuesto)}</td>
                            <td className="right num">{fmtHours(r.horas_reales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="Detalle de proyectos" tight>
                  {p.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          <th>Código</th><th>Proyecto</th><th>Cliente</th><th>Fase</th>
                          <th className="right">Días</th><th className="right">Presupuesto</th>
                          <th className="right">Cobrado</th><th className="right">Pendiente</th>
                          <th className="right">Horas</th>
                        </tr></thead>
                        <tbody>
                          {p.map((r) => (
                            <tr key={r.code}>
                              <td><span className="plate">{r.code}</span></td>
                              <td>{r.name}</td>
                              <td>{r.cliente}</td>
                              <td>{r.fase}</td>
                              <td className="right num">{r.dias ?? '—'}</td>
                              <td className="right num">{fmtEur(r.presupuesto)}</td>
                              <td className="right num">{fmtEur(r.cobrado)}</td>
                              <td className="right num">{fmtEur(r.pendiente)}</td>
                              <td className="right num">{fmtHours(r.horas_reales)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty title="No hay proyectos en este periodo" />}
                </Panel>
              </>
            )}

            {tab === 'horas' && (
              <>
                <Panel title="En cifras">
                  <div className="figure-row">
                    <span className="figure"><b>{fmtHours(hoursTotals.fabricacion)}</b><span>Fabricación</span></span>
                    <span className="figure"><b>{fmtHours(hoursTotals.montaje)}</b><span>Montaje</span></span>
                    <span className="figure"><b>{fmtHours(hoursTotals.total)}</b><span>Total</span></span>
                    <span className="figure"><b>{fmtNumber(w.length)}</b><span>Personas</span></span>
                  </div>
                </Panel>

                <Panel title="Horas por trabajador" tight>
                  {w.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          <th>Trabajador</th><th className="right">Fabricación</th>
                          <th className="right">Montaje</th><th className="right">Total</th>
                          <th className="right">Órdenes</th>
                        </tr></thead>
                        <tbody>
                          {w.map((r) => (
                            <tr key={r.trabajador}>
                              <td>{r.trabajador}</td>
                              <td className="right num">{fmtHours(r.fabricacion)}</td>
                              <td className="right num">{fmtHours(r.montaje)}</td>
                              <td className="right num"><strong>{fmtHours(r.total)}</strong></td>
                              <td className="right num">{fmtNumber(r.ordenes)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty title="Nadie ha apuntado horas en este periodo" />}
                </Panel>

                <Panel title="Horas por proyecto" tight>
                  {(byProject.data ?? []).length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          <th>Código</th><th>Proyecto</th><th className="right">Previstas</th>
                          <th className="right">Fabricación</th><th className="right">Montaje</th>
                          <th className="right">Reales</th><th className="right">Desvío</th>
                        </tr></thead>
                        <tbody>
                          {(byProject.data ?? []).map((r) => (
                            <tr key={r.code}>
                              <td><span className="plate">{r.code}</span></td>
                              <td>{r.name}</td>
                              <td className="right num">{fmtHours(r.previstas)}</td>
                              <td className="right num">{fmtHours(r.fabricacion)}</td>
                              <td className="right num">{fmtHours(r.montaje)}</td>
                              <td className="right num">{fmtHours(r.total)}</td>
                              <td className="right num">{fmtHours(r.desvio)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty title="Sin horas en proyectos en este periodo" />}
                </Panel>
              </>
            )}

            {tab === 'material' && (
              <>
                <Panel title="En cifras">
                  <div className="figure-row">
                    <span className="figure"><b>{fmtNumber(materialTotals.pendientes)}</b><span>Pendiente</span></span>
                    <span className="figure"><b>{fmtNumber(materialTotals.retrasados)}</b><span>Con retraso</span></span>
                    <span className="figure"><b>{fmtNumber(materialTotals.proveedores)}</b><span>Proveedores</span></span>
                  </div>
                </Panel>

                <Panel title="Material" tight>
                  {m.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          <th>Material</th><th className="right">Unidades</th><th>Proveedor</th>
                          <th>Proyecto</th><th>Pedido</th><th>Previsto</th>
                          <th>Recibido</th><th className="right">Retraso</th>
                        </tr></thead>
                        <tbody>
                          {m.map((r, i) => (
                            <tr key={`${r.material}-${i}`}>
                              <td>{r.material}</td>
                              <td className="right num">{r.unidades === null ? '—' : fmtNumber(r.unidades)}</td>
                              <td>{r.proveedor}</td>
                              <td>{r.proyecto}</td>
                              <td className="nowrap">{r.pedido ? fmtDate(r.pedido) : '—'}</td>
                              <td className="nowrap">{r.previsto ? fmtDate(r.previsto) : '—'}</td>
                              <td>{r.recibido ? 'Sí' : 'No'}</td>
                              <td className="right num">{r.dias_retraso ? `${r.dias_retraso} días` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty title="Sin material en este periodo" />}
                </Panel>

                <Panel title="Proveedores más utilizados" tight>
                  {(suppliers.data ?? []).length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          <th>Proveedor</th><th className="right">Pedidos</th>
                          <th className="right">Pendientes</th><th className="right">Retrasados</th>
                          <th className="right">Retraso medio</th>
                        </tr></thead>
                        <tbody>
                          {(suppliers.data ?? []).map((r) => (
                            <tr key={r.proveedor}>
                              <td>{r.proveedor}</td>
                              <td className="right num">{fmtNumber(r.pedidos)}</td>
                              <td className="right num">{fmtNumber(r.pendientes)}</td>
                              <td className="right num">{fmtNumber(r.retrasados)}</td>
                              <td className="right num">
                                {r.retraso_medio ? `${fmtNumber(r.retraso_medio)} días` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty title="Todavía no hay proveedores" />}
                </Panel>
              </>
            )}
          </div>
        )}
    </>
  );
}
