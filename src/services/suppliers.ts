import { supabase, unwrap } from '@/lib/supabase';
import type { Supplier, SupplierSuggestion } from '@/types/db';

/**
 * PROVEEDORES.
 *
 * Son cosa de administración: llevan teléfonos, correos y condiciones de
 * compra. Un trabajador no los ve, y eso NO depende de que la pantalla
 * esconda el menú: las políticas de la base de datos le devuelven la
 * lista vacía y las funciones le dan un error de permisos.
 *
 * Tampoco se borran. Se desactivan, porque hay materiales que les
 * apuntan y borrarlos dejaría el histórico de compras sin explicación.
 */

/** Todos los proveedores, los de baja incluidos, para la pantalla de alta. */
export async function listSuppliers(includeInactive = true) {
  let q = supabase.from('suppliers').select('*').order('name');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap(await q) as Supplier[];
}

/**
 * Crea o corrige un proveedor.
 *
 * Si ya existe uno con el mismo nombre —escrito de otra manera, con
 * acentos o con otra puntuación— la base de datos DEVUELVE el que hay en
 * lugar de crear un duplicado. Quien llame debe mirar el `id` que
 * recibe: si no es el que esperaba, es que ya estaba.
 */
export async function saveSupplier(s: {
  id?: string | null; name: string;
  phone?: string | null; email?: string | null; notes?: string | null;
}) {
  return unwrap(await supabase.rpc('save_supplier', {
    p_id: s.id ?? null,
    p_name: s.name,
    p_phone: s.phone ?? null,
    p_email: s.email ?? null,
    p_notes: s.notes ?? null,
  })) as unknown as Supplier;
}

/** Da de baja o reactiva. Nunca borra. */
export async function setSupplierActive(id: string, active: boolean) {
  return unwrap(await supabase.rpc('set_supplier_active', {
    p_supplier: id, p_active: active,
  })) as unknown as Supplier;
}

/**
 * QUÉ PROVEEDORES PROPONER para un material, por su nombre.
 *
 * Primero los habituales de ese material. Si no tiene ninguno, los más
 * usados, que es lo que ya hacía la sugerencia de texto y sigue siendo
 * mejor que una lista en blanco.
 */
export async function suppliersForMaterial(materialName: string) {
  return unwrap(await supabase.rpc('suppliers_for_material', {
    p_material_name: materialName,
  })) as SupplierSuggestion[];
}

/**
 * Pone los proveedores habituales de un material. Se manda la LISTA
 * COMPLETA, igual que en el resto de la aplicación: quitar a uno es
 * volver a mandarla sin él, y mandarla vacía los quita todos.
 */
export async function saveMaterialSuppliers(materialName: string, supplierIds: string[]) {
  return unwrap(await supabase.rpc('save_material_suppliers', {
    p_material_name: materialName, p_suppliers: supplierIds,
  })) as Supplier[];
}

/** Los proveedores habituales que ya tiene un material. */
export async function materialSuppliers(materialName: string) {
  const rows = await suppliersForMaterial(materialName);
  return rows.filter((r) => r.habitual);
}
