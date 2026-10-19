import { useRef, useState } from 'react';
import {
  Building2, CalendarRange, CloudUpload, Database, Download, HardDrive, Hash,
  RefreshCw, Save, Smartphone, TriangleAlert, Upload,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  backupToDrive, driveAuthUrl, driveDisconnect, driveStatus,
  generateBackup, listBackups, readBackupFile, restoreBackup,
} from '@/services/backup';
import {
  getSettings, listCounters, saveStorageQuota, setBackupSettings, setCompany, setCounter,
  setGapDays, setMaxFileMb, storageSummary, storageUsage,
} from '@/services/settings';
import { RESTORE_SCOPES, tablesForScopes, type BackupContents } from '@/lib/export/backup';
import { MIME, downloadBytes } from '@/lib/download';
import { fmtBytes, fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';
import { Aviso } from '@/lib/errors';

import type { AppSettings } from '@/types/db';

type Tab = 'empresa' | 'numeracion' | 'copias' | 'planificacion'
  | 'almacenamiento' | 'preferencias';

const CODE_LABEL: Record<string, string> = {
  PRES: 'Presupuestos', VIS: 'Visitas', AVI: 'Avisos',
  PROY: 'Proyectos', OT: 'Órdenes de trabajo',
};

/** Configuración general: empresa, numeración, copias, almacenamiento y PWA. */
export default function SettingsPage() {
  const { companyName, maxFileMb } = useAuth();
  const [tab, setTab] = useState<Tab>('empresa');
  const [reloadKey, setReloadKey] = useState(0);

  const settings = useAsync(() => getSettings(), [reloadKey]);
  const reload = () => setReloadKey((n) => n + 1);

  return (
    <>
      <PageHeader title="Configuración" sub="Empresa, numeración, copias de seguridad y almacenamiento." />

      <section className="panel">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'empresa' as const, label: 'Empresa' },
            { key: 'numeracion' as const, label: 'Numeración' },
            { key: 'copias' as const, label: 'Copias de seguridad' },
            { key: 'planificacion' as const, label: 'Planificación' },
            { key: 'almacenamiento' as const, label: 'Almacenamiento' },
            { key: 'preferencias' as const, label: 'Aplicación' },
          ]}
        />
      </section>

      <div className="stack" style={{ gap: 16, marginTop: 16 }}>
        {settings.loading && !settings.data ? <Loading />
          : settings.error ? <ErrorBox message={settings.error} onRetry={settings.reload} />
          : settings.data && (
            <>
              {tab === 'empresa' && <CompanyTab settings={settings.data} onSaved={reload} />}
              {tab === 'numeracion' && <CountersTab />}
              {tab === 'copias' && (
                <BackupTab settings={settings.data} company={companyName} onSaved={reload} />
              )}
              {tab === 'planificacion' && (
                <PlanningTab settings={settings.data} onSaved={reload} />
              )}
              {tab === 'almacenamiento' && (
                <StorageTab settings={settings.data} maxFileMb={maxFileMb} onSaved={reload} />
              )}
              {tab === 'preferencias' && <AppTab />}
            </>
          )}
      </div>

    </>
  );
}

// ---------------------------------------------------------------------
// EMPRESA
// ---------------------------------------------------------------------
function CompanyTab({ settings, onSaved }: {
  settings: { company: Record<string, string> }; onSaved: () => void;
}) {
  const { toast } = useDialogs();
  const c = settings.company ?? {};
  const [form, setForm] = useState({
    name: c.name ?? '', tax_id: c.tax_id ?? '', address: c.address ?? '',
    city: c.city ?? '', postal_code: c.postal_code ?? '',
    phone: c.phone ?? '', email: c.email ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    try {
      await setCompany(form);
      toast.success('Datos de la empresa guardados');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <Panel title={<span className="row" style={{ gap: 7 }}><Building2 size={17} />Datos de la empresa</span>}>
      <div className="form-grid">
        <Field label="Nombre" htmlFor="c-name" span>
          <input id="c-name" className="input" value={form.name}
                 placeholder="METALPLAFER S.L." onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="CIF" htmlFor="c-tax">
          <input id="c-tax" className="input" value={form.tax_id}
                 onChange={(e) => set({ tax_id: e.target.value })} />
        </Field>
        <Field label="Teléfono" htmlFor="c-phone">
          <input id="c-phone" className="input" value={form.phone} inputMode="tel"
                 onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Dirección" htmlFor="c-address" span>
          <input id="c-address" className="input" value={form.address}
                 onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Población" htmlFor="c-city">
          <input id="c-city" className="input" value={form.city}
                 onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Código postal" htmlFor="c-cp">
          <input id="c-cp" className="input" value={form.postal_code}
                 onChange={(e) => set({ postal_code: e.target.value })} />
        </Field>
        <Field label="Correo de contacto" htmlFor="c-email" span
               hint="Solo para que aparezca en los informes. La aplicación no envía correos.">
          <input id="c-email" className="input" value={form.email} inputMode="email"
                 onChange={(e) => set({ email: e.target.value })} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          <Save />{busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        El nombre aparece en la cabecera de los informes en PDF y en las hojas de Excel.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// NUMERACIÓN
// ---------------------------------------------------------------------
function CountersTab() {
  const { toast } = useDialogs();
  const [reloadKey, setReloadKey] = useState(0);
  const counters = useAsync(() => listCounters(), [reloadKey]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function save(prefix: string, year: number) {
    const key = `${prefix}-${year}`;
    const value = Number(draft[key]);
    if (!Number.isInteger(value) || value < 0) {
      toast.error(new Error('Escribe un número entero.'));
      return;
    }
    try {
      await setCounter(prefix, year, value);
      toast.success('Numeración corregida');
      setDraft((d) => ({ ...d, [key]: '' }));
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); }
  }

  return (
    <Panel title={<span className="row" style={{ gap: 7 }}><Hash size={17} />Numeración</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Cada serie empieza en 1 cada año: <strong>PRES-2026-001</strong>, <strong>OT-2026-001</strong>…
        Solo hay que tocar esto si se traen datos de otro sitio y hay que continuar la numeración.
      </p>

      {counters.loading && !counters.data ? <Loading />
        : !counters.data?.length ? (
          <Empty title="Todavía no se ha creado ningún código">
            En cuanto crees la primera ficha aparecerá aquí su serie.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Serie</th><th>Año</th><th className="right">Último número</th>
                  <th>Siguiente código</th><th>Corregir</th>
                </tr>
              </thead>
              <tbody>
                {counters.data.map((c) => {
                  const key = `${c.prefix}-${c.year}`;
                  const next = String(c.last_value + 1).padStart(3, '0');
                  return (
                    <tr key={key}>
                      <td>
                        <span className="cell-main">
                          <strong>{c.prefix}</strong>
                          <small>{CODE_LABEL[c.prefix] ?? ''}</small>
                        </span>
                      </td>
                      <td>{c.year}</td>
                      <td className="right num">{fmtNumber(c.last_value)}</td>
                      <td><span className="plate">{c.prefix}-{c.year}-{next}</span></td>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <label htmlFor={`cnt-${key}`} className="sr-only">
                            Último número de {c.prefix} {c.year}
                          </label>
                          <input id={`cnt-${key}`} className="input" inputMode="numeric"
                                 style={{ width: 100 }} placeholder={String(c.last_value)}
                                 value={draft[key] ?? ''}
                                 onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
                          <button className="btn btn-sm" onClick={() => save(c.prefix, c.year)}
                                  disabled={!draft[key]}>Guardar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// COPIAS DE SEGURIDAD Y RESTAURACIÓN
// ---------------------------------------------------------------------
function BackupTab({ settings, company, onSaved }: {
  settings: { backup: Record<string, unknown>; backup_retention_days: number };
  company: string;
  onSaved: () => void;
}) {
  const { confirm, toast } = useDialogs();
  const [reloadKey, setReloadKey] = useState(0);
  const backups = useAsync(() => listBackups(20), [reloadKey]);
  const drive = useAsync(() => driveStatus(), [reloadKey]);

  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState(String(settings.backup_retention_days ?? 30));
  const [folder, setFolder] = useState(
    String((settings.backup as Record<string, string>)?.folder ?? 'METALPLAFER360 · Copias de seguridad'),
  );
  const [enabled, setEnabled] = useState(Boolean((settings.backup as Record<string, unknown>)?.enabled ?? true));

  const [contents, setContents] = useState<BackupContents | null>(null);
  const [fileName, setFileName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function generateNow() {
    setBusy(true);
    try {
      const { bytes, fileName: name } = await generateBackup({ company });
      downloadBytes(bytes, name, MIME.zip);
      toast.success('Copia generada y descargada');
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function conectarDrive() {
    setBusy(true);
    try {
      // La autorización ocurre en Google y vuelve al servidor: por aquí
      // no pasa ninguna credencial.
      const url = await driveAuthUrl();
      window.open(url, '_blank', 'noopener,width=520,height=680');
      toast.success('Se ha abierto Google en otra ventana. Autoriza y vuelve aquí.');
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function desconectarDrive() {
    const ok = await confirm({
      title: 'Desconectar Google Drive',
      message: <>
        Se olvidará el permiso de Google y dejarán de subirse copias, también la
        automática de las 02:00. Las copias que ya están en Drive no se tocan,
        y seguirás pudiendo descargar copias a tu ordenador.
      </>,
      confirmLabel: 'Desconectar', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await driveDisconnect();
      toast.success('Google Drive desconectado');
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function sendToDrive() {
    setBusy(true);
    try {
      const result = await backupToDrive();
      toast.success(result.file_name
        ? `Copia subida a Google Drive: ${result.file_name}`
        : 'Copia subida a Google Drive');
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      await setBackupSettings({ enabled, hour: 2, folder }, Number(retention));
      toast.success('Ajustes de copia guardados');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    try {
      const read = await readBackupFile(file);
      setContents(read);
      setFileName(file.name);
      setScopes(RESTORE_SCOPES.map((s) => s.key).filter((k) => read.payload[
        RESTORE_SCOPES.find((s) => s.key === k)?.tables[0] ?? ''
      ]?.length));
    } catch (e) {
      toast.error(e);
      setContents(null);
    }
  }

  async function doRestore() {
    if (!contents) return;
    setBusy(true);
    try {
      const result = await restoreBackup(contents, scopes);
      toast.success(`Restauración terminada: ${fmtNumber(result.total)} registros`);
      setConfirming(false);
      setContents(null);
      setFileName('');
      if (fileInput.current) fileInput.current.value = '';
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  const rows = backups.data ?? [];

  return (
    <>
      <Panel title={<span className="row" style={{ gap: 7 }}><Database size={17} />Copia de seguridad</span>}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-lg" onClick={generateNow} disabled={busy}>
            <Download />{busy ? 'Generando…' : 'GENERAR BACKUP AHORA'}
          </button>
          <button className="btn" onClick={sendToDrive}
                  disabled={busy || !drive.data?.conectado}>
            <CloudUpload />Subir a Google Drive
          </button>
        </div>

        {/* Estado de la conexión con Google Drive */}
        <div className="drive-box" style={{ marginTop: 14 }}>
          <span className="row" style={{ gap: 9, flex: 1, minWidth: 0 }}>
            <CloudUpload size={17} aria-hidden />
            <span className="cell-main">
              <strong className="row" style={{ gap: 8 }}>
                Google Drive
                {drive.data?.estado === 'conectado' && <Badge tone="green">Conectado</Badge>}
                {drive.data?.estado === 'error' && <Badge tone="red">Error de conexión</Badge>}
                {(!drive.data || drive.data.estado === 'sin_conectar')
                  && <Badge tone="steel">No conectado</Badge>}
              </strong>
              <small>
                {drive.data?.estado === 'conectado' ? (
                  <>
                    {drive.data.cuenta ? `${drive.data.cuenta} · ` : ''}
                    carpeta «{drive.data.carpeta}»
                    {drive.data.ultima_copia
                      ? ` · última copia subida el ${fmtDateTime(drive.data.ultima_copia)}`
                      : ' · todavía no se ha subido ninguna copia'}
                  </>
                ) : drive.data?.estado === 'error' ? (
                  drive.data.error
                ) : (
                  'Sin conectar, las copias solo se descargan a tu ordenador. '
                  + 'Conéctalo para guardarlas también en Google Drive y para que se '
                  + 'hagan solas cada noche.'
                )}
              </small>
            </span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={conectarDrive} disabled={busy}>
              {drive.data?.conectado ? 'Reconectar' : 'Conectar Google Drive'}
            </button>
            {drive.data?.conectado && (
              <button className="btn btn-sm btn-ghost" onClick={desconectarDrive} disabled={busy}>
                Desconectar
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => setReloadKey((n) => n + 1)}
                    aria-label="Comprobar la conexión con Google Drive">
              <RefreshCw />
            </button>
          </span>
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          La copia es un <strong>ZIP</strong> con un CSV por tabla, la referencia de cada archivo
          subido y los metadatos necesarios para restaurarla. Las fotografías y los vídeos
          no se convierten en CSV: siguen en el almacenamiento y aquí va su ruta.
        </p>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Copia automática" htmlFor="bk-enabled" span>
            <label className="checkbox" style={{ margin: 0 }}>
              <input id="bk-enabled" type="checkbox" checked={enabled}
                     onChange={(e) => setEnabled(e.target.checked)} />
              Generar una copia todos los días a las 02:00 y subirla a Google Drive
            </label>
          </Field>
          <Field label="Días que se conservan" htmlFor="bk-retention"
                 hint="Las copias automáticas más antiguas se borran de Drive.">
            <input id="bk-retention" className="input" inputMode="numeric" value={retention}
                   onChange={(e) => setRetention(e.target.value)} />
          </Field>
          <Field label="Nombre de la carpeta en Google Drive" htmlFor="bk-folder"
                 hint={drive.data?.conectado
                   ? 'La carpeta ya está creada. Si cambias el nombre aquí, se usará la '
                     + 'próxima vez que conectes; para renombrarla ahora, hazlo en Google Drive.'
                   : 'La aplicación creará esta carpeta en «Mi unidad» al conectar.'}>
            <input id="bk-folder" className="input" value={folder}
                   onChange={(e) => setFolder(e.target.value)} />
          </Field>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={saveSettings} disabled={busy}>
            <Save />Guardar ajustes
          </button>
        </div>

        <Alert kind="info">
          <strong>Las credenciales de Google no están en la aplicación.</strong>
          <div style={{ marginTop: 2 }}>
            La subida a Drive la hace un programa dentro de Supabase, que es donde se guardan
            esas claves. Ni la aplicación ni GitHub las ven nunca. La puesta en marcha está
            explicada paso a paso en la guía.
          </div>
        </Alert>
      </Panel>

      <Panel title="Copias hechas" tight>
        {backups.loading && !backups.data ? <Loading />
          : !rows.length ? (
            <Empty title="Todavía no se ha hecho ninguna copia">
              Pulsa «GENERAR BACKUP AHORA» para hacer la primera.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cuándo</th><th>Tipo</th><th>Destino</th><th>Archivo</th>
                    <th className="right">Tamaño</th><th className="right">Filas</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const filas = Object.values(b.tables ?? {}).reduce((s, n) => s + Number(n), 0);
                    return (
                      <tr key={b.id}>
                        <td className="nowrap">{fmtDateTime(b.started_at)}</td>
                        <td>{b.kind === 'automatico' ? 'Automática' : 'Manual'}</td>
                        <td>{b.destination === 'drive' ? 'Google Drive' : 'Descarga'}</td>
                        <td>
                          {b.drive_link
                            ? <a href={b.drive_link} target="_blank" rel="noopener noreferrer">{b.file_name}</a>
                            : (b.file_name ?? <span className="faint">—</span>)}
                        </td>
                        <td className="right num">{b.size_bytes ? fmtBytes(b.size_bytes) : '—'}</td>
                        <td className="right num">{filas ? fmtNumber(filas) : '—'}</td>
                        <td>
                          {b.status === 'completado' ? <Badge tone="green">Completada</Badge>
                            : b.status === 'error' ? <Badge tone="red">Error</Badge>
                            : <Badge tone="amber">En curso</Badge>}
                          {b.error && <div className="faint">{b.error}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      <Panel title={<span className="row" style={{ gap: 7 }}><Upload size={17} />Restaurar una copia</span>}>
        <Alert kind="warn">
          <strong>⚠️ Esta operación puede modificar información actual.</strong>
          <div style={{ marginTop: 2 }}>
            Los datos de la copia se vuelcan sobre los de ahora: lo que coincide se actualiza y
            lo que falta se añade. No se borra nada, pero lo que se sobrescriba no vuelve.
            Genera una copia antes, por si acaso.
          </div>
        </Alert>

        <input ref={fileInput} type="file" accept=".zip,application/zip" hidden
               onChange={(e) => pickFile(e.target.files?.[0])} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload />Elegir archivo de copia
          </button>
          {fileName && <span className="muted">{fileName}</span>}
        </div>

        {contents && (
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="figure-row">
              <span className="figure">
                <b>{contents.manifest ? fmtDateTime(contents.manifest.generado) : '—'}</b>
                <span>Copia generada el</span>
              </span>
              <span className="figure">
                <b>{fmtNumber(Object.values(contents.manifest?.tablas ?? {}).reduce((s, n) => s + Number(n), 0))}</b>
                <span>Registros en la copia</span>
              </span>
              <span className="figure">
                <b>{fmtNumber(contents.files)}</b>
                <span>Archivos referenciados</span>
              </span>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Qué quieres restaurar</div>
              <div className="substatus-grid">
                {RESTORE_SCOPES.map((scope) => {
                  const available = scope.tables.some((t) => (contents.payload[t] ?? []).length);
                  return (
                    <label key={scope.key} className="checkbox">
                      <input type="checkbox" checked={scopes.includes(scope.key)} disabled={!available}
                             onChange={() => setScopes((list) => (
                               list.includes(scope.key)
                                 ? list.filter((s) => s !== scope.key)
                                 : [...list, scope.key]))} />
                      <span className="cell-main">
                        <strong>{scope.label}</strong>
                        <small>
                          {available
                            ? `${scope.hint} · ${scope.tables.reduce(
                                (s, t) => s + (contents.payload[t] ?? []).length, 0)} registros`
                            : 'No viene en esta copia'}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setScopes(RESTORE_SCOPES
                  .filter((s) => s.tables.some((t) => (contents.payload[t] ?? []).length))
                  .map((s) => s.key))}>Todo</button>
                <button className="btn btn-sm" onClick={() => setScopes([])}>Nada</button>
              </div>
            </div>

            <div>
              <button className="btn btn-primary" onClick={() => setConfirming(true)}
                      disabled={busy || !scopes.length}>
                <Database />Restaurar lo marcado
              </button>
            </div>
          </div>
        )}
      </Panel>

      {confirming && contents && (
        <Modal
          title="Confirmar la restauración"
          onClose={() => setConfirming(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={doRestore} disabled={busy}>
              <Database />{busy ? 'Restaurando…' : 'Sí, restaurar'}
            </button>
          </>}
        >
          <div className="stack">
            <Alert kind="danger">
              <strong>⚠️ Esta operación puede modificar información actual.</strong>
            </Alert>
            <p style={{ margin: 0 }}>
              Se van a volcar los datos de <strong>{fileName}</strong> en estos apartados:
            </p>
            <ul className="stack" style={{ margin: 0, paddingLeft: 20, gap: 4 }}>
              {scopes.map((key) => {
                const scope = RESTORE_SCOPES.find((s) => s.key === key);
                const n = scope?.tables.reduce((s, t) => s + (contents.payload[t] ?? []).length, 0) ?? 0;
                return <li key={key}><strong>{scope?.label}</strong> · {fmtNumber(n)} registros</li>;
              })}
            </ul>
            <p className="hint" style={{ margin: 0 }}>
              Se tocarán {tablesForScopes(scopes).length} tablas de la base de datos.
              Todo quedará registrado en el historial.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// ALMACENAMIENTO
// ---------------------------------------------------------------------
function StorageTab({ settings, maxFileMb, onSaved }: {
  settings: AppSettings; maxFileMb: number; onSaved: () => void;
}) {
  const { toast } = useDialogs();
  const usage = useAsync(() => storageUsage(), []);
  const resumen = useAsync(() => storageSummary(), []);
  const [mb, setMb] = useState(String(maxFileMb));
  // La capacidad contratada. Se escribe a mano porque NO se puede
  // consultar: el límite del plan vive en la facturación de Supabase.
  const [quotaFiles, setQuotaFiles] = useState(
    settings.storage_quota_mb != null ? String(settings.storage_quota_mb) : '');
  const [quotaDb, setQuotaDb] = useState(
    settings.db_quota_mb != null ? String(settings.db_quota_mb) : '');
  const [quotaNota, setQuotaNota] = useState(settings.quota_note ?? '');
  const [busy, setBusy] = useState(false);

  const rows = usage.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.bytes), 0);
  const trash = rows.reduce((s, r) => s + Number(r.bytes_papelera), 0);
  const barras = resumen.data ?? [];
  const sinDeclarar = barras.length > 0 && barras.every((b) => b.cuota_bytes == null);

  async function save() {
    setBusy(true);
    try {
      await setMaxFileMb(Number(mb));
      toast.success('Tamaño máximo guardado');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  /** Guardar la capacidad declarada. En blanco la retira. */
  async function guardarCuota() {
    const num = (x: string) => {
      const v = x.trim();
      if (!v) return null;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : NaN;
    };
    const f = num(quotaFiles);
    const d = num(quotaDb);
    if (Number.isNaN(f) || Number.isNaN(d)) {
      toast.error(new Aviso('Escribe la capacidad en MB, con un número mayor que cero. '
        + 'Si no la sabes, déjala en blanco.'));
      return;
    }
    setBusy(true);
    try {
      await saveStorageQuota(f, d, quotaNota.trim() || null);
      toast.success(f == null && d == null
        ? 'Capacidad retirada' : 'Capacidad declarada');
      await resumen.reload();
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <Panel title={<span className="row" style={{ gap: 7 }}><HardDrive size={17} />Almacenamiento</span>}>
      <div className="figure-row" style={{ marginBottom: 16 }}>
        <span className="figure"><b>{fmtBytes(total)}</b><span>Ocupado</span></span>
        <span className="figure"><b>{fmtBytes(trash)}</b><span>En la papelera</span></span>
        <span className="figure">
          <b>{fmtNumber(rows.reduce((s, r) => s + Number(r.archivos), 0))}</b>
          <span>Archivos</span>
        </span>
      </div>

      {/* ----------------------------------------- CUÁNTO CABE
          Los archivos, la base de datos y las copias van SEPARADOS: cada
          uno tiene su capacidad y las copias ni siquiera ocupan en
          Supabase (están en Drive). Una sola barra con todo sumado daría
          un porcentaje falso.

          Mientras no se declare la capacidad NO se pinta ninguna barra:
          un porcentaje sobre una cifra inventada no mide nada. */}
      {resumen.loading && !resumen.data ? <Loading /> : (
        <>
          {sinDeclarar && (
            <Alert kind="info">
              <strong>Falta decir cuánto espacio hay contratado.</strong>
              <div style={{ marginTop: 2 }}>
                El límite del plan no se puede consultar desde aquí: está en la facturación de
                Supabase. Míralo en el panel de Supabase, en «Settings → Usage», y escríbelo
                abajo. Hasta entonces se ve lo que ocupa, pero no cuánto queda.
              </div>
            </Alert>
          )}

          <div className="bar-list" style={{ margin: '14px 0' }}>
            {barras.map((b) => (
              <div key={b.concepto} className="bar-row" title={b.detalle}>
                <span className="bar-label">{b.concepto}</span>
                <span className="bar-track">
                  <span className={`bar-fill ${b.nivel ?? ''}`}
                        style={{ width: `${Math.min(b.porcentaje ?? 0, 100)}%` }} />
                </span>
                <span className="bar-value">
                  {b.porcentaje != null ? `${fmtNumber(b.porcentaje)} %` : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th><th className="right">Ocupa</th>
                  <th className="right">Cabe</th><th className="right">Queda</th>
                  <th>Qué es</th>
                </tr>
              </thead>
              <tbody>
                {barras.map((b) => (
                  <tr key={b.concepto}>
                    <td>
                      {b.concepto}
                      {!b.medido && <span className="faint"> · no se ha podido medir</span>}
                    </td>
                    <td className="right num">
                      {b.usado_bytes != null ? fmtBytes(Number(b.usado_bytes)) : '—'}
                    </td>
                    <td className="right num">
                      {b.cuota_bytes != null
                        ? fmtBytes(Number(b.cuota_bytes))
                        : <span className="faint">sin declarar</span>}
                    </td>
                    <td className="right num">
                      {b.libre_bytes != null ? fmtBytes(Number(b.libre_bytes)) : '—'}
                    </td>
                    <td className="faint">{b.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {barras.some((b) => b.nivel === 'critico') && (
            <Alert kind="danger">
              <strong>Queda menos del 10 % de espacio.</strong>
              <div style={{ marginTop: 2 }}>
                Vacía la papelera para recuperar lo más fácil y, si no basta, habla con
                quien lleva la cuenta de Supabase antes de que deje de entrar nada.
              </div>
            </Alert>
          )}
          {!barras.some((b) => b.nivel === 'critico')
            && barras.some((b) => b.nivel === 'atencion') && (
            <Alert kind="warn">
              <strong>Se ha pasado del 70 % del espacio.</strong>
              <div style={{ marginTop: 2 }}>
                Todavía no es urgente. Vaciar la papelera es lo que más recupera.
              </div>
            </Alert>
          )}
        </>
      )}

      {usage.loading && !usage.data ? <Loading />
        : !rows.length ? <Empty title="Todavía no se ha subido ningún archivo" />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th><th className="right">Archivos</th><th className="right">Ocupan</th>
                  <th className="right">En la papelera</th><th className="right">Ocupan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tipo}>
                    <td>{r.tipo}</td>
                    <td className="right num">{fmtNumber(r.archivos)}</td>
                    <td className="right num">{fmtBytes(Number(r.bytes))}</td>
                    <td className="right num">{fmtNumber(r.en_papelera)}</td>
                    <td className="right num">{fmtBytes(Number(r.bytes_papelera))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label="Tamaño máximo por archivo (MB)" htmlFor="st-mb"
               hint="Entre 1 y 100. Afecta a fotografías, vídeos y documentos.">
          <input id="st-mb" className="input" inputMode="numeric" value={mb}
                 onChange={(e) => setMb(e.target.value)} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button id="st-guardar-mb" className="btn" onClick={save} disabled={busy}>
          <Save />Guardar
        </button>
      </div>

      {/* --------------------------------- LA CAPACIDAD CONTRATADA
          Se escribe a mano y se dice que es un dato declarado, porque
          NO se puede consultar: el límite del plan está en la
          facturación de Supabase, no en la base de datos. Antes que
          inventarse una cifra y pintar una barra que no mide nada,
          mejor preguntarla una vez y fechar la respuesta. */}
      <div className="form-grid" style={{ marginTop: 20 }}>
        <Field label="Capacidad de los archivos (MB)" htmlFor="st-qf"
               hint="Lo que pone tu plan de Supabase. En blanco si no lo sabes.">
          <input id="st-qf" className="input" inputMode="numeric" value={quotaFiles}
                 placeholder="sin declarar"
                 onChange={(e) => setQuotaFiles(e.target.value)} />
        </Field>
        <Field label="Capacidad de la base de datos (MB)" htmlFor="st-qd"
               hint="También del plan. En blanco si no lo sabes.">
          <input id="st-qd" className="input" inputMode="numeric" value={quotaDb}
                 placeholder="sin declarar"
                 onChange={(e) => setQuotaDb(e.target.value)} />
        </Field>
        <Field label="De dónde sale este dato" htmlFor="st-qn" span
               hint="El plan contratado, quién lo miró, lo que haga falta recordar dentro de un año.">
          <input id="st-qn" className="input" value={quotaNota}
                 placeholder="Plan Pro, comprobado en Settings → Usage"
                 onChange={(e) => setQuotaNota(e.target.value)} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button id="st-guardar-cuota" className="btn" onClick={guardarCuota} disabled={busy}>
          <Save />Guardar la capacidad
        </button>
      </div>
      <p className="hint">
        <strong>Es un dato declarado a mano</strong>, no medido: la aplicación no puede
        preguntarle a Supabase cuánto espacio tiene contratado.
        {settings.quota_checked_on
          ? ` Comprobado el ${fmtDate(settings.quota_checked_on)}.`
          : ' Todavía no se ha comprobado ninguna vez.'}
        {' '}Si cambias de plan, vuelve a escribirlo aquí.
      </p>

      <p className="hint" style={{ marginBottom: 0 }}>
        Los archivos viven en el contenedor privado de Supabase. Lo que se envía a la papelera
        deja de verse en la aplicación pero sigue ocupando hasta que se elimina del todo.
        Las copias de seguridad se suben a Google Drive, así que ocupan allí y no en Supabase.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// PLANIFICACIÓN
// ---------------------------------------------------------------------
function PlanningTab({ settings, onSaved }: { settings: AppSettings; onSaved: () => void }) {
  const { toast } = useDialogs();
  const [gap, setGap] = useState(String(settings.gap_days ?? 1).replace('.', ','));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await setGapDays(Number(gap.replace(',', '.')));
      toast.success('Margen guardado');
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  return (
    <Panel title={<span className="row" style={{ gap: 7 }}><CalendarRange size={17} />Planificación</span>}>
      <div className="form-grid">
        <Field
          label="Margen entre proyectos (días laborables)"
          htmlFor="st-gap"
          hint="Días laborables LIBRES que se dejan entre un proyecto y el siguiente."
        >
          <input id="st-gap" className="input" inputMode="decimal" value={gap}
                 onChange={(e) => setGap(e.target.value)} />
        </Field>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={save} disabled={busy}><Save />Guardar</button>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <thead><tr><th>Si pones</th><th>El siguiente proyecto empieza</th></tr></thead>
          <tbody>
            <tr><td className="num">0</td><td>El día laborable siguiente, sin dejar ninguno libre</td></tr>
            <tr><td className="num">0,5</td><td>Igual que 0: medio día libre no existe planificando por días enteros</td></tr>
            <tr><td className="num">1</td><td>Dejando 1 día laborable libre (acaba lunes → empieza miércoles)</td></tr>
            <tr><td className="num">2</td><td>Dejando 2 días laborables libres</td></tr>
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        El margen vale <strong>de aquí en adelante</strong>: lo que ya esté colocado en el
        calendario no se mueve. La planificación automática nunca solapa dos proyectos;
        si hace falta solapar, se hace a mano desde el calendario y entonces manda eso.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// APLICACIÓN (PWA)
// ---------------------------------------------------------------------
/**
 * APLICACIÓN (PWA).
 *
 * AQUÍ ESTABAN LOS DATOS DE EJEMPLO.
 *
 * Se retiran porque la aplicación ya está en uso con datos reales, y un
 * botón que siembra un taller inventado en la base de datos de verdad es
 * un accidente esperando a pasar.
 *
 * Lo que NO se ha tocado: las columnas «is_demo» de las tablas. Siguen
 * ahí, con su valor, porque son el único sitio donde queda constancia de
 * qué se creó como ejemplo. Borrarlas impediría distinguirlo para
 * siempre, y eso no se arregla luego.
 *
 * Las funciones del servidor —«seed_demo», «clear_demo» y
 * «demo_status»— se retiran en «50_retirar_demo.sql», que está PENDIENTE
 * DE APROBACIÓN y no se ejecuta solo. Mientras no se ejecute, siguen
 * existiendo en la base de datos y se pueden llamar desde Supabase si
 * hiciera falta limpiar algo; lo que ya no hay es un botón para
 * llamarlas sin querer.
 */
function AppTab() {
  const { canInstall, installed, isApple, install } = useInstallPrompt();
  const { toast } = useDialogs();

  return (
    <>
      <Panel title={<span className="row" style={{ gap: 7 }}><Smartphone size={17} />Instalar la aplicación</span>}>
        {installed ? (
          <Alert kind="ok">Ya está instalada en este dispositivo.</Alert>
        ) : canInstall ? (
          <>
            <p style={{ marginTop: 0 }}>
              Puedes instalarla como una aplicación más: se abre a pantalla completa y
              aparece con su icono junto a las demás.
            </p>
            <button className="btn btn-primary" onClick={async () => {
              const ok = await install();
              if (ok) toast.success('Aplicación instalada');
            }}>
              <Smartphone />Instalar METALPLAFER360
            </button>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>Para tenerla como una aplicación más:</p>
            <ul className="stack" style={{ paddingLeft: 20, gap: 6, margin: 0 }}>
              <li><strong>Android:</strong> menú del navegador (⋮) → «Añadir a pantalla de inicio».</li>
              <li><strong>iPhone o iPad:</strong> botón Compartir → «Añadir a pantalla de inicio».</li>
              <li><strong>Ordenador:</strong> el icono de instalar que aparece en la barra de direcciones.</li>
            </ul>
            {isApple && (
              <p className="hint" style={{ marginBottom: 0 }}>
                En iPhone hay que hacerlo desde Safari; otros navegadores no lo permiten.
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel title={<span className="row" style={{ gap: 7 }}><TriangleAlert size={17} />La aplicación necesita Internet</span>}>
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          METALPLAFER360 <strong>no funciona sin conexión</strong>, y es a propósito: en una obra
          es peor trabajar con datos viejos que no poder entrar. Instalada solo se guardan los
          archivos del programa (pantallas, iconos y tipografías), nunca los datos de la empresa.
          Cuando no hay cobertura, la aplicación lo avisa arriba en rojo.
        </p>
      </Panel>
    </>
  );
}
