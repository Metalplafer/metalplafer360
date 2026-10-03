import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';
import { WORKER_NAV } from '@/config/navigation';
import { AppMark } from '@/components/ui/Brand';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Estructura del trabajador: diseñada primero para el móvil.
 * Barra inferior fija, zonas táctiles grandes y contenido a una columna.
 */
export function WorkerLayout() {
  const online = useOnline();
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className="w-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header className="w-header">
        <AppMark height={32} />
        <span className="muted" style={{ fontSize: '.85rem' }}>{profile?.full_name}</span>
      </header>

      {!online && (
        <div className="alert alert-danger" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
          <WifiOff aria-hidden />
          Sin conexión. Los cambios no se guardarán hasta que vuelva Internet.
        </div>
      )}

      <main className="w-content" id="contenido"><Outlet /></main>

      <nav className="w-tabbar" aria-label="Navegación">
        {WORKER_NAV.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.end}
                   className={({ isActive }) => (isActive ? 'active' : '')}>
            <item.icon aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
