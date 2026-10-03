import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, WifiOff, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useOnline } from '@/hooks/useOnline';
import { ADMIN_NAV } from '@/config/navigation';
import { AppMark } from '@/components/ui/Brand';
import { NotificationsBell } from '@/components/ui/NotificationsBell';

/** Estructura de la zona de administración: pensada para ordenador y tablet. */
export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  const current = ADMIN_NAV.find((n) => (n.end ? n.path === location.pathname : location.pathname.startsWith(n.path)));

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Menú principal">
        <div className="sidebar-brand row-between">
          <AppMark onDark height={46} icon={38} />
          <button className="btn btn-ghost icon-btn menu-toggle" style={{ color: '#C9D3DF', flex: 'none' }}
                  onClick={() => setMenuOpen(false)} aria-label="Cerrar menú">
            <X />
          </button>
        </div>

        <nav>
          {ADMIN_NAV.map((item, i) => (
            <span key={item.path} style={{ display: 'contents' }}>
              {(i === 5 || i === 8 || i === 11) && <span className="sep" aria-hidden />}
              <NavLink to={item.path} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <item.icon aria-hidden />
                {item.label}
                {item.pending && <span className="soon">PRÓX.</span>}
              </NavLink>
            </span>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{profile?.full_name}</div>
          <div style={{ marginBottom: 10 }}>Administración</div>
          <button className="btn btn-sm"
                  style={{ background: 'transparent', color: '#C9D3DF', borderColor: 'rgba(255,255,255,.2)' }}
                  onClick={signOut}>
            <LogOut size={15} />Cerrar sesión
          </button>
        </div>
      </aside>

      {menuOpen && <div className="modal-backdrop" style={{ zIndex: 80 }} onClick={() => setMenuOpen(false)} aria-hidden />}

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Menu />
          </button>
          <span className="title">{current?.label ?? 'METALPLAFER360'}</span>
          <div className="row" style={{ marginLeft: 'auto', flexWrap: 'nowrap' }}>
            {!online && <span className="badge tone-red"><WifiOff size={14} aria-hidden />Sin conexión</span>}
            <NotificationsBell />
          </div>
        </header>

        <main className="content" id="contenido"><Outlet /></main>
      </div>
    </div>
  );
}
