import { useAuth } from '../lib/auth';
import AppShell from './AppShell';

const NAV = [
  { to: '/mantenimiento',              label: 'Tablero',     icono: '▦', end: true },
  { to: '/mantenimiento/sucursales',   label: 'Sucursales',  icono: '⌂' },
  { to: '/mantenimiento/gastos',       label: 'Gastos',      icono: '$' },
  { to: '/mantenimiento/plan',         label: 'Plan',        icono: '☑' },
  { to: '/mantenimiento/activos',      label: 'Activos',     icono: '⚙' },
  { to: '/mantenimiento/proveedores',  label: 'Proveedores', icono: '⚒' },
];

const ROLES = { admin: 'Administrador', usuario: 'Usuario', consulta: 'Consulta' };

export default function Layout() {
  const { perfil, esAdmin } = useAuth();
  const nav = esAdmin ? [...NAV, { to: '/mantenimiento/usuarios', label: 'Usuarios', icono: '☺' }] : NAV;

  return (
    <AppShell
      appLabel="Mantenimiento" appIcono="⚙" appSub="Portal interno"
      nav={nav} rolLabel={ROLES[perfil?.rol] ?? perfil?.rol}
    />
  );
}
