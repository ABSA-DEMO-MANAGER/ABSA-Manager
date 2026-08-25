import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Gastos from './pages/Gastos';
import Plan from './pages/Plan';
import Activos from './pages/Activos';
import ActivoDetalle from './pages/ActivoDetalle';
import Sucursales from './pages/Sucursales';
import SucursalDetalle from './pages/SucursalDetalle';
import { Cargando } from './components/ui';

function Rutas() {
  const { sesion, cargando } = useAuth();

  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!sesion) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/activos" element={<Activos />} />
        <Route path="/activos/:id" element={<ActivoDetalle />} />
        <Route path="/sucursales" element={<Sucursales />} />
        <Route path="/sucursales/:id" element={<SucursalDetalle />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
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
