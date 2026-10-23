import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, HardHat, Link2, Paperclip, Plus, Unlink } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDialogs } from '@/components/ui/Dialogs';
import { Badge } from '@/components/ui/Layout';
import { Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import { linkVisit, listLinkedVisits, listVisitsToLink } from '@/services/fichas';
import { fichaStatus } from '@/config/constants';
import { fmtDate } from '@/lib/format';
import { vincularParam } from '@/lib/vinculos';
import type { LinkedVisit } from '@/types/db';

/**
 * LAS VISITAS TÉCNICAS DE UN PRESUPUESTO O DE UN PROYECTO.
 *
 * MEJORA 2 · Antes, para saber si se había ido a medir había que salir a
 * Fichas, filtrar por visitas y buscar a ojo cuál era la de este
 * trabajo: no había NINGUNA relación entre una visita y el presupuesto
 * por el que se hizo.
 *
 * Desde aquí se puede:
 *
 *   · crear una visita técnica nueva ya vinculada. El botón lleva a LA
 *     FICHA DE VISITA DE SIEMPRE, con sus campos y sus validaciones: no
 *     hay un segundo formulario de visita con otros campos;
 *   · vincular una visita que YA existe, para cuando se apuntó antes de
 *     que hubiera presupuesto;
 *   · ver las vinculadas con su estado, su fecha y su responsable, y
 *     abrir cada una;
 *   · quitar una asignación equivocada, que no borra nada.
 *
 * Las visitas marcadas «Del presupuesto» son las que se vincularon al
 * presupuesto del que nació el proyecto. Se ven desde el proyecto porque
 * son las que se hicieron para este trabajo, pero se quitan desde el
 * presupuesto, que es donde están colgadas.
 */
export function VisitasPanel({ paraTipo, paraId, clientId, codigo, onChange }: {
  paraTipo: LinkedVisit['para_tipo'];
  paraId: string;
  /** Para ofrecer primero las visitas del mismo cliente. */
  clientId?: string | null;
  /** El código del presupuesto o del proyecto, para los textos. */
  codigo: string;
  onChange?: () => void;
}) {
  const navigate = useNavigate();
  const { toast, confirm } = useDialogs();
  const [vinculando, setVinculando] = useState(false);
  const [elegida, setElegida] = useState('');
  const [busy, setBusy] = useState(false);

  const visitas = useAsync(() => listLinkedVisits(paraTipo, paraId), [paraTipo, paraId]);
  const candidatas = useAsync(
    async () => (vinculando ? listVisitsToLink(clientId) : []), [vinculando, clientId],
  );
  const lista = visitas.data ?? [];

  const destino = paraTipo === 'proyecto'
    ? { projectId: paraId } as const
    : { fichaId: paraId } as const;

  /** Crear una visita nueva, ya vinculada a esto. */
  function nueva() {
    const params = new URLSearchParams({
      tipo: 'visita', vincular: vincularParam(paraTipo, paraId),
    });
    if (clientId) params.set('cliente', clientId);
    navigate(`/admin/fichas/nueva?${params.toString()}`);
  }

  async function vincular() {
    if (!elegida) return;
    setBusy(true);
    try {
      await linkVisit(elegida, destino);
      toast.success('Visita técnica vinculada');
      setVinculando(false); setElegida('');
      visitas.reload();
      onChange?.();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function quitar(v: LinkedVisit) {
    const ok = await confirm({
      title: 'Quitar la visita técnica',
      message: (
        <>
          {v.code} dejará de verse desde {codigo}. La visita y sus archivos se conservan:
          se podrá volver a vincular.
        </>
      ),
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      await linkVisit(v.id, null);
      toast.success('Visita desvinculada');
      visitas.reload();
      onChange?.();
    } catch (e) { toast.error(e); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Visitas técnicas</h2>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setVinculando((v) => !v)}>
            <Link2 />{vinculando ? 'Cancelar' : 'Vincular existente'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={nueva}>
            <Plus />Asignar visita técnica
          </button>
        </span>
      </div>

      <div className="panel-body">
        {vinculando && (
          <div className="stack" style={{ marginBottom: 12 }}>
            {candidatas.loading && !candidatas.data ? <Loading />
              : !candidatas.data?.length ? (
                <p className="hint" style={{ margin: 0 }}>
                  No hay visitas sin vincular{clientId ? ' de este cliente' : ''}. Usa
                  «Asignar visita técnica» para crear una.
                </p>
              ) : (
                <div className="row" style={{ gap: 8 }}>
                  <select className="select" value={elegida} style={{ flex: 1 }}
                          aria-label="Visita técnica que se va a vincular"
                          onChange={(e) => setElegida(e.target.value)}>
                    <option value="">Elige una visita…</option>
                    {candidatas.data.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code}
                        {v.scheduled_date ? ` · ${fmtDate(v.scheduled_date)}` : ''}
                        {v.title ? ` · ${v.title}` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={vincular} disabled={!elegida || busy}>
                    {busy ? 'Vinculando…' : 'Vincular'}
                  </button>
                </div>
              )}
          </div>
        )}

        {visitas.loading && !visitas.data ? <Loading />
          : visitas.error ? <ErrorBox message={visitas.error} onRetry={visitas.reload} />
          : !lista.length ? (
            <Empty title="Sin visitas técnicas" icon={<CalendarCheck aria-hidden />}>
              Cuando haya que ir a medir o a comprobar algo, asigna una visita técnica desde
              aquí: quedará vinculada a {codigo} y sus planos y fotos se verán en esta ficha.
            </Empty>
          ) : (
            <ul className="mini-list">
              {lista.map((v) => {
                const st = fichaStatus('visita', v.status);
                return (
                  <li key={`${v.para_tipo}-${v.id}`}>
                    <span className="cell-main" style={{ flex: 1 }}>
                      <strong>
                        <Link to={`/admin/fichas/${v.id}`}>{v.code}</Link>
                        {v.title ? ` · ${v.title}` : ''}
                      </strong>
                      <small>
                        {v.scheduled_date
                          ? `${fmtDate(v.scheduled_date)}${v.scheduled_time ? ` · ${v.scheduled_time.slice(0, 5)}` : ''}`
                          : 'Sin fecha'}
                        {v.assigned_name ? ` · ${v.assigned_name}` : ''}
                        {v.archivos > 0 && (
                          <> · <Paperclip size={11} aria-hidden style={{ verticalAlign: '-1px' }} />{' '}
                            {v.archivos === 1 ? '1 archivo' : `${v.archivos} archivos`}</>
                        )}
                      </small>
                    </span>
                    {v.heredada && (
                      <Badge tone="neutral" plain>Del presupuesto</Badge>
                    )}
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {/*
                      Una visita HEREDADA cuelga del presupuesto, no de
                      este proyecto. Quitarla desde aquí la quitaría
                      también del presupuesto, que es otra pantalla: se
                      quita desde allí, donde se puso.
                    */}
                    {!v.heredada && (
                      <button className="btn btn-ghost icon-btn" onClick={() => quitar(v)}
                              aria-label={`Quitar la visita ${v.code}`}><Unlink /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

        {lista.some((v) => v.heredada) && (
          <p className="hint" style={{ marginBottom: 0 }}>
            <HardHat size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Las marcadas
            «Del presupuesto» se vincularon al presupuesto del que nació este proyecto. Se
            quitan desde esa ficha.
          </p>
        )}
      </div>
    </section>
  );
}
