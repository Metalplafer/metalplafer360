import { useLocation } from 'react-router-dom';
import { ADMIN_NAV } from '@/config/navigation';
import { PendingModule } from '@/components/ui/PendingModule';

/** Muestra la pantalla «en preparación» del módulo administrativo activo. */
export default function ModulePage() {
  const { pathname } = useLocation();
  const item = ADMIN_NAV.find((n) => pathname.startsWith(n.path) && n.pending);
  if (!item?.pending) return null;
  return <PendingModule title={item.label} intro={item.pending.intro} points={item.pending.points} backTo="/admin" />;
}
