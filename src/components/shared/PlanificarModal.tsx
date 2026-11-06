import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Layout';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAsync } from '@/hooks/useAsync';
import { listProjects } from '@/services/projects';
import { movePhaseDates, setPhaseDates } from '@/services/calendar';
import type { Project } from '@/types/db';

type Fase = 'fabricacion' | 'montaje';

/**
 * PLANIFICAR FABRICACIÓN O MONTAJE DESDE EL CALENDARIO.
 *
 * NO CREA UN EVENTO NUEVO. Escribe el periodo en el propio proyecto
 * —«fab_start/fab_end» y «mont_start/mont_end», que existen desde el
 * archivo 30—, así que la asignación queda vinculada al proyecto por
 * construcción y se ve desde su ficha sin hacer nada más. Un evento
 * aparte habría dejado las fechas de un proyecto en dos sitios.
 *
 * UN TRAMO POR FASE. Un proyecto tiene UN periodo de fabricación y UNO
 * de montaje. Si el proyecto elegido ya tenía fechas, esto las MUEVE y
 * se avisa antes de guardar; no se añade un segundo tramo, porque la
 * estructura no los guarda y se decidió expresamente que no hacen falta.
 */
export function PlanificarModal({ dia, inicial, onClose, onGuardado }: {
  /** El día que se pulsó en el calendario: entra ya puesto como inicio. */
  dia: string;
  /** Si se abre desde un tramo que ya existe, lo que hay que editar. */
  inicial?: { projectId: string; fase: Fase; start: string; end: string; note: string | null };
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast, confirm } = useDialogs();
  const editando = Boolean(inicial);

  const [fase, setFase] = useState<Fase>(inicial?.fase ?? 'fabricacion');
  const [projectId, setProjectId] = useState(inicial?.projectId ?? '');
  const [desde, setDesde] = useState(inicial?.start ?? dia);
  const [hasta, setHasta] = useState(inicial?.end ?? dia);
  const [nota, setNota] = useState(inicial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState('');

  // Los proyectos activos, para elegir. Se piden una vez y se filtran
  // aquí: son pocos y así escribir no dispara una consulta por letra.
  const proyectos = useAsync(
    () => listProjects({ state: 'activos', pageSize: 200 }).then((r) => r.rows),
    [],
  );

  const lista = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    const todos = (proyectos.data ?? []) as Project[];
    if (!f) return todos;
    return todos.filter((p) => `${p.code} ${p.name} ${p.client?.name ?? ''}`
      .toLowerCase().includes(f));
  }, [proyectos.data, filtro]);

  const elegido = (proyectos.data ?? []).find((p) => p.id === projectId) ?? null;

  // El final no puede ir antes del inicio: se corrige al vuelo en vez de
  // dejar guardar algo que el servidor va a rechazar.
  useEffect(() => { if (hasta < desde) setHasta(desde); }, [desde, hasta]);

  /** Lo que ese proyecto ya tiene planificado en esta fase, si algo. */
  const yaTiene = elegido
    ? (fase === 'fabricacion'
        ? { start: elegido.fab_start, end: elegido.fab_end }
        : { start: elegido.mont_start, end: elegido.mont_end })
    : null;

  const moviendoDeProyecto = editando && inicial!.projectId !== projectId;

  async function guardar() {
    if (!projectId) { toast.error('Elige el proyecto'); return; }

    // Si ese proyecto ya tenía este tramo en otras fechas, se dice antes
    // de pisarlo. Es lo que evita la sorpresa de «se me ha movido».
    if (yaTiene?.start && yaTiene.start !== desde && !moviendoDeProyecto) {
      const ok = await confirm({
        title: 'Ese proyecto ya tiene fechas',
        message: <>{elegido?.code} ya tenía {fase === 'fabricacion' ? 'fabricación' : 'montaje'} del{' '}
          <strong>{yaTiene.start}</strong> al <strong>{yaTiene.end}</strong>. Un proyecto
          lleva un solo periodo por fase, así que esto lo <strong>moverá</strong> a las
          fechas nuevas, no añadirá otro.</>,
        confirmLabel: 'Mover las fechas',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      if (moviendoDeProyecto) {
        // De golpe: quita de uno y pone en otro sin poder quedarse a medias.
        await movePhaseDates(inicial!.projectId, projectId, fase, desde, hasta, nota);
      } else {
        await setPhaseDates(projectId, fase, desde, hasta, nota);
      }
      toast.success(editando ? 'Planificación actualizada' : 'Planificación guardada');
      onGuardado();
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function quitar() {
    const ok = await confirm({
      title: 'Quitar la planificación',
      message: <>{elegido?.code} se quedará sin fechas de{' '}
        {fase === 'fabricacion' ? 'fabricación' : 'montaje'} y volverá al cálculo
        automático. El proyecto no se borra ni se toca nada más.</>,
      confirmLabel: 'Quitar las fechas',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setPhaseDates(projectId, fase, null, null, null);
      toast.success('Planificación quitada');
      onGuardado();
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={editando ? 'Editar la planificación' : 'Planificar trabajo'}
      onClose={onClose}
      footer={
        <>
          {editando && (
            <button type="button" className="btn btn-danger" onClick={quitar} disabled={busy}>
              <Trash2 size={15} />Quitar
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar}
                  disabled={busy || !projectId}>
            <CalendarRange size={15} />{busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Tipo de trabajo">
          <div className="row">
            {(['fabricacion', 'montaje'] as Fase[]).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={fase === f}
                      onClick={() => setFase(f)}>
                {f === 'fabricacion' ? 'Fabricación' : 'Montaje'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Proyecto" htmlFor="pl-filtro"
               hint="Escribe para buscar por código, nombre o cliente.">
          <input id="pl-filtro" className="input" value={filtro} placeholder="Buscar proyecto…"
                 onChange={(e) => setFiltro(e.target.value)} />
          <select className="select" size={6} value={projectId} style={{ marginTop: 6 }}
                  aria-label="Proyecto al que asignar el trabajo"
                  onChange={(e) => setProjectId(e.target.value)}>
            {lista.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}{p.client?.name ? ` · ${p.client.name}` : ''}
              </option>
            ))}
          </select>
          {proyectos.loading && !proyectos.data && <p className="hint">Cargando proyectos…</p>}
          {!proyectos.loading && !lista.length && (
            <p className="hint">Ningún proyecto activo coincide con «{filtro}».</p>
          )}
        </Field>

        <div className="form-grid">
          <Field label="Desde" htmlFor="pl-desde">
            <input id="pl-desde" className="input" type="date" value={desde}
                   onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta" htmlFor="pl-hasta"
                 hint="El trabajo ocupará todos los días entre las dos fechas.">
            <input id="pl-hasta" className="input" type="date" value={hasta} min={desde}
                   onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>

        <Field label="Observación" htmlFor="pl-nota"
               hint="Opcional. Es de este tramo, no del proyecto entero.">
          <textarea id="pl-nota" className="textarea" rows={2} maxLength={500} value={nota}
                    onChange={(e) => setNota(e.target.value)} />
        </Field>

        {yaTiene?.start && !moviendoDeProyecto && yaTiene.start !== desde && (
          <p className="hint">
            Aviso: {elegido?.code} ya tiene {fase === 'fabricacion' ? 'fabricación' : 'montaje'}{' '}
            del {yaTiene.start} al {yaTiene.end}. Guardar lo <strong>moverá</strong> aquí.
          </p>
        )}

        {elegido && (
          <p className="hint" style={{ marginBottom: 0 }}>
            <Link to={`/admin/proyectos/${elegido.id}`} onClick={onClose}>
              Abrir {elegido.code}
            </Link>{' '}· las fechas quedan guardadas en el proyecto, no solo en el calendario.
          </p>
        )}
      </div>
    </Modal>
  );
}
