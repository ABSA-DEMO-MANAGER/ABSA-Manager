import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { fechaCorta } from '../../lib/format';
import { Card, Tabla, Cargando, Aviso, Select } from '../../components/ui';

const ROLES = { admin: 'Administrador General', director: 'Director', gerente: 'Gerente', usuario: 'Usuario', pendiente: 'Pendiente' };

export default function UsuariosFlotas() {
  const { flotaPerfil } = useFlotaPerfil();
  const [usuarios, setUsuarios] = useState(null);
  const [precargas, setPrecargas] = useState(null);
  const [error, setError] = useState(null);
  const [errorPrecarga, setErrorPrecarga] = useState(null);
  const [cambiando, setCambiando] = useState(null);
  const [quitando, setQuitando] = useState(null);

  async function cargar() {
    const [u, p] = await Promise.all([
      supabase.rpc('flota_listar_usuarios'),
      supabase.from('flota_precarga').select('id, correo, nombre, puesto, creado_en, flota_vehiculos(codigo, marca, modelo)').order('creado_en'),
    ]);
    if (u.error) { setError(u.error.message); return; }
    setUsuarios(u.data);
    if (p.error) { setErrorPrecarga(p.error.message); setPrecargas([]); }
    else { setErrorPrecarga(null); setPrecargas(p.data); }
  }
  useEffect(() => { cargar(); }, []);

  async function quitarPrecarga(id) {
    if (!confirm('¿Quitar esta precarga? La unidad no se vinculará sola cuando esa persona entre.')) return;
    setQuitando(id);
    const { error: err } = await supabase.from('flota_precarga').delete().eq('id', id);
    setQuitando(null);
    if (err) { alert(err.message); return; }
    cargar();
  }

  const posiblesSupervisores = useMemo(
    () => (usuarios ?? []).filter((u) => ['admin', 'director', 'gerente'].includes(u.rol)),
    [usuarios],
  );

  async function cambiarRol(u, rol) {
    if (u.id === flotaPerfil?.perfil_id && rol !== 'admin') {
      if (!confirm('Vas a quitarte a ti mismo el rol de administrador de Flotas. ¿Seguro?')) return;
    }
    setCambiando(u.id);
    const { error: err } = await supabase.from('flota_perfiles')
      .upsert({ perfil_id: u.id, rol }, { onConflict: 'perfil_id' });
    setCambiando(null);
    if (err) { alert(err.message); return; }
    cargar();
  }

  async function cambiarSupervisor(u, supervisorId) {
    setCambiando(u.id);
    const { error: err } = await supabase.from('flota_perfiles')
      .upsert({ perfil_id: u.id, rol: u.rol, supervisor_id: supervisorId || null }, { onConflict: 'perfil_id' });
    setCambiando(null);
    if (err) { alert(err.message); return; }
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los usuarios: {error}</Aviso>;
  if (!usuarios) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuarios de Flotas</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {usuarios.length} cuentas de la empresa — asígnales un rol y, si aplica, su supervisor
        </p>
      </div>

      <Aviso>
        <strong>Administrador General</strong>: todo, incluye editar unidades y ver la bitácora. ·{' '}
        <strong>Director</strong> y <strong>Gerente</strong>: lo mismo que Usuario, más el costo y las
        solicitudes de su propio equipo (definido por "Supervisor" abajo). · <strong>Usuario</strong>: solo su
        propia unidad. · <strong>Pendiente</strong>: sin acceso todavía.
      </Aviso>

      <Card>
        <Tabla
          vacio="Sin usuarios."
          columnas={[
            { key: 'nombre', header: 'Nombre', render: (u) => (
                <div>
                  {u.nombre}
                  {u.id === flotaPerfil?.perfil_id && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>(tú)</span>}
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
            { key: 'supervisor', header: 'Supervisor', nowrap: true, render: (u) => (
                ['admin'].includes(u.rol) ? <span style={{ color: 'var(--text-muted)' }}>—</span> : (
                  <Select value={u.supervisor_id ?? ''} onChange={(e) => cambiarSupervisor(u, e.target.value)}
                          className="!w-auto !py-1 text-xs">
                    <option value="">Sin asignar</option>
                    {posiblesSupervisores.filter((s) => s.id !== u.id).map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre} · {ROLES[s.rol]}</option>
                    ))}
                  </Select>
                )) },
          ]}
          filas={usuarios}
        />
      </Card>

      {errorPrecarga && (
        <Aviso tono="critical">No se pudo cargar "Pendientes por registrarse": {errorPrecarga}</Aviso>
      )}

      {precargas?.length > 0 && (
        <Card title="Pendientes por registrarse"
              subtitle="Ya tienen su unidad y datos cargados. En cuanto entren al portal con este correo, se vinculan solos.">
          <Tabla
            columnas={[
              { key: 'nombre', header: 'Nombre', render: (u) => u.nombre ?? '—' },
              { key: 'correo', header: 'Correo' },
              { key: 'unidad', header: 'Unidad', render: (u) => u.flota_vehiculos
                  ? [u.flota_vehiculos.codigo, u.flota_vehiculos.marca, u.flota_vehiculos.modelo].filter(Boolean).join(' · ')
                  : '—' },
              { key: 'puesto', header: 'Puesto', render: (u) => u.puesto ?? '—' },
              { key: 'acciones', header: '', nowrap: true, render: (u) => (
                  <button onClick={() => quitarPrecarga(u.id)} disabled={quitando === u.id}
                          className="text-xs underline" style={{ color: 'var(--critical)' }}>
                    {quitando === u.id ? 'Quitando…' : 'Quitar'}
                  </button>
                ) },
            ]}
            filas={precargas}
          />
        </Card>
      )}
    </div>
  );
}
