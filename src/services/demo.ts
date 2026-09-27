import { supabase, unwrap } from '@/lib/supabase';

/**
 * Datos de ejemplo: un taller inventado para aprender a usar la
 * aplicación, enseñarla o hacer pruebas sin miedo.
 *
 * Todo lo que se crea queda marcado en la base de datos, y limpiarlo
 * borra exactamente eso: lo que haya hecho la empresa de verdad no se
 * toca nunca. La comprobación la hace la base de datos, no la pantalla.
 */
export interface DemoStatus {
  hay_datos: boolean;
  clientes: number;
  fichas: number;
  proyectos: number;
  trabajadores: number;
  ordenes: number;
  materiales: number;
  documentos: number;
  cobros: number;
}

export async function demoStatus() {
  return unwrap(await supabase.rpc('demo_status')) as unknown as DemoStatus | null;
}

export async function seedDemo() {
  return unwrap(await supabase.rpc('seed_demo')) as unknown as Omit<DemoStatus, 'hay_datos'>;
}

export async function clearDemo() {
  return unwrap(await supabase.rpc('clear_demo')) as unknown as {
    total: number; borradas: Record<string, number>;
  };
}
