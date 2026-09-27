import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { RequireRole } from '@/auth/RequireRole';
import { Loading } from '@/components/ui/Feedback';
import { DialogsProvider } from '@/components/ui/Dialogs';
import { AdminLayout } from '@/layouts/AdminLayout';
import { WorkerLayout } from '@/layouts/WorkerLayout';
import { LoginPage } from '@/pages/LoginPage';
import { ADMIN_NAV, WORKER_NAV } from '@/config/navigation';

const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const ClientsList = lazy(() => import('@/pages/admin/ClientsList'));
const ClientDetail = lazy(() => import('@/pages/admin/ClientDetail'));
const FichasList = lazy(() => import('@/pages/admin/FichasList'));
const FichaForm = lazy(() => import('@/pages/admin/FichaForm'));
const FichaDetail = lazy(() => import('@/pages/admin/FichaDetail'));
const ProjectsList = lazy(() => import('@/pages/admin/ProjectsList'));
const ProjectForm = lazy(() => import('@/pages/admin/ProjectForm'));
const ProjectDetail = lazy(() => import('@/pages/admin/ProjectDetail'));
const OrdersList = lazy(() => import('@/pages/admin/OrdersList'));
const OrderForm = lazy(() => import('@/pages/admin/OrderForm'));
const OrderDetail = lazy(() => import('@/pages/admin/OrderDetail'));
const MaterialsList = lazy(() => import('@/pages/admin/MaterialsList'));
const CalendarPage = lazy(() => import('@/pages/admin/CalendarPage'));
const BillingPage = lazy(() => import('@/pages/admin/BillingPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'));
const WorkersPage = lazy(() => import('@/pages/admin/WorkersPage'));
const AdminModule = lazy(() => import('@/pages/admin/ModulePage'));
const WorkerHome = lazy(() => import('@/pages/worker/Home'));
const WorkerOrders = lazy(() => import('@/pages/worker/MyOrders'));
const WorkerOrderDetail = lazy(() => import('@/pages/worker/OrderDetail'));
const WorkerHistory = lazy(() => import('@/pages/worker/History'));
const WorkerModule = lazy(() => import('@/pages/worker/ModulePage'));
const Profile = lazy(() => import('@/pages/worker/Profile'));

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

/** Envía a cada persona a su zona según el rol guardado en la base de datos. */
function RootRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading full />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/t'} replace />;
}

/**
 * Se usa HashRouter porque la aplicación se publica en GitHub Pages, que
 * sirve archivos estáticos: así funcionan los enlaces directos y el
 * botón de recargar sin configuración adicional en el servidor.
 */
export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <DialogsProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* ---------- ADMINISTRACIÓN ---------- */}
          <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
            <Route index element={<Lazy><Dashboard /></Lazy>} />

            <Route path="clientes" element={<Lazy><ClientsList /></Lazy>} />
            <Route path="clientes/:id" element={<Lazy><ClientDetail /></Lazy>} />

            <Route path="fichas" element={<Lazy><FichasList /></Lazy>} />
            <Route path="fichas/nueva" element={<Lazy><FichaForm /></Lazy>} />
            <Route path="fichas/:id" element={<Lazy><FichaDetail /></Lazy>} />
            <Route path="fichas/:id/editar" element={<Lazy><FichaForm /></Lazy>} />

            <Route path="proyectos" element={<Lazy><ProjectsList /></Lazy>} />
            <Route path="proyectos/nuevo" element={<Lazy><ProjectForm /></Lazy>} />
            <Route path="proyectos/:id" element={<Lazy><ProjectDetail /></Lazy>} />
            <Route path="proyectos/:id/editar" element={<Lazy><ProjectForm /></Lazy>} />

            <Route path="ordenes" element={<Lazy><OrdersList /></Lazy>} />
            <Route path="ordenes/nueva" element={<Lazy><OrderForm /></Lazy>} />
            <Route path="ordenes/:id" element={<Lazy><OrderDetail /></Lazy>} />
            <Route path="ordenes/:id/editar" element={<Lazy><OrderForm /></Lazy>} />

            <Route path="material" element={<Lazy><MaterialsList /></Lazy>} />
            <Route path="calendario" element={<Lazy><CalendarPage /></Lazy>} />
            <Route path="facturacion" element={<Lazy><BillingPage /></Lazy>} />

            <Route path="informes" element={<Lazy><ReportsPage /></Lazy>} />
            <Route path="trabajadores" element={<Lazy><WorkersPage /></Lazy>} />
            <Route path="configuracion" element={<Lazy><SettingsPage /></Lazy>} />

            <Route path="avisos" element={<Lazy><FichasList fixedType="aviso" /></Lazy>} />

            {ADMIN_NAV.filter((n) => n.pending).map((n) => (
              <Route key={n.path} path={`${n.path.replace('/admin/', '')}/*`} element={<Lazy><AdminModule /></Lazy>} />
            ))}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>

          {/* ---------- TRABAJADOR ---------- */}
          <Route path="/t" element={<RequireRole role="worker"><WorkerLayout /></RequireRole>}>
            <Route index element={<Lazy><WorkerHome /></Lazy>} />
            <Route path="ordenes" element={<Lazy><WorkerOrders /></Lazy>} />
            <Route path="ordenes/:id" element={<Lazy><WorkerOrderDetail /></Lazy>} />
            <Route path="historial" element={<Lazy><WorkerHistory /></Lazy>} />
            <Route path="calendario" element={<Lazy><CalendarPage worker /></Lazy>} />
            {WORKER_NAV.filter((n) => n.pending).map((n) => (
              <Route key={n.path} path={`${n.path.replace('/t/', '')}/*`} element={<Lazy><WorkerModule /></Lazy>} />
            ))}
            <Route path="perfil" element={<Lazy><Profile /></Lazy>} />
            <Route path="*" element={<Navigate to="/t" replace />} />
          </Route>

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </DialogsProvider>
      </AuthProvider>
    </HashRouter>
  );
}
