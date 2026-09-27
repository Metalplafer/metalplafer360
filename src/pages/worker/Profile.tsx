import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { Alert } from '@/components/ui/Feedback';
import { fmtDate } from '@/lib/format';

/** Perfil del trabajador: sus datos y cambio de contraseña. */
export default function Profile() {
  const { profile, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) {
      setMsg({ kind: 'danger', text: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (password !== repeat) {
      setMsg({ kind: 'danger', text: 'Las dos contraseñas no coinciden.' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setRepeat('');
      setMsg({ kind: 'ok', text: 'Contraseña actualizada correctamente.' });
    } catch (err) {
      setMsg({ kind: 'danger', text: toUserMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="w-greeting"><h1>Mi perfil</h1></div>

      <div className="w-block">
        <h3><UserRound aria-hidden />Mis datos</h3>
        <dl className="kv">
          <dt>Nombre</dt><dd>{profile?.full_name}</dd>
          <dt>Usuario</dt><dd>{profile?.username ?? '—'}</dd>
          <dt>Teléfono</dt><dd>{profile?.phone ?? '—'}</dd>
          <dt>Perfil</dt><dd>{profile?.role === 'admin' ? 'Administración' : 'Trabajador'}</dd>
          <dt>Alta</dt><dd>{fmtDate(profile?.created_at)}</dd>
        </dl>
        <p className="hint faint" style={{ marginTop: 10, marginBottom: 0 }}>
          Si algún dato no es correcto, díselo a administración.
        </p>
      </div>

      <form className="w-block" onSubmit={changePassword}>
        <h3><KeyRound aria-hidden />Cambiar mi contraseña</h3>
        <div className="stack">
          {msg && <Alert kind={msg.kind === 'ok' ? 'ok' : 'danger'}>{msg.text}</Alert>}
          <div className="field">
            <label htmlFor="new-password">Nueva contraseña</label>
            <input id="new-password" className="input" style={{ minHeight: 48 }} type="password"
                   autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">Mínimo 8 caracteres.</span>
          </div>
          <div className="field">
            <label htmlFor="repeat-password">Repite la contraseña</label>
            <input id="repeat-password" className="input" style={{ minHeight: 48 }} type="password"
                   autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </div>
      </form>

      <button className="btn btn-lg btn-block" onClick={signOut}><LogOut aria-hidden />Cerrar sesión</button>
    </>
  );
}
