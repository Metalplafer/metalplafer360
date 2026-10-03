import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { isConfigured } from '@/config/env';
import { toUserMessage } from '@/lib/errors';
import { Alert } from '@/components/ui/Feedback';
import { AppIcon, Logo } from '@/components/ui/Brand';

/** Acceso real contra Supabase Auth. La sesión queda iniciada. */
export function LoginPage() {
  const { session, profile, signIn, authError } = useAuth();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session && profile) {
    const target = profile.role === 'admin' ? '/admin' : '/t';
    const from = location.state?.from;
    const back = from && from.startsWith(target) ? from : target;
    return <Navigate to={back} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Introduce tu usuario y tu contraseña.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <Logo variant="blanco" height={26} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <AppIcon size={64} />
          <h1 style={{ marginTop: 18 }}>METALPLAFER<br />360</h1>
          <p>Fichas, proyectos, órdenes de trabajo y material del taller, en un único lugar.</p>
        </div>
        <small style={{ color: '#7F8FA3', position: 'relative', zIndex: 1 }}>
          Uso interno · Metalplafer · Sabadell
        </small>
      </section>

      <section className="login-form">
        <form className="login-card stack" onSubmit={submit} noValidate>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>Iniciar sesión</h2>
            <p className="muted">Usa el usuario y la contraseña que te ha dado administración.</p>
          </div>

          {!isConfigured && (
            <Alert kind="warn">
              La aplicación todavía no está configurada. Avisa a administración:
              faltan los datos de conexión, y están explicados en la guía de puesta en marcha.
            </Alert>
          )}
          {(error ?? authError) && <Alert kind="danger">{error ?? authError}</Alert>}

          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input id="username" className="input" style={{ minHeight: 48 }}
                   autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                   value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input id="password" className="input" style={{ minHeight: 48, paddingRight: 48 }}
                     type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn btn-ghost icon-btn"
                      style={{ position: 'absolute', right: 4, top: 5 }}
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !isConfigured}>
            <LogIn />{busy ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="hint faint" style={{ textAlign: 'center' }}>
            ¿Has olvidado la contraseña? Pide a administración que te la restablezca.
          </p>
        </form>
      </section>
    </div>
  );
}
