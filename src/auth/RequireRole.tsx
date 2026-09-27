import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loading } from '@/components/ui/Feedback';
import type { UserRole } from '@/types/db';

/**
 * Controla la NAVEGACIÓN según el rol.
 *
 * Importante: esto es comodidad de interfaz, no la seguridad del sistema.
 * La seguridad real está en la base de datos (RLS): aunque alguien escriba
 * a mano la dirección /admin, la API no le devolverá ningún dato que no le
 * corresponda.
 */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading full />;
  if (!session || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (profile.role !== role) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/t'} replace />;
  }
  return <>{children}</>;
}
