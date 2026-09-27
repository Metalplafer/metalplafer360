import { describe, expect, it } from 'vitest';
import {
  addDays, fmtBytes, fmtDate, fmtDateTime, fmtEur, fmtHours, fmtNumber, fmtPhone,
  dayLabel, fmtTimeShort, greeting, longDate, parseDecimal, parseHours, relativeDay,
  todayMadrid, usernameToEmail,
} from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { whatsappLink } from '@/lib/whatsapp';
import { categoryFor, safeStorageName, validateFileSize } from '@/lib/files';
import { FICHA_STATUSES, fichaStatus } from '@/config/constants';

describe('fechas en hora de Madrid', () => {
  it('formatea en DD/MM/YYYY', () => {
    expect(fmtDate('2026-09-17')).toBe('17/09/2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('texto no válido')).toBe('—');
  });

  it('usa la hora española y no la del servidor (UTC)', () => {
    // 23:30 UTC del 17 de septiembre ya es el día 18 en Madrid (verano, UTC+2).
    expect(todayMadrid(new Date('2026-09-17T23:30:00Z'))).toBe('2026-09-18');
    // En invierno (UTC+1) también.
    expect(todayMadrid(new Date('2026-01-31T23:30:00Z'))).toBe('2026-02-01');
    // A las 22:00 UTC del 17 de septiembre todavía es día 18 en Madrid.
    expect(todayMadrid(new Date('2026-09-17T12:00:00Z'))).toBe('2026-09-17');
  });

  it('muestra la hora local española', () => {
    expect(fmtDateTime('2026-09-17T08:30:00Z')).toBe('17/09/2026, 10:30');
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('escribe la fecha en castellano', () => {
    expect(longDate('2026-09-17')).toBe('Jueves 17 de septiembre');
    expect(longDate('2026-03-01')).toBe('Domingo 1 de marzo');
  });

  it('dice Hoy, Mañana y Ayer', () => {
    expect(relativeDay('2026-09-17', '2026-09-17')).toBe('Hoy');
    expect(relativeDay('2026-09-18', '2026-09-17')).toBe('Mañana');
    expect(relativeDay('2026-09-16', '2026-09-17')).toBe('Ayer');
    expect(relativeDay('2026-09-20', '2026-09-17')).toBe('Domingo 20 de septiembre');
  });

  it('la fecha de una orden siempre lleva el día en DD/MM/AAAA', () => {
    expect(dayLabel('2026-09-17', '2026-09-17')).toBe('Hoy · 17/09/2026');
    expect(dayLabel('2026-09-18', '2026-09-17')).toBe('Mañana · 18/09/2026');
    expect(dayLabel('2026-09-24', '2026-09-17')).toBe('Jueves · 24/09/2026');
  });

  it('saluda según la hora de Madrid', () => {
    expect(greeting(new Date('2026-09-17T06:00:00Z'))).toBe('Buenos días');  // 08:00 en Madrid
    expect(greeting(new Date('2026-09-17T16:00:00Z'))).toBe('Buenas tardes'); // 18:00
    expect(greeting(new Date('2026-09-17T22:00:00Z'))).toBe('Buenas noches'); // 00:00
  });
});

describe('números con formato español', () => {
  it('entiende comas decimales y unidades escritas', () => {
    expect(parseDecimal('7,5')).toBe(7.5);
    expect(parseDecimal('7.5')).toBe(7.5);
    expect(parseDecimal('7,5 h')).toBe(7.5);
    expect(parseDecimal('1.250,50 €')).toBe(1250.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('cinco')).toBeNull();
  });

  it('el punto de los millares no se confunde con un decimal', () => {
    expect(parseDecimal('2.400')).toBe(2400);        // dos mil cuatrocientos
    expect(parseDecimal('1.250.500')).toBe(1250500);
    expect(parseDecimal('12.000 €')).toBe(12000);
    expect(parseDecimal('2.45')).toBe(2.45);         // no son millares: es decimal
    expect(parseDecimal('0.5')).toBe(0.5);
    expect(parseDecimal('2.4000')).toBe(2.4);
  });

  it('valida las horas de trabajo', () => {
    expect(parseHours('7,5')).toBe(7.5);
    expect(parseHours('0,25')).toBe(0.25);
    expect(parseHours('0')).toBeNull();      // debe ser mayor que 0
    expect(parseHours('25')).toBeNull();     // no caben más de 24 horas en un día
    expect(parseHours('-3')).toBeNull();
  });

  it('muestra los números como se escriben en España', () => {
    expect(fmtNumber(1250.5)).toBe('1.250,5');
    expect(fmtHours(7.5)).toBe('7,5 h');
    // El espacio antes del € es un espacio duro (\u00A0): evita que el
    // importe se parta al final de una línea.
    expect(fmtEur(5000)).toBe('5.000,00\u00A0€');   // proyecto de 5.000 €
    expect(fmtEur(3000)).toBe('3.000,00\u00A0€');   // pendiente = 5.000 − 2.000
    expect(fmtNumber(null)).toBe('—');
  });

  it('muestra los tamaños de archivo', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('acceso con nombre de usuario', () => {
  it('convierte el usuario en el correo interno', () => {
    expect(usernameToEmail('salvi', 'metalplafer.com')).toBe('salvi@metalplafer.com');
    expect(usernameToEmail('  SALVI ', 'metalplafer.com')).toBe('salvi@metalplafer.com');
    expect(usernameToEmail('salvi@otro.com', 'metalplafer.com')).toBe('salvi@otro.com');
  });
});

describe('mensajes de error comprensibles', () => {
  it('traduce los errores de acceso', () => {
    expect(toUserMessage({ message: 'Invalid login credentials' })).toBe('Usuario o contraseña incorrectos.');
    expect(toUserMessage({ message: 'JWT expired' })).toBe('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  });

  it('traduce los errores de permisos', () => {
    expect(toUserMessage({ code: '42501', message: 'new row violates row-level security policy' }))
      .toBe('No tienes permisos para realizar esta acción.');
  });

  it('traduce los errores de conexión', () => {
    expect(toUserMessage({ message: 'Failed to fetch' }))
      .toBe('No se ha podido conectar con el servidor. Revisa la conexión y vuelve a intentarlo.');
  });

  it('traduce los errores de archivos y duplicados', () => {
    expect(toUserMessage({ status: 413, message: 'Payload too large' }))
      .toBe('El archivo supera el tamaño máximo permitido.');
    expect(toUserMessage({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }))
      .toBe('Ya existe un usuario con ese nombre.');
  });

  it('respeta los mensajes que ya escribimos en castellano', () => {
    expect(toUserMessage({ code: '23514', message: 'Debe existir al menos un administrador activo' }))
      .toBe('Debe existir al menos un administrador activo');
  });

  it('nunca muestra jerga técnica al usuario', () => {
    expect(toUserMessage({ message: 'PGRST116: JSON object requested, multiple rows returned' }))
      .toBe('Ha ocurrido un error inesperado. Inténtalo de nuevo.');
  });
});

describe('teléfonos y WhatsApp', () => {
  it('muestra los teléfonos españoles legibles', () => {
    expect(fmtPhone('600111222')).toBe('600 111 222');
    expect(fmtPhone('+34600111222')).toBe('+34 600 111 222');
    expect(fmtPhone(null)).toBe('—');
    expect(fmtPhone('93 000 00 00 ext 3')).toBe('93 000 00 00 ext 3');  // no lo toca si es raro
  });

  it('crea el enlace de WhatsApp con el prefijo de España', () => {
    expect(whatsappLink('600111222')).toBe('https://wa.me/34600111222');
    expect(whatsappLink('+33 6 12 34 56 78')).toBe('https://wa.me/33612345678');
    expect(whatsappLink('123')).toBeNull();
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink('600111222', 'Hola')).toContain('?text=Hola');
  });

  it('recorta la hora a horas y minutos', () => {
    expect(fmtTimeShort('09:30:00')).toBe('09:30');
    expect(fmtTimeShort(null)).toBe('');
  });
});

describe('archivos', () => {
  it('reconoce fotos, vídeos y documentos', () => {
    expect(categoryFor('image/jpeg', 'obra.jpg')).toBe('foto');
    expect(categoryFor(undefined, 'IMG_0021.HEIC')).toBe('foto');
    expect(categoryFor('video/mp4', 'montaje.mp4')).toBe('video');
    expect(categoryFor('application/pdf', 'presupuesto.pdf')).toBe('documento');
  });

  it('guarda los archivos con un nombre seguro y sin repetir', () => {
    const a = safeStorageName('Plano acabado ñ2 (versión final).pdf');
    expect(a).toMatch(/^[a-z0-9]+-Plano-acabado-n2-version-final\.pdf$/);
    expect(safeStorageName('foto.jpg')).not.toBe(safeStorageName('foto.jpg'));
  });

  it('rechaza archivos vacíos o demasiado grandes', () => {
    expect(validateFileSize({ size: 0 }, 100)).toContain('vacío');
    expect(validateFileSize({ size: 101 * 1024 * 1024 }, 100)).toContain('100 MB');
    expect(validateFileSize({ size: 5 * 1024 * 1024 }, 100)).toBeNull();
  });
});

describe('estados de las fichas', () => {
  it('cada tipo tiene exactamente los estados acordados', () => {
    expect(FICHA_STATUSES.presupuesto.map((s) => s.label)).toEqual([
      'Por asignar', 'Presupuesto pendiente', 'Presupuesto avanzado', 'Presupuesto por revisar',
      'Presupuesto enviado', 'Presupuesto aceptado', 'Presupuesto cancelado',
    ]);
    expect(FICHA_STATUSES.visita.map((s) => s.label)).toEqual([
      'Por asignar', 'Asignada', 'Realizada', 'Cancelada',
    ]);
    expect(FICHA_STATUSES.aviso.map((s) => s.label)).toEqual([
      'Por asignar', 'Pendiente', 'Asignado', 'En curso', 'Realizado', 'Cerrado',
    ]);
  });

  it('no existen los estados «rechazado» ni «perdido»', () => {
    const todos = Object.values(FICHA_STATUSES).flat().map((s) => s.key);
    expect(todos).not.toContain('rechazado');
    expect(todos).not.toContain('perdido');
  });

  it('un estado desconocido no rompe la pantalla', () => {
    expect(fichaStatus('aviso', 'inventado').label).toBe('inventado');
  });
});
