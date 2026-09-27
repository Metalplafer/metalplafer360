import { useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthProvider';
import { useDialogs } from '@/components/ui/Dialogs';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, PageHeader } from '@/components/ui/Layout';
import { Alert, Empty, ErrorBox, Loading } from '@/components/ui/Feedback';
import {
  createWorker, listAllPeople, renamePerson, resetPassword, setActive, setRole,
} from '@/services/settings';
import { fmtDate, fmtPhone } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import type { Profile } from '@/types/db';

/**
 * Trabajadores y accesos.
 *
 * Crear un usuario o cambiarle la contraseña necesita la clave de
 * servidor de Supabase, que NUNCA está en la aplicación: se le pide a una
 * función publicada en Supabase, que comprueba antes quién lo pide.
 */
export default function WorkersPage() {
  const { profile } = useAuth();
  const { toast, confirm } = useDialogs();

  const [reloadKey, setReloadKey] = useState(0);
  const people = useAsync(() => listAllPeople(), [reloadKey]);
  const reload = () => setReloadKey((n) => n + 1);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [password, setPassword] = useState<Profile | null>(null);

  async function toggleActive(person: Profile) {
    const ok = await confirm({
      title: person.active ? 'Desactivar el acceso' : 'Reactivar el acceso',
      message: person.active
        ? <>{person.full_name} dejará de poder entrar. No se borra nada de lo que ha hecho.</>
        : <>{person.full_name} volverá a poder entrar con su usuario de siempre.</>,
      confirmLabel: person.active ? 'Desactivar' : 'Reactivar',
      danger: person.active,
    });
    if (!ok) return;
    try {
      await setActive(person.id, !person.active);
      toast.success(person.active ? 'Acceso desactivado' : 'Acceso reactivado');
      reload();
    } catch (e) { toast.error(e); }
  }

  async function changeRole(person: Profile) {
    const next = person.role === 'admin' ? 'worker' : 'admin';
    const ok = await confirm({
      title: next === 'admin' ? 'Dar acceso de administración' : 'Dejar como trabajador',
      message: next === 'admin'
        ? <>{person.full_name} podrá ver y cambiar todo: clientes, proyectos, cobros y configuración.</>
        : <>{person.full_name} solo verá sus órdenes desde el móvil.</>,
      confirmLabel: 'Cambiar',
      danger: next === 'admin',
    });
    if (!ok) return;
    try {
      await setRole(person.id, next);
      toast.success('Rol cambiado');
      reload();
    } catch (e) { toast.error(e); }
  }

  const rows = people.data ?? [];

  return (
    <>
      <PageHeader
        title="Trabajadores"
        sub="Quién puede entrar en METALPLAFER360 y con qué permisos."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />Nuevo trabajador
          </button>
        }
      />

      <div className="stack" style={{ marginBottom: 16 }}>
        <Alert kind="info">
          Siempre tiene que quedar al menos un administrador activo: la base de datos
          no deja quitarse a uno mismo el último acceso.
        </Alert>
      </div>

      <section className="panel">
        <div className="panel-body tight">
          {people.loading && !people.data ? <Loading />
            : people.error ? <div style={{ padding: 16 }}><ErrorBox message={people.error} onRetry={people.reload} /></div>
            : !rows.length ? <Empty title="Todavía no hay nadie dado de alta" />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th><th>Usuario</th><th>Teléfono</th>
                      <th>Permisos</th><th>Estado</th><th>Alta</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((person) => (
                      <tr key={person.id}>
                        <td>
                          <span className="cell-main">
                            <strong>{person.full_name}</strong>
                            {person.id === profile?.id && <small>Eres tú</small>}
                          </span>
                        </td>
                        <td>{person.username ?? <span className="faint">—</span>}</td>
                        <td className="nowrap">{fmtPhone(person.phone)}</td>
                        <td>
                          <Badge tone={person.role === 'admin' ? 'violet' : 'blue'}>
                            {person.role === 'admin' ? 'Administración' : 'Trabajador'}
                          </Badge>
                        </td>
                        <td>
                          {person.active
                            ? <Badge tone="green">Activo</Badge>
                            : <Badge tone="steel">Desactivado</Badge>}
                        </td>
                        <td className="nowrap">{fmtDate(person.created_at)}</td>
                        <td className="right nowrap">
                          <button className="btn btn-ghost icon-btn" onClick={() => setEditing(person)}
                                  aria-label={`Editar ${person.full_name}`}><Pencil /></button>
                          <button className="btn btn-ghost icon-btn" onClick={() => setPassword(person)}
                                  aria-label={`Cambiar la contraseña de ${person.full_name}`}><KeyRound /></button>
                          <button className="btn btn-ghost icon-btn" onClick={() => changeRole(person)}
                                  aria-label={`Cambiar los permisos de ${person.full_name}`}><ShieldCheck /></button>
                          <button className="btn btn-ghost icon-btn" onClick={() => toggleActive(person)}
                                  aria-label={`${person.active ? 'Desactivar' : 'Reactivar'} a ${person.full_name}`}>
                            {person.active ? <UserX /> : <UserCheck />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>

      {creating && (
        <NewWorkerModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); toast.success('Trabajador dado de alta'); }}
        />
      )}

      {editing && (
        <EditPersonModal
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); toast.success('Datos guardados'); }}
        />
      )}

      {password && (
        <PasswordModal
          person={password}
          onClose={() => setPassword(null)}
          onSaved={() => { setPassword(null); toast.success('Contraseña cambiada'); }}
        />
      )}
    </>
  );
}

function NewWorkerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: '', username: '', password: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await createWorker(form);
      onSaved();
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title="Nuevo trabajador"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          <Plus />{busy ? 'Creando…' : 'Crear trabajador'}
        </button>
      </>}
    >
      <div className="stack">
        {error && <Alert kind="danger">{error}</Alert>}
        <div className="form-grid">
          <Field label="Nombre y apellidos" htmlFor="w-name" span>
            <input id="w-name" className="input" value={form.full_name}
                   placeholder="Juan Ortega" onChange={(e) => set({ full_name: e.target.value })} />
          </Field>
          <Field label="Usuario para entrar" htmlFor="w-user"
                 hint="Solo esto escribirá en el móvil: juan">
            <input id="w-user" className="input" value={form.username} autoComplete="off"
                   placeholder="juan" onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label="Teléfono" htmlFor="w-phone">
            <input id="w-phone" className="input" value={form.phone} inputMode="tel"
                   placeholder="600 111 222" onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Contraseña" htmlFor="w-pass" span
                 hint="Mínimo 8 caracteres. Se la das tú y él puede seguir usándola.">
            <input id="w-pass" className="input" type="text" value={form.password} autoComplete="new-password"
                   onChange={(e) => set({ password: e.target.value })} />
          </Field>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Nace como trabajador: solo verá sus órdenes desde el móvil. Los permisos
          de administración se dan después, desde el listado.
        </p>
      </div>
    </Modal>
  );
}

function EditPersonModal({ person, onClose, onSaved }: {
  person: Profile; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(person.full_name);
  const [phone, setPhone] = useState(person.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await renamePerson(person.id, name, phone.trim() || null);
      onSaved();
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Editar ${person.full_name}`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>Guardar</button>
      </>}
    >
      <div className="stack">
        {error && <Alert kind="danger">{error}</Alert>}
        <div className="form-grid">
          <Field label="Nombre y apellidos" htmlFor="e-name" span>
            <input id="e-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Teléfono" htmlFor="e-phone">
            <input id="e-phone" className="input" value={phone} inputMode="tel"
                   onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Usuario" htmlFor="e-user" hint="El nombre de usuario no se cambia.">
            <input id="e-user" className="input" value={person.username ?? ''} disabled />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ person, onClose, onSaved }: {
  person: Profile; onClose: () => void; onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await resetPassword(person.id, value);
      onSaved();
    } catch (e) { setError(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Contraseña de ${person.full_name}`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || value.length < 8}>
          <KeyRound />{busy ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </>}
    >
      <div className="stack">
        {error && <Alert kind="danger">{error}</Alert>}
        <p style={{ marginTop: 0 }}>
          Escribe la contraseña nueva y dísela en persona. La anterior deja de servir.
        </p>
        <Field label="Contraseña nueva" htmlFor="p-pass" hint="Mínimo 8 caracteres.">
          <input id="p-pass" className="input" type="text" value={value} autoComplete="new-password"
                 onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
