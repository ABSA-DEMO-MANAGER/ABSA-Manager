import { Link } from 'react-router-dom';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import AppShell from '../../components/AppShell';
import { Cargando, Aviso } from '../../components/ui';
import { supabase } from '../../lib/supabase';

const NAV = [
  { to: '/flotas', label: 'Unidades', icono: '🚚', end: true },
  { to: '/flotas/tickets', label: 'Tickets', icono: '☑' },
  { to: '/flotas/siniestros', label: 'Siniestros', icono: '⚠' },
  { to: '/flotas/costos', label: 'Costos', icono: '💵' },
];

const ROLES = { admin: 'Administrador', gerente: 'Gerente', usuario: 'Usuario', pendiente: 'Pendiente' };

export default function FlotasLayout() {
  const { flotaPerfil, cargando, aprobado, error } = useFlotaPerfil();

  if (cargando) return <Cargando texto="Cargando Flotas…" />;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--plane)' }}>
        <div className="w-full max-w-md space-y-3">
          <Aviso tono="critical">
            No se pudo conectar el módulo de Flotas a la base de datos: {error}
            <br />Es probable que falte correr <strong>supabase/13-flotas-fase1.sql</strong> en Supabase.
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
          <div className="text-3xl" aria-hidden="true">🚚</div>
          <h1 className="text-lg font-semibold">Acceso pendiente</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tu cuenta ya quedó registrada en Flotas. Un administrador de este portal debe
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

  const nav = flotaPerfil.rol === 'admin'
    ? [...NAV,
        { to: '/flotas/combustible', label: 'Combustible', icono: '⛽' },
        { to: '/flotas/carga', label: 'Carga masiva', icono: '⇪' },
        { to: '/flotas/usuarios', label: 'Usuarios', icono: '☺' }]
    : NAV;

  return (
    <AppShell appLabel="Flotas" appIcono="🚚" appSub="Gestión de activos"
              nav={nav} rolLabel={ROLES[flotaPerfil.rol]} />
  );
}
