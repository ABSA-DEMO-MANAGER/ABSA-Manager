import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import AppShell from './AppShell';

const ROLES = { admin: 'Administrador', usuario: 'Usuario', consulta: 'Consulta' };

export default function Layout() {
  const { perfil, esAdmin } = useAuth();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    async function contarPendientes() {
      const [sol, gas] = await Promise.all([
        supabase.from('solicitudes').select('id', { count: 'exact', head: true })
          .in('estatus', ['nueva', 'en_revision', 'informacion_requerida']),
        supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('estatus_pago', 'a_enviar'),
      ]);
      setPendientes((sol.count ?? 0) + (gas.count ?? 0));
    }
    contarPendientes();
  }, []);

  const nav = [
    {
      titulo: 'Tablero',
      items: [{ to: '/mantenimiento', label: 'Tablero', icono: '▦', end: true }],
    },
    {
      titulo: 'Operación',
      items: [
        { to: '/mantenimiento/solicitudes', label: 'Solicitudes', icono: '✎' },
        { to: '/mantenimiento/plan', label: 'Plan', icono: '☑' },
      ],
    },
    {
      titulo: 'Control',
      items: [
        { to: '/mantenimiento/aprobaciones', label: 'Aprobaciones', icono: '✓', badge: pendientes },
        { to: '/mantenimiento/activos', label: 'Activos', icono: '⚙' },
        { to: '/mantenimiento/gastos', label: 'Gastos', icono: '$' },
        { to: '/mantenimiento/proveedores', label: 'Proveedores', icono: '⚒' },
      ],
    },
    {
      titulo: 'Organización',
      items: [{ to: '/mantenimiento/sucursales', label: 'Sucursales', icono: '⌂' }],
    },
  ];

  if (esAdmin) {
    nav.push({
      titulo: 'Administración',
      items: [
        { to: '/mantenimiento/usuarios', label: 'Usuarios', icono: '☺' },
        { to: '/mantenimiento/configuracion', label: 'Configuración', icono: '⚑' },
      ],
    });
  }

  return (
    <AppShell
      appLabel="Mantenimiento" appIcono="⚙" appSub="Portal interno"
      nav={nav} rolLabel={ROLES[perfil?.rol] ?? perfil?.rol}
    />
  );
}
