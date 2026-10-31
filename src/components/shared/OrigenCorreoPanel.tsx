import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { Panel } from '@/components/ui/Layout';
import { mailRequestForFicha } from '@/services/mail';
import { fmtDateTime } from '@/lib/format';

/**
 * DE DÓNDE VIENE ESTA FICHA, CUANDO VIENE DE UN CORREO.
 *
 * EL PROBLEMA QUE RESUELVE. La bandeja de entrada guardaba el correo
 * del cliente entero —asunto, remitente, cuerpo, fecha— y al convertir
 * la solicitud en un aviso o en un presupuesto, ese correo se quedaba
 * atrás. No se borraba: seguía en la solicitud. Pero desde la ficha no
 * había ninguna manera de llegar a él, y la ficha es lo que mira quien
 * tiene que hacer el trabajo. Información guardada a la que nadie puede
 * llegar es información perdida en la práctica.
 *
 * El vínculo existía desde la mejora 6, pero solo se recorría en un
 * sentido: la solicitud sabía cuál era su ficha, la ficha no sabía nada
 * de su solicitud. Esto lo recorre al revés.
 *
 * NO HIZO FALTA NI UNA COLUMNA NUEVA: se pregunta por
 * «mail_requests.target_ficha_id», que ya estaba ahí.
 *
 * SE ENSEÑA EL TEXTO PLANO, NO EL HTML, por lo mismo que en la bandeja:
 * pintar el HTML de un correo de fuera es meter el código de un
 * desconocido en la pantalla. El original se conserva entero en la base
 * de datos.
 *
 * Si la ficha se creó a mano —que es lo normal— el panel NO se dibuja.
 */
export function OrigenCorreoPanel({ fichaId }: { fichaId: string }) {
  const sol = useAsync(() => mailRequestForFicha(fichaId), [fichaId]);
  const m = sol.data;

  // Ni mientras carga, ni si no viene de un correo, ni si falla: un
  // panel de origen no justifica un error en mitad de la ficha.
  if (!m) return null;

  const asunto = m.original_subject ?? m.subject ?? null;
  const cuerpo = m.body_text?.trim()
    || (m.body_html ? '(el correo venía solo en formato HTML)' : '(sin texto)');

  return (
    <Panel title="De dónde viene">
      <p className="hint" style={{ marginTop: 0 }}>
        <Mail size={13} aria-hidden style={{ verticalAlign: '-2px' }} />{' '}
        Esta ficha salió de la solicitud{' '}
        <Link to={`/admin/solicitudes/${m.id}`}><strong>{m.code}</strong></Link>.
        El correo se conserva completo allí, con sus archivos.
      </p>

      <dl className="kv">
        <dt>De</dt>
        <dd>
          {m.original_sender_email ?? m.sender_email ?? '—'}
          {m.original_sender_name && ` · ${m.original_sender_name}`}
        </dd>

        {m.forwarded && (
          <>
            <dt>Reenviado por</dt>
            <dd>
              {m.sender_email ?? '—'}
              {m.sender_name && ` · ${m.sender_name}`}
            </dd>
          </>
        )}

        <dt>Asunto</dt>
        <dd>
          {asunto ?? '—'}
          {m.original_subject && m.subject && m.original_subject !== m.subject && (
            <> <span className="faint">(llegó como «{m.subject}»)</span></>
          )}
        </dd>

        <dt>Recibida</dt>
        <dd>{fmtDateTime(m.received_at)}</dd>
      </dl>

      {/*
        El cuerpo va plegado. Un correo de cliente es largo —saludos,
        quejas, la historia entera— y desplegado empujaría hacia abajo
        todo lo demás de la ficha en cada visita. Plegado está a un clic
        y no estorba a quien ya sabe de qué va.
      */}
      <details className="correo-plegado">
        <summary>Ver el correo del cliente</summary>
        <div className="correo-cuerpo pre">{cuerpo}</div>
      </details>

      {/*
        Las observaciones internas NO se repiten aquí: se trajeron a la
        descripción de la ficha al convertirla, y enseñarlas dos veces
        en la misma pantalla invita a editar la copia equivocada.
      */}
    </Panel>
  );
}
