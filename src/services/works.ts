import { supabase, unwrap } from '@/lib/supabase';
import { Aviso } from '@/lib/errors';
import type { Project, Work, WorkExtra, WorkSummary } from '@/types/db';

/**
 * OBRAS.
 *
 * Una obra agrupa varios proyectos. Los proyectos no cambian: siguen
 * funcionando igual y siguen saliendo en su listado.
 *
 * TODO lo de aquí es de administración. Un trabajador no recibe ni una
 * fila: la base de datos no se las devuelve, no es que la pantalla las
 * esconda.
 */

const SELECT = '*, client:clients(id, name)';

export interface WorkFilters {
  search?: string;
  state?: 'activas' | 'archivadas';
  page?: number;
  pageSize?: number;
}

export async function listWorks(f: WorkFilters = {}) {
  const page = f.page ?? 1;
  const size = f.pageSize ?? 25;
  let q = supabase.from('works').select(SELECT, { count: 'exact' });

  if (f.state === 'archivadas') q = q.not('archived_at', 'is', null);
  else q = q.is('archived_at', null);
  if (f.search?.trim()) {
    const s = `%${f.search.trim()}%`;
    q = q.or(`name.ilike.${s},code.ilike.${s},address.ilike.${s}`);
  }

  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1)
    .throwOnError();

  return { rows: (data ?? []) as unknown as Work[], total: count ?? 0 };
}

/**
 * Las obras activas, para el desplegable del formulario de proyecto.
 * Solo lo imprescindible: ni importes ni facturación.
 */
export async function worksForPicker() {
  return unwrap(await supabase.from('works')
    .select('id, code, name')
    .is('archived_at', null)
    .order('code', { ascending: false })) as { id: string; code: string; name: string }[];
}

export async function getWork(id: string) {
  return unwrap(await supabase.from('works').select(SELECT).eq('id', id).single()) as unknown as Work;
}

/** Las cuentas: proyectos + extras, facturado y pendiente. */
export async function workSummary(id: string) {
  return unwrap(await supabase.from('work_summary')
    .select('*').eq('work_id', id).maybeSingle()) as WorkSummary | null;
}

/** Los proyectos de la obra, con lo que hace falta para la pantalla. */
export async function workProjects(id: string) {
  return unwrap(await supabase.from('projects')
    .select('id, code, name, phase, billing_status, budget_amount, invoiced_amount, '
      + 'invoiced_on, archived_at, fab_start, mont_end')
    .eq('work_id', id)
    .order('code')) as unknown as Project[];
}

export interface WorkInput {
  id?: string | null;
  name: string;
  clientId?: string | null;
  address?: string | null;
  description?: string | null;
  observations?: string | null;
}

export async function saveWork(input: WorkInput) {
  return unwrap(await supabase.rpc('save_work', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_client: input.clientId ?? null,
    p_address: input.address ?? null,
    p_description: input.description ?? null,
    p_observations: input.observations ?? null,
  })) as unknown as Work;
}

/**
 * MEJORA 1 · EL COLOR DE LA OBRA.
 *
 * Función propia y no un campo más de «saveWork», igual que las fechas
 * del calendario: así el formulario de alta no cambia y el color se
 * puede tocar desde la ficha de la obra sin volver a guardarlo todo.
 *
 * Con «null» se le quita el color y sus proyectos vuelven a la pastilla
 * neutra de siempre.
 */
export async function setWorkColor(workId: string, color: string | null) {
  return unwrap(await supabase.rpc('set_work_color', {
    p_work: workId, p_color: color,
  })) as unknown as Work;
}

/** Meter o sacar un proyecto de una obra. */
export async function setProjectWork(projectId: string, workId: string | null) {
  return unwrap(await supabase.rpc('set_project_work', {
    p_project: projectId, p_work: workId,
  })) as unknown as Project;
}

/**
 * FASE 1.3 · EL PERIODO DE LA OBRA EN EL CALENDARIO.
 *
 * Las dos fechas, o las dos en blanco para que la obra vuelva a seguir a
 * sus proyectos. NO se comprueba disponibilidad.
 */
export async function setWorkDates(
  workId: string, start: string | null, end: string | null,
) {
  const w = unwrap(await supabase.rpc('set_work_dates', {
    p_work: workId, p_start: start, p_end: end,
  })) as unknown as Work | null;

  // Igual que con las fases: se confirma contra lo que ha devuelto la
  // base de datos antes de decirle a nadie que está guardado.
  if (!w || w.cal_start !== start || w.cal_end !== end) {
    throw new Aviso('El periodo no se ha guardado. Vuelve a cargar la obra '
      + 'y compruébalo antes de darlo por bueno.');
  }
  return w;
}

export async function archiveWork(id: string, archive = true) {
  return unwrap(await supabase.rpc('archive_work', {
    p_work: id, p_archive: archive,
  })) as unknown as Work;
}

/**
 * ELIMINAR una obra. Los proyectos NO se borran: se quedan sueltos.
 * La base de datos se niega si hay algo facturado.
 */
export async function deleteWork(id: string) {
  return unwrap(await supabase.rpc('delete_work', { p_work: id })) as unknown as {
    ok: boolean; code: string; proyectos_sueltos: number; extras: number;
  };
}

// ---------------------------------------------------------------------
// Costes extras
// ---------------------------------------------------------------------

export async function listWorkExtras(workId: string) {
  return unwrap(await supabase.from('work_extras')
    .select('*').eq('work_id', workId)
    .order('created_at')) as WorkExtra[];
}

export async function saveWorkExtra(input: {
  id?: string | null; workId?: string | null; concept: string;
  amount: number; notes?: string | null;
}) {
  return unwrap(await supabase.rpc('save_work_extra', {
    p_id: input.id ?? null,
    p_work: input.workId ?? null,
    p_concept: input.concept,
    p_amount: input.amount,
    p_notes: input.notes ?? null,
  })) as unknown as WorkExtra;
}

export async function deleteWorkExtra(id: string) {
  return unwrap(await supabase.rpc('delete_work_extra', { p_id: id }));
}

/**
 * FASE 3.4 · MARCAR UN COSTE EXTRA COMO FACTURADO.
 *
 * Se marca A MANO, igual que la facturación de un proyecto. Guardar un
 * coste extra NO lo factura: se pidió expresamente que no.
 *
 * Solo los marcados entran en el «facturado» de la obra, así que un
 * mismo coste no puede contarse dos veces.
 */
export async function setWorkExtraInvoiced(
  extraId: string, invoiced: boolean, on?: string | null,
) {
  const x = unwrap(await supabase.rpc('set_work_extra_invoiced', {
    p_extra: extraId, p_invoiced: invoiced, p_on: on ?? null,
  })) as unknown as WorkExtra | null;

  if (!x || x.invoiced !== invoiced) {
    throw new Aviso('El cambio no se ha guardado. Vuelve a cargar la obra y '
      + 'compruébalo antes de darlo por bueno.');
  }
  return x;
}

// ---------------------------------------------------------------------
// Facturación manual
// ---------------------------------------------------------------------

/**
 * Marcar un proyecto como facturado, o quitarle la marca.
 * Si no se dice importe, se factura lo presupuestado.
 */
export async function setProjectInvoiced(
  projectId: string, invoiced: boolean, amount?: number | null, on?: string | null,
) {
  return unwrap(await supabase.rpc('set_project_invoiced', {
    p_project: projectId,
    p_invoiced: invoiced,
    p_amount: amount ?? null,
    p_on: on ?? null,
  })) as unknown as Project;
}
