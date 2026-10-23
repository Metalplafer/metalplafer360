import { describe, expect, it } from 'vitest';
import {
  adjuntoAdmitido, dentroDeVentana, firmaValida, igualesEnTiempoConstante,
  nombreSeguro, remitenteOriginal,
} from '../../supabase/functions/_shared/correo';

/**
 * MEJORA 6 · LO QUE HAY QUE AVERIGUAR DE UN CORREO QUE LLEGA.
 *
 * Esta es la parte del módulo de correo que se puede probar sin
 * proveedor, sin red y sin base de datos, y es justo la parte donde un
 * fallo se nota poco y duele: si el remitente original se adivina mal,
 * administración llama al cliente equivocado.
 */
describe('la firma del proveedor', () => {
  const CLAVE = 'clave-de-firma-de-pruebas';

  /** La firma de verdad, calculada igual que la calcula el proveedor. */
  async function firma(timestamp: string, token: string, clave = CLAVE) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(clave),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const b = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(`${timestamp}${token}`),
    );
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  it('acepta una firma correcta', async () => {
    const f = await firma('1760000000', 'un-token');
    expect(await firmaValida('1760000000', 'un-token', f, CLAVE)).toBe(true);
  });

  it('acepta la firma en mayúsculas o con espacios, que es como a veces llega', async () => {
    const f = await firma('1760000000', 'un-token');
    expect(await firmaValida('1760000000', 'un-token', ` ${f.toUpperCase()} `, CLAVE)).toBe(true);
  });

  it('rechaza una firma de otro mensaje', async () => {
    const f = await firma('1760000000', 'un-token');
    expect(await firmaValida('1760000001', 'un-token', f, CLAVE)).toBe(false);
    expect(await firmaValida('1760000000', 'otro-token', f, CLAVE)).toBe(false);
  });

  it('rechaza una firma hecha con otra clave', async () => {
    const f = await firma('1760000000', 'un-token', 'la-clave-de-otro');
    expect(await firmaValida('1760000000', 'un-token', f, CLAVE)).toBe(false);
  });

  it('y rechaza que falte cualquiera de las piezas', async () => {
    expect(await firmaValida('', 't', 'f', CLAVE)).toBe(false);
    expect(await firmaValida('1', '', 'f', CLAVE)).toBe(false);
    expect(await firmaValida('1', 't', '', CLAVE)).toBe(false);
    expect(await firmaValida('1', 't', 'f', '')).toBe(false);
  });

  it('la comparación no se para en la primera letra distinta', () => {
    expect(igualesEnTiempoConstante('abc', 'abc')).toBe(true);
    expect(igualesEnTiempoConstante('abc', 'abd')).toBe(false);
    expect(igualesEnTiempoConstante('abc', 'ab')).toBe(false);
    expect(igualesEnTiempoConstante('', '')).toBe(true);
  });
});

describe('la hora de la petición', () => {
  const AHORA = 1_760_000_000;

  it('acepta lo reciente', () => {
    expect(dentroDeVentana(String(AHORA), AHORA)).toBe(true);
    expect(dentroDeVentana(String(AHORA - 600), AHORA)).toBe(true);
    // También lo que viene del futuro inmediato: los relojes no cuadran al segundo.
    expect(dentroDeVentana(String(AHORA + 60), AHORA)).toBe(true);
  });

  it('y rechaza lo viejo', () => {
    expect(dentroDeVentana(String(AHORA - 3600), AHORA)).toBe(false);
    expect(dentroDeVentana(String(AHORA - 90 * 86400), AHORA)).toBe(false);
  });

  it('con una hora que no es una hora, no', () => {
    expect(dentroDeVentana('ayer', AHORA)).toBe(false);
    expect(dentroDeVentana('', AHORA)).toBe(false);
    expect(dentroDeVentana('0', AHORA)).toBe(false);
  });
});

describe('quién mandó el correo originalmente', () => {
  it('un correo directo del cliente no es un reenvío', () => {
    const r = remitenteOriginal(
      'Presupuesto barandilla', 'Buenos días, necesito un presupuesto.', 'laura@ejemplo.com',
    );
    expect(r.reenviado).toBe(false);
    expect(r.correo).toBeNull();
    expect(r.pendienteDeRevision).toBe(false);
  });

  /** El caso de todos los días: administración reenvía desde Outlook. */
  it('saca el cliente de un reenvío de Outlook en castellano', () => {
    const r = remitenteOriginal(
      'RV: Presupuesto para la nave',
      [
        'Te paso lo que ha mandado el cliente.',
        '',
        '-----Mensaje original-----',
        'De: Laura Soler <laura.soler@construccionessoler.es>',
        'Enviado el: martes, 20 de octubre de 2026 9:14',
        'Para: info@metalplafer.com',
        'Asunto: Presupuesto para la nave',
        '',
        'Buenos días, necesitaríamos presupuesto para…',
      ].join('\n'),
      'administracion@metalplafer.com',
    );
    expect(r.reenviado).toBe(true);
    expect(r.correo).toBe('laura.soler@construccionessoler.es');
    expect(r.nombre).toBe('Laura Soler');
    expect(r.asunto).toBe('Presupuesto para la nave');
    expect(r.pendienteDeRevision).toBe(false);
  });

  it('y de un reenvío de Gmail en inglés', () => {
    const r = remitenteOriginal(
      'Fwd: Railing quote',
      [
        '---------- Forwarded message ---------',
        'From: John Smith <john@example.co.uk>',
        'Date: Tue, 20 Oct 2026 at 09:14',
        'Subject: Railing quote',
        'To: <info@metalplafer.com>',
        '',
        'Hello,',
      ].join('\n'),
      'administracion@metalplafer.com',
    );
    expect(r.correo).toBe('john@example.co.uk');
    expect(r.nombre).toBe('John Smith');
    expect(r.asunto).toBe('Railing quote');
  });

  it('quita todos los «RV:» y «Fwd:» apilados del asunto', () => {
    const r = remitenteOriginal(
      'RV: Fwd: RV: Puerta del almacén',
      '-------- Mensaje reenviado --------\nDe: pepe@ejemplo.com\n',
      'administracion@metalplafer.com',
    );
    expect(r.asunto).toBe('Puerta del almacén');
    expect(r.correo).toBe('pepe@ejemplo.com');
  });

  /**
   * LO QUE IMPORTA DE VERDAD: cuando no se puede saber, se dice que no
   * se puede saber. Esto es lo que el encargo pedía expresamente que no
   * se inventara.
   */
  it('si parece reenviado y no hay remitente dentro, lo deja pendiente de revisión', () => {
    const r = remitenteOriginal(
      'RV: una cosa',
      'Mira esto que me han mandado.',
      'administracion@metalplafer.com',
    );
    expect(r.reenviado).toBe(true);
    expect(r.correo).toBeNull();
    expect(r.nombre).toBeNull();
    expect(r.pendienteDeRevision).toBe(true);
  });

  it('y si el remitente de dentro es el mismo que lo reenvió, también', () => {
    const r = remitenteOriginal(
      'RV: mis notas',
      '-----Mensaje original-----\nDe: Administración <administracion@metalplafer.com>\n',
      'administracion@metalplafer.com',
    );
    expect(r.reenviado).toBe(true);
    expect(r.correo).toBeNull();
    expect(r.pendienteDeRevision).toBe(true);
  });

  it('no confunde una firma con un reenvío', () => {
    // Sin «RV:» en el asunto y sin separador: un «De:» dentro de una
    // firma o de una cita no convierte el mensaje en un reenvío… pero si
    // viene con la forma de una cabecera, se trata como tal y se deja
    // pendiente de revisión, que es el lado seguro.
    const r = remitenteOriginal(
      'Consulta',
      'Buenos días.\n\nUn saludo,\nPepe\nTel: 600000000',
      'pepe@ejemplo.com',
    );
    expect(r.reenviado).toBe(false);
    expect(r.correo).toBeNull();
  });

  it('coge el primer remitente de una cadena de reenvíos', () => {
    const r = remitenteOriginal(
      'RV: RV: Rejas',
      [
        '-------- Mensaje reenviado --------',
        'De: Cliente Final <cliente@final.com>',
        'Asunto: Rejas',
        '',
        '-------- Mensaje reenviado --------',
        'De: Otro Anterior <anterior@otro.com>',
      ].join('\n'),
      'administracion@metalplafer.com',
    );
    expect(r.correo).toBe('cliente@final.com');
  });

  it('aguanta un cuerpo vacío, nulo o sin asunto', () => {
    expect(remitenteOriginal(null, null, null).reenviado).toBe(false);
    expect(remitenteOriginal(undefined, undefined, undefined).correo).toBeNull();
    expect(remitenteOriginal('', '', '').pendienteDeRevision).toBe(false);
  });

  it('lee el correo aunque venga sin «<>» y con el nombre detrás', () => {
    const r = remitenteOriginal(
      'Fwd: medidas',
      'Begin forwarded message:\nFrom: laura@ejemplo.com\n',
      'admin@metalplafer.com',
    );
    expect(r.correo).toBe('laura@ejemplo.com');
    expect(r.nombre).toBeNull();
  });

  it('y pasa el correo a minúsculas, porque se compara con el del cliente', () => {
    const r = remitenteOriginal(
      'RV: hola',
      '-----Mensaje original-----\nDe: LAURA@Ejemplo.COM\n',
      'admin@metalplafer.com',
    );
    expect(r.correo).toBe('laura@ejemplo.com');
  });
});

describe('el nombre con el que se guarda un adjunto', () => {
  it('deja un nombre normal como está', () => {
    expect(nombreSeguro('plano-barandilla.pdf')).toBe('plano-barandilla.pdf');
  });

  it('quita rutas: un adjunto no elige dónde se guarda', () => {
    expect(nombreSeguro('../../secreto.pdf')).toBe('secreto.pdf');
    expect(nombreSeguro('/etc/passwd')).toBe('passwd');
    expect(nombreSeguro('C:\\Users\\pepe\\plano.dwg')).toBe('plano.dwg');
    expect(nombreSeguro('..')).toBe('adjunto');
  });

  it('quita acentos, espacios y caracteres raros', () => {
    expect(nombreSeguro('Medición náve 1.jpg')).toBe('Medicion-nave-1.jpg');
    expect(nombreSeguro('plano (versión 2).pdf')).toBe('plano-version-2-.pdf');
  });

  it('recorta los nombres larguísimos', () => {
    expect(nombreSeguro(`${'a'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
  });

  it('y pone un nombre cuando no hay ninguno', () => {
    expect(nombreSeguro('')).toBe('adjunto');
    expect(nombreSeguro(null)).toBe('adjunto');
    expect(nombreSeguro('   ')).toBe('adjunto');
    expect(nombreSeguro('...')).toBe('adjunto');
  });
});

describe('qué adjuntos se guardan', () => {
  it('acepta lo que manda un cliente de verdad', () => {
    expect(adjuntoAdmitido('image/jpeg', 2_000_000, 25).ok).toBe(true);
    expect(adjuntoAdmitido('application/pdf', 500_000, 25).ok).toBe(true);
    expect(adjuntoAdmitido('video/mp4', 20_000_000, 25).ok).toBe(true);
    expect(adjuntoAdmitido('image/vnd.dxf', 100_000, 25).ok).toBe(true);
  });

  it('rechaza lo que pasa del tamaño, diciendo cuánto ocupa', () => {
    const r = adjuntoAdmitido('video/mp4', 40_000_000, 25);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('38.1 MB');
    if (!r.ok) expect(r.motivo).toContain('25 MB');
  });

  it('rechaza un ejecutable', () => {
    expect(adjuntoAdmitido('application/x-msdownload', 1000, 25).ok).toBe(false);
    expect(adjuntoAdmitido('application/x-sh', 100, 25).ok).toBe(false);
  });

  it('rechaza un archivo vacío o sin tipo', () => {
    expect(adjuntoAdmitido('image/jpeg', 0, 25).ok).toBe(false);
    expect(adjuntoAdmitido('', 1000, 25).ok).toBe(false);
    expect(adjuntoAdmitido(null, 1000, 25).ok).toBe(false);
    expect(adjuntoAdmitido('image/jpeg', Number.NaN, 25).ok).toBe(false);
  });

  it('y no se lía con mayúsculas ni espacios en el tipo', () => {
    expect(adjuntoAdmitido('  IMAGE/PNG  ', 1000, 25).ok).toBe(true);
  });
});
