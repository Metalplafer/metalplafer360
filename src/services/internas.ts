import { supabase, unwrap } from '@/lib/supabase';
import { removeStoredFiles } from '@/services/documents';
import type { InternalCard, InternalList, InternalTask, InternalTaskItem } from '@/types/db';

/**
 * GESTIONES INTERNAS · el tablero de administración.
 *
 * Sustituye el Trello que se usaba para RRHH, multas y papeleo. Todo lo
 * de aquí es exclusivo de administración, y no por la pantalla: las
 * políticas de las tres tablas exigen «is_admin()» (migración 70), así
 * que un trabajador que llame a la API por su cuenta no ve ni una fila.
 *
 * Lo que se borra de verdad es muy poco —una lista vacía, un elemento
 * del checklist— y va por funciones del servidor, porque las tablas no
 * tienen «delete» concedido. Las tarjetas NO se borran nunca: se
 * archivan, que es otra cosa y se puede deshacer.
 */

// ---------------------------------------------------------------------
// LAS LISTAS
// ---------------------------------------------------------------------

export async function listInternalLists() {
  return unwrap(
    await supabase.from('internal_lists').select('*').order('position').order('created_at'),
  ) as InternalList[];
}

/** Nace al final del tablero, que es donde se espera que aparezca. */
export async function createInternalList(name: string) {
  const listas = await listInternalLists();
  const position = listas.length ? Math.max(...listas.map((l) => l.position)) + 10 : 10;
  return unwrap(
    await supabase.from('internal_lists').insert({ name: name.trim(), position }).select().single(),
  ) as InternalList;
}

export async function renameInternalList(id: string, name: string) {
  return unwrap(
    await supabase.from('internal_lists').update({ name: name.trim() }).eq('id', id).select().single(),
  ) as InternalList;
}

/**
 * Solo si está vacía. La comprobación la hace el servidor, no esta
 * función: así vale igual si alguien lo intenta desde otro sitio.
 */
export async function deleteInternalList(id: string) {
  return unwrap(await supabase.rpc('delete_internal_list', { p_list: id }));
}

// ---------------------------------------------------------------------
// LAS TARJETAS
// ---------------------------------------------------------------------

/** El tablero entero: lo que se ve, sin las archivadas. */
export async function listBoardCards() {
  return unwrap(
    await supabase.from('internal_board').select('*')
      .is('archived_at', null)
      .order('list_position').order('position'),
  ) as InternalCard[];
}

/** El histórico: lo archivado, lo más reciente primero. */
export async function listArchivedCards() {
  return unwrap(
    await supabase.from('internal_board').select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false }),
  ) as InternalCard[];
}

export async function createInternalTask(listId: string, title: string) {
  // Al final de su lista: es donde mira quien acaba de escribirla.
  const { data } = await supabase.from('internal_tasks').select('position')
    .eq('list_id', listId).is('archived_at', null)
    .order('position', { ascending: false }).limit(1);
  const position = ((data ?? [])[0]?.position ?? 0) + 10;

  return unwrap(
    await supabase.from('internal_tasks')
      .insert({ list_id: listId, title: title.trim(), position }).select().single(),
  ) as InternalTask;
}

export async function updateInternalTask(
  id: string, cambios: { title?: string; notes?: string | null },
) {
  const payload: Record<string, unknown> = {};
  if (cambios.title !== undefined) payload.title = cambios.title.trim();
  if (cambios.notes !== undefined) payload.notes = cambios.notes?.trim() || null;
  return unwrap(
    await supabase.from('internal_tasks').update(payload).eq('id', id).select().single(),
  ) as InternalTask;
}

/**
 * Marcar o desmarcar como hecha. La fecha va junto al estado porque la
 * base de datos exige que las dos cosas concuerden: una tarea sin hacer
 * no puede tener fecha de realización.
 */
export async function setInternalTaskDone(id: string, done: boolean) {
  return unwrap(
    await supabase.from('internal_tasks')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', id).select().single(),
  ) as InternalTask;
}

/** Cambiar de lista, de sitio, o las dos cosas. */
export async function moveInternalTask(id: string, listId: string | null, position?: number) {
  return unwrap(await supabase.rpc('move_internal_task', {
    p_task: id, p_list: listId, p_position: position ?? null,
  })) as InternalTask;
}

export async function archiveInternalTask(id: string) {
  return unwrap(await supabase.rpc('archive_internal_task', { p_task: id })) as InternalTask;
}

/** Con «listId» se elige a qué lista vuelve; sin él, a la suya. */
export async function restoreInternalTask(id: string, listId?: string | null) {
  return unwrap(await supabase.rpc('restore_internal_task', {
    p_task: id, p_list: listId ?? null,
  })) as InternalTask;
}

/**
 * ELIMINAR UNA TARJETA · NO ES ARCHIVAR.
 *
 * Archivar la saca del tablero y la conserva entera. Esto la quita de
 * los dos sitios, con su checklist y sus adjuntos.
 *
 * Lo que NO se lleva es su evento del calendario: una reunión que ya
 * estaba puesta no deja de existir porque se borre la nota que la
 * recordaba. Se queda en el calendario y de ahí se quita.
 *
 * El servidor devuelve las rutas de los archivos que quedan sueltos en
 * el almacén y se retiran aquí. Si esa retirada fallara, lo peor que
 * queda es un archivo sin dueño; lo que no puede pasar —y por eso el
 * servidor filtra por la tarjeta— es llevarse el archivo de otro.
 */
export async function deleteInternalTask(id: string) {
  const rutas = unwrap(await supabase.rpc('delete_internal_task', { p_task: id })) as string[];
  if (rutas?.length) await removeStoredFiles(rutas);
  return rutas ?? [];
}

/** Quita un adjunto de una tarjeta. Estos no van a la papelera. */
export async function deleteInternalTaskFile(documentId: string) {
  const ruta = unwrap(
    await supabase.rpc('delete_internal_task_file', { p_document: documentId }),
  ) as string | null;
  if (ruta) await removeStoredFiles([ruta]);
  return ruta;
}

// ---------------------------------------------------------------------
// EL CHECKLIST
// ---------------------------------------------------------------------

export async function listTaskItems(taskId: string) {
  return unwrap(
    await supabase.from('internal_task_items').select('*')
      .eq('task_id', taskId).order('position').order('created_at'),
  ) as InternalTaskItem[];
}

export async function addTaskItem(taskId: string, text: string) {
  const { data } = await supabase.from('internal_task_items').select('position')
    .eq('task_id', taskId).order('position', { ascending: false }).limit(1);
  const position = ((data ?? [])[0]?.position ?? 0) + 10;

  return unwrap(
    await supabase.from('internal_task_items')
      .insert({ task_id: taskId, text: text.trim(), position }).select().single(),
  ) as InternalTaskItem;
}

export async function updateTaskItem(
  id: string, cambios: { text?: string; done?: boolean },
) {
  const payload: Record<string, unknown> = {};
  if (cambios.text !== undefined) payload.text = cambios.text.trim();
  if (cambios.done !== undefined) payload.done = cambios.done;
  return unwrap(
    await supabase.from('internal_task_items').update(payload).eq('id', id).select().single(),
  ) as InternalTaskItem;
}

export async function deleteTaskItem(id: string) {
  return unwrap(await supabase.rpc('delete_internal_task_item', { p_item: id }));
}

// ---------------------------------------------------------------------
// EL EVENTO DEL CALENDARIO
// ---------------------------------------------------------------------

/**
 * Pone o cambia el evento de una tarjeta.
 *
 * NO crea un tipo de evento nuevo: por dentro llama a
 * «save_calendar_note», la misma función que usa el formulario del
 * calendario, así que lo que sale es un evento de «Otros» como
 * cualquier otro. Y como se le pasa el que la tarjeta ya tenía,
 * editarlo lo ACTUALIZA en vez de crear un segundo.
 */
export async function setTaskEvent(
  taskId: string, datos: { day: string; title?: string | null; detail?: string | null },
) {
  return unwrap(await supabase.rpc('set_internal_task_event', {
    p_task: taskId,
    p_day: datos.day,
    p_title: datos.title ?? null,
    p_detail: datos.detail ?? null,
  })) as InternalTask;
}

/**
 * Suelta el evento de la tarjeta. El evento SE QUEDA en el calendario:
 * quitarlo de ahí es una decisión del calendario, y allí está su botón.
 */
export async function clearTaskEvent(taskId: string) {
  return unwrap(await supabase.rpc('set_internal_task_event', {
    p_task: taskId, p_day: null, p_title: null, p_detail: null,
  })) as InternalTask;
}
