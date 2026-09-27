import { supabase, unwrap } from '@/lib/supabase';
import type { Client, ClientActivity, ClientContact, ClientSuggestion, Ficha } from '@/types/db';

export type ClientInput = Pick<Client,
  'kind' | 'name' | 'tax_id' | 'phone' | 'email' | 'address' | 'city' | 'postal_code' | 'notes'>;

/** Los campos vacíos se guardan como «sin dato», no como texto vacío. */
function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v]),
  ) as T;
}

export interface ClientFilters {
  search?: string;
  state?: 'activos' | 'desactivados' | 'archivados' | 'todos';
  kind?: 'empresa' | 'particular';
  page?: number;
  pageSize?: number;
}

export async function listClients(f: ClientFilters = {}) {
  const { page = 0, pageSize = 25 } = f;
  let q = supabase.from('clients')
    .select('*, activity:client_activity(budgets, visits, notices, open_notices, last_activity)',
            { count: 'exact' })
    .order('name')
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (f.state === 'archivados') q = q.not('archived_at', 'is', null);
  else if (f.state === 'desactivados') q = q.is('archived_at', null).eq('active', false);
  else if (f.state !== 'todos') q = q.is('archived_at', null).eq('active', true);

  if (f.kind) q = q.eq('kind', f.kind);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[,()*]/g, ' ');
    q = q.or(`name.ilike.%${s}%,tax_id.ilike.%${s}%,phone.ilike.%${s}%,city.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as (Client & { activity: ClientActivity[] | ClientActivity | null })[],
    count: count ?? 0,
  };
}

export async function getClient(id: string) {
  return unwrap(await supabase.from('clients').select('*').eq('id', id).single()) as Client;
}

export async function createClient(input: ClientInput) {
  return unwrap(await supabase.from('clients').insert(clean(input)).select().single()) as Client;
}

export async function updateClient(
  id: string,
  patch: Partial<ClientInput> & { active?: boolean; archived_at?: string | null },
) {
  return unwrap(await supabase.from('clients').update(clean(patch)).eq('id', id).select().single()) as Client;
}

/** Clientes parecidos a lo que se está escribiendo (nombre o CIF/NIF). */
export async function suggestClients(query: string): Promise<ClientSuggestion[]> {
  if (query.trim().length < 2) return [];
  return unwrap(await supabase.rpc('suggest_clients', { p_query: query, p_limit: 6 })) as ClientSuggestion[];
}

export async function listContacts(clientId: string, includeArchived = false) {
  let q = supabase.from('client_contacts').select('*').eq('client_id', clientId).order('name');
  if (!includeArchived) q = q.is('archived_at', null);
  return unwrap(await q) as ClientContact[];
}

export async function saveContact(c: Partial<ClientContact> & { client_id: string; name: string }) {
  const payload = clean({
    client_id: c.client_id, name: c.name, role: c.role ?? null,
    phone: c.phone ?? null, email: c.email ?? null, notes: c.notes ?? null,
  });
  if (c.id) {
    return unwrap(
      await supabase.from('client_contacts').update(payload).eq('id', c.id).select().single(),
    ) as ClientContact;
  }
  return unwrap(await supabase.from('client_contacts').insert(payload).select().single()) as ClientContact;
}

/**
 * Los contactos se ARCHIVAN, no se borran: si se borrasen, los
 * presupuestos y proyectos antiguos perderían con quién se habló.
 */
export async function archiveContact(id: string, archive = true) {
  unwrap(await supabase.rpc('archive_contact', { p_contact: id, p_archive: archive }));
}

/** Historial del cliente: sus presupuestos, visitas y avisos. */
export async function clientFichas(clientId: string) {
  return unwrap(
    await supabase.from('fichas')
      .select('*, assignee:profiles!fichas_assigned_to_fkey(id, full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ) as Ficha[];
}
