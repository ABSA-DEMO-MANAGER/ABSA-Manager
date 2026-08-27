import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fechaCorta } from '../lib/format';
import { Card, Tabla, Cargando, Aviso, Badge } from '../components/ui';

const ROLES = { admin: 'Administrador', usuario: 'Usuario', consulta: 'Consulta' };
const COLOR_ROL = { admin: 'var(--critical)', usuario: 'var(--series-1)', consulta: 'var(--text-muted)' };

export default function Usuarios() {
  const { perfil, esAdmin } = useAuth();
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  const [cambiando, setCambiando] = useState(null);

  async function cargar() {
    const { data, error: err } = await supabase.rpc('listar_usuarios');
    if (err) { setError(err.message); return; }
    setUsuarios(data);
  }
  useEffect(() => { cargar(); }, []);

  async function cambiarRol(u, rol) {
    if (u.id === perfil.id && rol !== 'admin') {
      if (!confirm('Vas a quitarte a ti mismo el rol de administrador. ¿Seguro?')) return;
    }
    setCambiando(u.id);
    const { error: err } = await supabase.from('perfiles').update({ rol }).eq('id', u.id);
    setCambiando(null);
    if (err) { alert(err.message); return; }
    cargar();
  }

  if (!esAdmin) return <Aviso tono="critical">Solo un administrador puede ver este módulo.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudieron cargar los usuarios: {error}</Aviso>;
  if (!usuarios) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuarios</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {usuarios.length} cuentas registradas
        </p>
      </div>

      <Aviso>
        <strong>Administrador</strong>: todos los permisos, incluyendo presupuestos y sucursales. ·{' '}
        <strong>Usuario</strong>: levanta órdenes de trabajo y da de alta o modifica activos (sujeto a
        aprobación), no toca presupuestos. · <strong>Consulta</strong>: solo lectura.
      </Aviso>

      <Card>
        <Tabla
          vacio="Sin usuarios registrados."
          columnas={[
            { key: 'nombre', header: 'Nombre', render: (u) => (
                <div>
                  {u.nombre}
                  {u.id === perfil.id && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>(tú)</span>}
                </div>) },
            { key: 'email', header: 'Correo' },
            { key: 'creado_en', header: 'Desde', nowrap: true, render: (u) => fechaCorta(u.creado_en?.slice(0, 10)) },
            { key: 'rol', header: 'Rol', nowrap: true, render: (u) => (
                cambiando === u.id ? (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Guardando…</span>
                ) : (
                  <select value={u.rol} onChange={(e) => cambiarRol(u, e.target.value)}
                          className="rounded-lg border px-2 py-1 text-xs"
                          style={{ background: 'var(--plane)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )) },
          ]}
          filas={usuarios}
        />
      </Card>
    </div>
  );
}
