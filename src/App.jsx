import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Hub from './pages/Hub';
import Dashboard from './pages/Dashboard';
import Gastos from './pages/Gastos';
import Plan from './pages/Plan';
import Activos from './pages/Activos';
import ActivoDetalle from './pages/ActivoDetalle';
import Sucursales from './pages/Sucursales';
import SucursalDetalle from './pages/SucursalDetalle';
import Usuarios from './pages/Usuarios';
import Proveedores from './pages/Proveedores';
import FlotasLayout from './pages/flotas/FlotasLayout';
import Unidades from './pages/flotas/Unidades';
import UnidadDetalle from './pages/flotas/UnidadDetalle';
import UsuariosFlotas from './pages/flotas/UsuariosFlotas';
import Tickets from './pages/flotas/Tickets';
import { Cargando } from './components/ui';

function Rutas() {
  const { sesion, cargando } = useAuth();

  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!sesion) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Hub />} />

      <Route path="/mantenimiento" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="plan" element={<Plan />} />
        <Route path="activos" element={<Activos />} />
        <Route path="activos/:id" element={<ActivoDetalle />} />
        <Route path="sucursales" element={<Sucursales />} />
        <Route path="sucursales/:id" element={<SucursalDetalle />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="*" element={<Dashboard />} />
      </Route>

      <Route path="/flotas" element={<FlotasLayout />}>
        <Route index element={<Unidades />} />
        <Route path="unidades/:id" element={<UnidadDetalle />} />
        <Route path="usuarios" element={<UsuariosFlotas />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="*" element={<Unidades />} />
      </Route>

      <Route path="*" element={<Hub />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Rutas />
      </AuthProvider>
    </BrowserRouter>
  );
}
