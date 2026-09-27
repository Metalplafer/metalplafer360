import { supabase, unwrap } from '@/lib/supabase';
import type { AuditRow } from '@/types/db';

/** Historial de una ficha o de un cliente. */
export async function listHistory(f: { entityId?: string; entityCode?: string; limit?: number }) {
  let q = supabase.from('audit_log').select('*')
    .order('occurred_at', { ascending: false })
    .limit(f.limit ?? 40);
  if (f.entityId) q = q.eq('entity_id', f.entityId);
  if (f.entityCode) q = q.eq('entity_code', f.entityCode);
  return unwrap(await q) as AuditRow[];
}
