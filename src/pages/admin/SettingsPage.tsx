import { useRef, useState } from 'react';
import {
  Building2, CloudUpload, Database, Download, FlaskConical, HardDrive, Hash, Save,
  Smartphone, Trash2, TriangleAlert, Upload,
} from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, PageHeader, Panel, Tabs } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  backupToDrive, generateBackup, listBackups, readBackupFile, restoreBackup,
} from '@/services/backup';
import {
  getSettings, listCounters, setBackupSettings, setCompany, setCounter,
  setMaxFileMb, storageUsage,
} from '@/services/settings';
import { clearDemo, demoStatus, seedDemo } from '@/services/demo';
import { RESTORE_SCOPES, tablesForScopes, type BackupContents } from '@/lib/export/backup';
import { MIME, downloadBytes } from '@/lib/download';
import { fmtBytes, fmtDateTime, fmtNumber } from '@/lib/format';

type Tab = 'empresa' | 'numeracion' | 'copias' | 'almacenamiento' | 'preferencias';

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
              {tab === 'almacenamiento' && (
                <StorageTab maxFileMb={maxFileMb} onSaved={reload} />
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
  const { toast } = useDialogs();
  const [reloadKey, setReloadKey] = useState(0);
  const backups = useAsync(() => listBackups(20), [reloadKey]);

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
          <button className="btn" onClick={sendToDrive} disabled={busy}>
            <CloudUpload />Subir a Google Drive
          </button>
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
          <Field label="Carpeta de Google Drive" htmlFor="bk-folder">
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
function StorageTab({ maxFileMb, onSaved }: { maxFileMb: number; onSaved: () => void }) {
  const { toast } = useDialogs();
  const usage = useAsync(() => storageUsage(), []);
  const [mb, setMb] = useState(String(maxFileMb));
  const [busy, setBusy] = useState(false);

  const rows = usage.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.bytes), 0);
  const trash = rows.reduce((s, r) => s + Number(r.bytes_papelera), 0);

  async function save() {
    setBusy(true);
    try {
      await setMaxFileMb(Number(mb));
      toast.success('Tamaño máximo guardado');
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
        <button className="btn" onClick={save} disabled={busy}><Save />Guardar</button>
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        Los archivos viven en el contenedor privado de Supabase. Lo que se envía a la papelera
        deja de verse en la aplicación pero sigue ocupando hasta que se elimina del todo.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// APLICACIÓN (PWA)
// ---------------------------------------------------------------------
function AppTab() {
  const { canInstall, installed, isApple, install } = useInstallPrompt();
  const { confirm, toast } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const demo = useAsync(() => demoStatus(), [reloadKey]);
  const d = demo.data;

  async function poner() {
    setBusy(true);
    try {
      const r = await seedDemo();
      toast.success(`Datos de ejemplo puestos: ${r.clientes} clientes, `
        + `${r.proyectos} proyectos y ${r.ordenes} órdenes`);
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

  async function limpiar() {
    const ok = await confirm({
      title: 'Limpiar los datos de ejemplo',
      message: <>
        Se borrará <strong>únicamente</strong> lo que se creó como ejemplo: los
        {' '}{d?.clientes ?? 0} clientes, {d?.proyectos ?? 0} proyectos,
        {' '}{d?.ordenes ?? 0} órdenes y {d?.trabajadores ?? 0} trabajadores de prueba.
        <div style={{ marginTop: 6 }}>
          Lo que hayáis creado vosotros <strong>no se toca</strong>.
        </div>
      </>,
      confirmLabel: 'Limpiar el ejemplo',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await clearDemo();
      toast.success(`Datos de ejemplo limpiados (${fmtNumber(r.total)} registros)`);
      setReloadKey((n) => n + 1);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  }

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

      <Panel title={<span className="row" style={{ gap: 7 }}><FlaskConical size={17} />Datos de ejemplo</span>}>
        <p style={{ marginTop: 0 }}>
          Un taller inventado con 10 clientes, 15 fichas, 8 proyectos, 6 trabajadores,
          20 órdenes, material y documentos, para aprender a usar la aplicación o
          enseñarla sin tocar nada de verdad.
        </p>

        {demo.loading && !d ? <Loading />
          : d?.hay_datos ? (
            <>
              <Alert kind="warn">
                Ahora mismo hay datos de ejemplo mezclados con los vuestros.
                Cuando empecéis a trabajar en serio, límpialos.
              </Alert>
              <div className="figure-row" style={{ marginTop: 12 }}>
                <span className="figure"><b>{fmtNumber(d.clientes)}</b><span>Clientes</span></span>
                <span className="figure"><b>{fmtNumber(d.fichas)}</b><span>Fichas</span></span>
                <span className="figure"><b>{fmtNumber(d.proyectos)}</b><span>Proyectos</span></span>
                <span className="figure"><b>{fmtNumber(d.ordenes)}</b><span>Órdenes</span></span>
                <span className="figure"><b>{fmtNumber(d.trabajadores)}</b><span>Trabajadores</span></span>
                <span className="figure"><b>{fmtNumber(d.materiales)}</b><span>Materiales</span></span>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-danger" onClick={limpiar} disabled={busy}>
                  <Trash2 />{busy ? 'Limpiando…' : 'Limpiar datos demo'}
                </button>
              </div>
            </>
          ) : (
            <div className="row">
              <button className="btn btn-primary" onClick={poner} disabled={busy}>
                <FlaskConical />{busy ? 'Poniendo…' : 'Poner datos de ejemplo'}
              </button>
            </div>
          )}

        <p className="hint" style={{ marginBottom: 0 }}>
          Los trabajadores de ejemplo se llaman <code>demo.jordi</code>, <code>demo.marc</code>…
          y nacen sin contraseña. Si quieres entrar como uno para ver el móvil, pónsela
          en Trabajadores. Los documentos del ejemplo son solo la ficha del archivo:
          aparecen en los listados, pero no hay nada que descargar.
        </p>
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
