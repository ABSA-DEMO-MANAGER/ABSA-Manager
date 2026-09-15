import { Link } from 'react-router-dom';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import AppShell from '../../components/AppShell';
import { Cargando, Aviso } from '../../components/ui';
import { supabase } from '../../lib/supabase';

const NAV = [
  { to: '/limpieza', label: 'Inventario', icono: '🧴', end: true },
  { to: '/limpieza/planeacion', label: 'Planeación de compra', icono: '🛒' },
  { to: '/limpieza/insumos', label: 'Insumos', icono: '🧻' },
];

const ROLES = { admin: 'Administrador', usuario: 'Usuario', consulta: 'Consulta', pendiente: 'Pendiente' };

export default function LimpiezaLayout() {
  const { limpiezaPerfil, cargando, aprobado, error } = useLimpiezaPerfil();

  if (cargando) return <Cargando texto="Cargando Limpieza…" />;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--plane)' }}>
        <div className="w-full max-w-md space-y-3">
          <Aviso tono="critical">
            No se pudo conectar el módulo de Limpieza a la base de datos: {error}
            <br />Es probable que falte correr <strong>supabase/21-limpieza-fase1.sql</strong> en Supabase.
          </Aviso>
          <Link to="/" className="block text-center text-xs underline" style={{ color: 'var(--text-muted)' }}>
            ← ABSA Manager
          </Link>
        </div>
      </div>
    );
  }

  if (!aprobado) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--plane)' }}>
        <div className="w-full max-w-sm space-y-4 rounded-2xl border p-8 text-center"
             style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <div className="text-3xl" aria-hidden="true">🧴</div>
          <h1 className="text-lg font-semibold">Acceso pendiente</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tu cuenta ya quedó registrada en Limpieza. Un administrador de este portal debe
            asignarte un rol antes de que puedas entrar.
          </p>
          <div className="flex justify-center gap-4 pt-2 text-sm">
            <button onClick={() => location.reload()} className="underline" style={{ color: 'var(--series-1)' }}>
              Ya tengo acceso — recargar
            </button>
            <button onClick={() => supabase.auth.signOut()} className="underline" style={{ color: 'var(--text-secondary)' }}>
              Cerrar sesión
            </button>
          </div>
          <Link to="/" className="block text-xs underline" style={{ color: 'var(--text-muted)' }}>
            ← ABSA Manager
          </Link>
        </div>
      </div>
    );
  }

  const nav = limpiezaPerfil.rol === 'admin'
    ? [...NAV,
        { to: '/limpieza/ubicaciones', label: 'Ubicaciones', icono: '🏬' },
        { to: '/limpieza/usuarios', label: 'Usuarios', icono: '☺' }]
    : NAV;

  return (
    <AppShell appLabel="Limpieza" appIcono="🧴" appSub="Insumos e inventario"
              nav={nav} rolLabel={ROLES[limpiezaPerfil.rol]} />
  );
}
