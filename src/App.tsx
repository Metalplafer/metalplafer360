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
const WorksList = lazy(() => import('@/pages/admin/WorksList'));
const WorkForm = lazy(() => import('@/pages/admin/WorkForm'));
const WorkDetail = lazy(() => import('@/pages/admin/WorkDetail'));
const ProjectsList = lazy(() => import('@/pages/admin/ProjectsList'));
const ProjectForm = lazy(() => import('@/pages/admin/ProjectForm'));
const ProjectDetail = lazy(() => import('@/pages/admin/ProjectDetail'));
// FASE 4 · Aquí se cargaban las pantallas de las órdenes de trabajo de
// administración. Se retiran de las rutas; los archivos se quedan en el
// repositorio porque el lado del TRABAJADOR sigue usando su pantalla de
// órdenes para terminar lo que esté a medias.
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
const AdminReports = lazy(() => import('@/pages/admin/ReportsList'));
const AdminReportDetail = lazy(() => import('@/pages/admin/ReportDetail'));
const WorkerProjects = lazy(() => import('@/pages/worker/MyProjects'));
const WorkerAvisoDetail = lazy(() => import('@/pages/worker/AvisoDetail'));
const WorkerProjectDetail = lazy(() => import('@/pages/worker/ProjectDetail'));
const WorkerReports = lazy(() => import('@/pages/worker/MyReports'));
const WorkerReportDetail = lazy(() => import('@/pages/worker/ReportDetail'));
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

            <Route path="obras" element={<Lazy><WorksList /></Lazy>} />
            <Route path="obras/nueva" element={<Lazy><WorkForm /></Lazy>} />
            <Route path="obras/:id" element={<Lazy><WorkDetail /></Lazy>} />
            <Route path="obras/:id/editar" element={<Lazy><WorkForm /></Lazy>} />

            <Route path="proyectos" element={<Lazy><ProjectsList /></Lazy>} />
            <Route path="proyectos/nuevo" element={<Lazy><ProjectForm /></Lazy>} />
            <Route path="proyectos/:id" element={<Lazy><ProjectDetail /></Lazy>} />
            <Route path="proyectos/:id/editar" element={<Lazy><ProjectForm /></Lazy>} />

            <Route path="partes" element={<Lazy><AdminReports /></Lazy>} />
            <Route path="partes/:id" element={<Lazy><AdminReportDetail /></Lazy>} />

            {/* FASE 4 · Las rutas de las órdenes de trabajo de
                administración se retiran para que no quede un acceso
                suelto escribiendo la dirección a mano. Quien llegue con
                un enlace viejo cae en la pantalla de «no existe», que es
                lo correcto: esa sección ya no está.

                Lo que NO se toca es la base de datos. Las órdenes que
                existan siguen ahí y siguen viéndose como histórico en la
                ficha de su proyecto. Tampoco se toca el lado del
                trabajador, para que una orden que esté a medias se pueda
                terminar. */}

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
            <Route path="proyectos" element={<Lazy><WorkerProjects /></Lazy>} />
            <Route path="proyectos/:id" element={<Lazy><WorkerProjectDetail /></Lazy>} />
            {/* El AVISO DE CLIENTE asignado. El listado sigue viviendo en
                «/t/proyectos», que ahora es «Mis trabajos» y lleva las dos
                cosas; la dirección no se cambia para no romper enlaces ya
                guardados. */}
            <Route path="avisos/:id" element={<Lazy><WorkerAvisoDetail /></Lazy>} />
            <Route path="partes" element={<Lazy><WorkerReports /></Lazy>} />
            <Route path="partes/:id" element={<Lazy><WorkerReportDetail /></Lazy>} />
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
