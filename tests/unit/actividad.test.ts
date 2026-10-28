import { describe, expect, it } from 'vitest';
import {
  MINUTOS_ACTIVIDAD, cuentaComoActividad, esEscritura, esRutaDeDatos, tocaMarcar,
} from '../../src/lib/actividad';

/**
 * ÚLTIMA ACTIVIDAD · LAS REGLAS DE QUÉ CUENTA
 *
 * La parte delicada de esta mejora no es guardar una fecha: es decidir
 * qué la mueve. Si cuenta de más, la columna dice «hace un minuto» de
 * alguien que tiene la pestaña olvidada desde el martes y deja de servir
 * para nada. Si cuenta de menos, dice «nunca» de quien lleva toda la
 * mañana trabajando.
 */
describe('cada cuánto se apunta la actividad', () => {
  const MIN = 60_000;

  it('la primera vez siempre se apunta', () => {
    expect(tocaMarcar(null, 1_000_000)).toBe(true);
  });

  it('dos veces seguidas NO se apuntan dos veces', () => {
    const t = 1_000_000;
    expect(tocaMarcar(t, t + 1)).toBe(false);
    expect(tocaMarcar(t, t + 60_000)).toBe(false);
    expect(tocaMarcar(t, t + 4 * MIN)).toBe(false);
  });

  it('pasados los cinco minutos, sí', () => {
    const t = 1_000_000;
    expect(tocaMarcar(t, t + 5 * MIN)).toBe(true);
    expect(tocaMarcar(t, t + 60 * MIN)).toBe(true);
    expect(MINUTOS_ACTIVIDAD).toBe(5);
  });

  it('si el reloj va hacia atrás, no se queda congelada', () => {
    // Cambio de hora, o alguien poniendo en hora el ordenador. Sin esto,
    // la actividad no se volvería a apuntar hasta recuperar el desfase.
    const t = 1_000_000;
    expect(tocaMarcar(t, t - 60 * MIN)).toBe(true);
  });

  it('con una hora que no es una hora, no se apunta nada', () => {
    expect(tocaMarcar(null, Number.NaN)).toBe(false);
    expect(tocaMarcar(1_000, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('qué peticiones cuentan como actividad', () => {
  const DATOS = 'https://proyecto.supabase.co/rest/v1/projects?select=*';
  const RPC = 'https://proyecto.supabase.co/rest/v1/rpc/change_project_phase';

  it('escribir cuenta: crear, editar, borrar y cambiar estados', () => {
    expect(cuentaComoActividad(DATOS, 'POST')).toBe(true);
    expect(cuentaComoActividad(DATOS, 'PATCH')).toBe(true);
    expect(cuentaComoActividad(DATOS, 'DELETE')).toBe(true);
    expect(cuentaComoActividad(RPC, 'POST')).toBe(true);
    // Y da igual cómo venga escrito el método.
    expect(esEscritura('post')).toBe(true);
  });

  it('LEER no cuenta, y es a propósito', () => {
    // Un refresco automático también lee. Lo que sí cuenta es haber
    // navegado hasta ahí, y eso se apunta desde los «layouts».
    expect(cuentaComoActividad(DATOS, 'GET')).toBe(false);
    expect(cuentaComoActividad(DATOS, undefined)).toBe(false);
    expect(cuentaComoActividad(DATOS, 'HEAD')).toBe(false);
    expect(cuentaComoActividad(DATOS, 'OPTIONS')).toBe(false);
  });

  it('RENOVAR LA SESIÓN no cuenta', () => {
    // Esta es la que arruinaría la mejora entera: ocurre sola cada hora
    // y dejaría a todo el mundo con actividad permanente, tenga la
    // pestaña delante o enterrada.
    const sesion = 'https://proyecto.supabase.co/auth/v1/token?grant_type=refresh_token';
    expect(cuentaComoActividad(sesion, 'POST')).toBe(false);
    expect(esRutaDeDatos(sesion)).toBe(false);
    expect(esRutaDeDatos('https://proyecto.supabase.co/auth/v1/user')).toBe(false);
  });

  it('el propio apunte NO cuenta como actividad', () => {
    // Si contara, cada apunte provocaría otro apunte.
    const yo = 'https://proyecto.supabase.co/rest/v1/rpc/touch_activity';
    expect(cuentaComoActividad(yo, 'POST')).toBe(false);
    expect(esRutaDeDatos(yo)).toBe(false);
  });

  it('subir un archivo al almacén tampoco pasa por aquí', () => {
    // Storage va por otra ruta; la actividad de subir un archivo se
    // apunta igualmente, porque registrarlo en la base de datos sí es
    // una escritura de «/rest/v1/».
    expect(esRutaDeDatos('https://proyecto.supabase.co/storage/v1/object/documentos/x.pdf'))
      .toBe(false);
  });

  it('con una URL vacía o ausente no revienta', () => {
    expect(cuentaComoActividad(null, 'POST')).toBe(false);
    expect(cuentaComoActividad(undefined, 'POST')).toBe(false);
    expect(cuentaComoActividad('', 'POST')).toBe(false);
  });
});
