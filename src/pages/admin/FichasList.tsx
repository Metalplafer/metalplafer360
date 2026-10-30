import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { listFichas, fichaCounts } from '@/services/fichas';
import { Badge, PageHeader, Pagination, Tabs } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { FICHA_NEW_LABEL, FICHA_STATUSES, FICHA_TYPE_LABEL, FICHA_TYPE_PLURAL, fichaStatus } from '@/config/constants';
import { fmtDate, fmtEur, fmtTimeShort } from '@/lib/format';
import {
  AVISO_BILLINGS, AVISO_BILLING_LABEL, AVISO_BILLING_TONE,
  FICHA_REVIEWS, FICHA_REVIEW_LABEL, FICHA_REVIEW_TONE,
  type AvisoBilling, type FichaReview,
} from '@/config/constants';
import type { FichaType } from '@/types/db';

/** ¿Lo que trae la ficha es una de las tres subfases conocidas? */
const esRevision = (v: string | null): v is FichaReview =>
  v !== null && (FICHA_REVIEWS as readonly string[]).includes(v);

/** ¿Y una de las tres situaciones de facturación de un aviso? */
const esFacturacion = (v: string | null): v is AvisoBilling =>
  v !== null && (AVISO_BILLINGS as readonly string[]).includes(v);

const PAGE_SIZE = 25;

/**
 * LA PANTALLA DE PRESUPUESTOS.
 *
 * Enseña PRESUPUESTOS y VISITAS, que son las dos caras del mismo
 * trabajo: se visita para poder presupuestar. Los AVISOS ya no están
 * aquí: tienen su propia pantalla en el menú, entre Calendario y
 * Clientes, porque son otra cosa —incidencias y reparaciones— y mezclarlos
 * obligaba a filtrar cada vez.
 *
 * La ruta sigue siendo «/admin/fichas» a propósito: cambiarla rompería
 * los enlaces que haya guardados y no aportaría nada. Y la tabla de la
 * base de datos también se sigue llamando «fichas», que es donde viven
 * los tres tipos.
 *
 * Con «fixedType» se usa también como pantalla de Avisos, que es esta
 * misma lista limitada a ese tipo.
 */
export default function FichasList({ fixedType }: { fixedType?: FichaType }) {
  const navigate = useNavigate();

  /*
    MEJORA 4 · LLEGAR AQUÍ YA FILTRADO.

    Los avisos del panel enlazan con «?tipo=…&estado=…» para que al
    pulsarlos se vea exactamente lo que hay que resolver, en vez de la
    lista entera y a buscarlo. Solo se lee AL ABRIR: a partir de ahí
    manda lo que toque la persona, y la dirección no se reescribe en
    cada clic.

    Lo que venga por la dirección se valida contra los estados que
    existen de verdad para ese tipo. Un «?estado=loquesea» se ignora y
    se abre la lista normal, sin error.
  */
  const [params] = useSearchParams();
  const tipoInicial = ((): FichaType => {
    const t = params.get('tipo');
    return t === 'presupuesto' || t === 'visita' || t === 'aviso' ? t : (fixedType ?? 'presupuesto');
  })();
  const estadoInicial = ((): string => {
    const e = params.get('estado');
    const tipo = fixedType ?? tipoInicial;
    return e && FICHA_STATUSES[tipo].some((s) => s.key === e) ? e : '';
  })();

  const [type, setType] = useState<FichaType>(fixedType ?? tipoInicial);
  const [status, setStatus] = useState(estadoInicial);
  // Si llega un estado concreto por la dirección, se mira en TODAS: hay
  // estados —«realizado», «cerrado»— que el filtro «abiertas» esconde.
  const [state, setState] = useState<'abiertas' | 'todas' | 'archivadas'>(
    estadoInicial ? 'todas' : 'abiertas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const debounced = useDebounce(search, 300);
  const counts = useAsync(fichaCounts, []);
  const fichas = useAsync(
    () => listFichas({ type, status: status || undefined, state, search: debounced, page, pageSize: PAGE_SIZE }),
    [type, status, state, debounced, page],
  );

  const reset = (next: FichaType) => { setType(next); setStatus(''); setPage(0); };

  return (
    <>
      <PageHeader
        title={fixedType ? FICHA_TYPE_PLURAL[fixedType] : 'Presupuestos'}
        sub={fixedType === 'aviso'
          ? 'Incidencias y reparaciones de clientes.'
          : 'Presupuestos y visitas técnicas. Los avisos están en su propia pantalla.'}
        actions={
          <Link className="btn btn-primary" to={`/admin/fichas/nueva?tipo=${type}`}>
            <Plus />{FICHA_NEW_LABEL[type]}
          </Link>
        }
      />

      <section className="panel">
        {!fixedType && (
          <Tabs
            value={type}
            onChange={reset}
            tabs={[
              { key: 'presupuesto' as const, label: 'Presupuestos', count: counts.data?.presupuesto },
              { key: 'visita' as const, label: 'Visitas', count: counts.data?.visita },
            ]}
          />
        )}

        <div className="toolbar">
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search size={17} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--faint)' }} aria-hidden />
            <label htmlFor="ficha-search" className="sr-only">Buscar fichas</label>
            <input id="ficha-search" className="input" style={{ paddingLeft: 36 }}
                   placeholder="Buscar por código, asunto o dirección"
                   value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>

          <div className="field" style={{ minWidth: 190 }}>
            <label htmlFor="ficha-status" className="sr-only">Estado</label>
            <select id="ficha-status" className="select" value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="">Todos los estados</option>
              {FICHA_STATUSES[type].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="row" style={{ gap: 6 }}>
            {([['abiertas', 'Pendientes'], ['todas', 'Todas'], ['archivadas', 'Archivadas']] as const).map(([k, l]) => (
              <button key={k} className="chip" aria-pressed={state === k}
                      onClick={() => { setState(k); setPage(0); }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="panel-body tight">
          {fichas.loading && !fichas.data ? <Loading />
            : fichas.error ? <div style={{ padding: 16 }}><ErrorBox message={fichas.error} onRetry={fichas.reload} /></div>
            : !fichas.data?.rows.length ? (
              <Empty title={debounced
                ? `Sin resultados para «${debounced}»`
                : `No hay ${FICHA_TYPE_PLURAL[type].toLowerCase()} ${state === 'archivadas' ? 'archivadas' : 'en este estado'}`}>
                {state !== 'archivadas' && !debounced &&
                  `Crea la primera con el botón «Nueva ${FICHA_TYPE_LABEL[type].toLowerCase()}».`}
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Asunto</th>
                        <th>Cliente</th>
                        <th>{type === 'presupuesto' ? 'Creada' : 'Fecha prevista'}</th>
                        <th>Responsable</th>
                        <th>Estado</th>
                        {type === 'presupuesto' && <th className="right">Importe</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fichas.data.rows.map((f) => {
                        const s = fichaStatus(f.type, f.status);
                        return (
                          <tr key={f.id} className="clickable" onClick={() => navigate(`/admin/fichas/${f.id}`)}>
                            <td><span className="plate">{f.code}</span></td>
                            <td>
                              <span className="cell-main">
                                <strong>{f.title ?? f.description?.slice(0, 60) ?? '—'}</strong>
                                {f.address && <small>{f.address}</small>}
                              </span>
                            </td>
                            <td>{f.client?.name ?? <span className="faint">Sin cliente</span>}</td>
                            <td className="nowrap">
                              {type === 'presupuesto' ? fmtDate(f.created_at) : (
                                f.scheduled_date
                                  ? `${fmtDate(f.scheduled_date)}${f.scheduled_time ? ` · ${fmtTimeShort(f.scheduled_time)}` : ''}`
                                  : <span className="faint">Sin fecha</span>
                              )}
                            </td>
                            <td>{f.assignee?.full_name ?? <span className="faint">Sin asignar</span>}</td>
                            <td>
                              <Badge tone={s.tone}>{s.label}</Badge>
                              {/*
                                MEJORA 3 · La subfase de la revisión, al lado del
                                estado y SOLO cuando está en revisión. Así se ve
                                desde la lista cuáles están aprobados y cuáles
                                denegados sin abrir ninguno. Con su texto: el
                                color no es la única señal.
                              */}
                              {/*
                                MEJORA 7 · En qué ha quedado un aviso terminado:
                                pendiente de facturar, facturado, o finalizado sin
                                factura. Se ve desde la lista, que es donde se
                                busca «qué me falta por facturar».
                              */}
                              {esFacturacion(f.billing_state) && (
                                <>
                                  {' '}
                                  <Badge tone={AVISO_BILLING_TONE[f.billing_state]}>
                                    {AVISO_BILLING_LABEL[f.billing_state]}
                                  </Badge>
                                </>
                              )}
                              {esRevision(f.review_status) && (
                                <>
                                  {' '}
                                  <Badge tone={FICHA_REVIEW_TONE[f.review_status as FichaReview]}>
                                    {FICHA_REVIEW_LABEL[f.review_status as FichaReview]}
                                  </Badge>
                                </>
                              )}
                            </td>
                            {type === 'presupuesto' && <td className="right num">{fmtEur(f.amount)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} count={fichas.data.count} onPage={setPage} />
              </>
            )}
        </div>
      </section>
    </>
  );
}
