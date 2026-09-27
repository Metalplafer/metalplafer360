import { useLocation } from 'react-router-dom';
import { WORKER_NAV } from '@/config/navigation';
import { PendingModule } from '@/components/ui/PendingModule';

/** Muestra la pantalla «en preparación» de la sección del trabajador. */
export default function WorkerModulePage() {
  const { pathname } = useLocation();
  const item = WORKER_NAV.find((n) => pathname.startsWith(n.path) && n.pending);
  if (!item?.pending) return null;
  return <PendingModule title={item.label} intro={item.pending.intro} points={item.pending.points} backTo="/t" />;
}
