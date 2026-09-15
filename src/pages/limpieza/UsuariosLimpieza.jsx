import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import { fechaCorta } from '../../lib/format';
import { Card, Tabla, Cargando, Aviso } from '../../components/ui';

const ROLES = { admin: 'Administrador', usuario: 'Usuario', consulta: 'Consulta', pendiente: 'Pendiente' };

export default function UsuariosLimpieza() {
  const { limpiezaPerfil } = useLimpiezaPerfil();
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState(null);
  const [cambiando, setCambiando] = useState(null);

  async function cargar() {
    const { data, error: err } = await supabase.rpc('limpieza_listar_usuarios');
    if (err) { setError(err.message); return; }
    setUsuarios(data);
  }
  useEffect(() => { cargar(); }, []);

  async function cambiarRol(u, rol) {
    if (u.id === limpiezaPerfil.perfil_id && rol !== 'admin') {
      if (!confirm('Vas a quitarte a ti mismo el rol de administrador de Limpieza. ¿Seguro?')) return;
    }
    setCambiando(u.id);
    const { error: err } = await supabase.from('limpieza_perfiles')
      .upsert({ perfil_id: u.id, rol }, { onConflict: 'perfil_id' });
    setCambiando(null);
    if (err) { alert(err.message); return; }
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los usuarios: {error}</Aviso>;
  if (!usuarios) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuarios de Limpieza</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {usuarios.length} cuentas de la empresa — asígnales un rol para que puedan entrar
        </p>
      </div>

      <Aviso>
        <strong>Administrador</strong>: todo, incluyendo catálogo, ubicaciones y usuarios. ·{' '}
        <strong>Usuario</strong>: registra movimientos (entradas/salidas) y consulta. ·{' '}
        <strong>Consulta</strong>: solo ve. · <strong>Pendiente</strong>: sin acceso todavía.
      </Aviso>

      <Card>
        <Tabla
          vacio="Sin usuarios."
          columnas={[
            { key: 'nombre', header: 'Nombre', render: (u) => (
                <div>
                  {u.nombre}
                  {u.id === limpiezaPerfil.perfil_id && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>(tú)</span>}
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
