import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { PageHeader } from './Layout';

/**
 * Pantalla de un módulo todavía no construido.
 * Explica con claridad qué contendrá, para que la navegación pueda
 * probarse completa desde la fase 1 sin páginas vacías ni confusas.
 */
export function PendingModule({ title, intro, points, backTo }: {
  title: string; intro: string; points: string[]; backTo: string;
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="pending-module">
        <span className="badge-phase"><Construction size={14} aria-hidden />En preparación</span>
        <section className="panel">
          <div className="panel-body stack">
            <p style={{ fontSize: '1.02rem', margin: 0 }}>{intro}</p>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Lo que incluirá esta sección</div>
              <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              La base técnica ya está lista: acceso, permisos, base de datos y almacenamiento.
              Este módulo se añade en una fase posterior sin modificar lo construido.
            </p>
            <div><Link className="btn" to={backTo}>Volver al inicio</Link></div>
          </div>
        </section>
      </div>
    </>
  );
}
