import type { ReactNode } from 'react';

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, tight }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; tight?: boolean;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          <h2>{title}</h2>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`panel-body${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'attention' }) {
  return (
    <div className={`stat${tone === 'attention' ? ' attention' : ''}`}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

export function Badge({ tone = 'neutral', children, plain }: {
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'steel' | 'signal';
  children: ReactNode; plain?: boolean;
}) {
  return <span className={`badge tone-${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

/** Placa metálica: se usará para los códigos PROY-2026-001, OT-2026-001… */
export function CodePlate({ code, dark }: { code: string; dark?: boolean }) {
  return <span className={`plate${dark ? ' plate-dark' : ''}`}>{code}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="count cond"> {t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, count, onPage }: {
  page: number; pageSize: number; count: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return null;
  return (
    <div className="pagination">
      <span>{page * pageSize + 1}–{Math.min(count, (page + 1) * pageSize)} de {count}</span>
      <div className="row">
        <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
        <span className="num">Página {page + 1} de {pages}</span>
        <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, span }: {
  label: string; htmlFor?: string; hint?: string; error?: string | null; children: ReactNode; span?: boolean;
}) {
  return (
    <div className={`field${span ? ' span-2' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
