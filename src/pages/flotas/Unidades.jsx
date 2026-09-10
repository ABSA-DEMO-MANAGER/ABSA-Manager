import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { fechaCorta, hoyISO } from '../../lib/format';
import {
  Card, Tabla, Input, Select, Cargando, Aviso, Badge, Stat, Boton, Modal, Campo, Textarea,
} from '../../components/ui';

const ESTADOS = { activo: 'Activo', en_mantenimiento: 'En mantenimiento', inactivo: 'Inactivo' };
const COLOR_ESTADO = { activo: 'var(--good)', en_mantenimiento: 'var(--serious)', inactivo: 'var(--text-muted)' };

const FORM_VACIO = {
  codigo: '', ciudad_id: '', marca: '', modelo: '', anio: '', tipo: '', motor: '', color: '',
  placas: '', vin: '', propiedad: 'propio', estado: 'activo', km: '', valor: '',
  conductor_nombre: '', conductor_telefono: '', conductor_correo: '', conductor_licencia: '', licencia_vence: '',
  tipo_prestacion: '', puesto: '', jefe_directo: '', departamento: '',
  proximo_servicio_km: '', proximo_servicio_fecha: '', notas: '',
};

export default function Unidades() {
  const navigate = useNavigate();
  const { esFlotaAdmin } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [fCiudad, setFCiudad] = useState('');
  const [fEstado, setFEstado] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [v, c, doc] = await Promise.all([
      supabase.from('flota_vehiculos')
        .select('id, codigo, ciudad_id, marca, modelo, anio, tipo, placas, propiedad, estado, km, conductor_nombre, licencia_vence, proximo_servicio_km, proximo_servicio_fecha')
        .order('codigo'),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_documentos').select('vehiculo_id, vence'),
    ]);
    const err = v.error || c.error || doc.error;
    if (err) { setError(err.message); return; }
    setD({ vehiculos: v.data, ciudades: c.data, documentos: doc.data });
  }
  useEffect(() => { cargar(); }, []);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);

  const alertaPorVehiculo = useMemo(() => {
    if (!d) return {};
    const hoy = hoyISO();
    const m = {};
    d.vehiculos.forEach((v) => {
      let alerta = null;
      if (v.proximo_servicio_fecha && v.proximo_servicio_fecha < hoy) alerta = 'servicio vencido';
      else if (v.proximo_servicio_km && Number(v.km) >= Number(v.proximo_servicio_km)) alerta = 'servicio vencido';
      if (v.licencia_vence && v.licencia_vence < hoy) alerta = alerta ? 'varias alertas' : 'licencia vencida';
      m[v.id] = alerta;
    });
    d.documentos.forEach((doc) => {
      if (doc.vence && doc.vence < hoy && m[doc.vehiculo_id] !== undefined) {
        m[doc.vehiculo_id] = m[doc.vehiculo_id] && m[doc.vehiculo_id] !== 'documento vencido' ? 'varias alertas' : 'documento vencido';
      }
    });
    return m;
  }, [d]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    return d.vehiculos.filter((v) =>
      (!fCiudad || String(v.ciudad_id) === fCiudad) &&
      (!fEstado || v.estado === fEstado) &&
      (!q || [v.codigo, v.marca, v.modelo, v.placas, v.conductor_nombre].some((x) => x?.toLowerCase().includes(q))));
  }, [d, busca, fCiudad, fEstado]);

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.marca.trim() && !form.modelo.trim()) return setFormError('Captura al menos marca o modelo.');

    setGuardando(true);
    const { error: err } = await supabase.from('flota_vehiculos').insert({
      codigo: form.codigo.trim() || null,
      ciudad_id: form.ciudad_id ? Number(form.ciudad_id) : null,
      marca: form.marca.trim() || null, modelo: form.modelo.trim() || null,
      anio: form.anio ? Number(form.anio) : null, tipo: form.tipo.trim() || null,
      motor: form.motor.trim() || null, color: form.color.trim() || null,
      placas: form.placas.trim() || null, vin: form.vin.trim() || null,
      propiedad: form.propiedad, estado: form.estado,
      km: form.km === '' ? 0 : Number(form.km), valor: form.valor === '' ? null : Number(form.valor),
      conductor_nombre: form.conductor_nombre.trim() || null,
      conductor_telefono: form.conductor_telefono.trim() || null,
      conductor_correo: form.conductor_correo.trim() || null,
      conductor_licencia: form.conductor_licencia.trim() || null,
      licencia_vence: form.licencia_vence || null,
      tipo_prestacion: form.tipo_prestacion.trim() || null, puesto: form.puesto.trim() || null,
      jefe_directo: form.jefe_directo.trim() || null, departamento: form.departamento.trim() || null,
      proximo_servicio_km: form.proximo_servicio_km === '' ? null : Number(form.proximo_servicio_km),
      proximo_servicio_fecha: form.proximo_servicio_fecha || null,
      notas: form.notas.trim() || null,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar las unidades: {error}</Aviso>;
  if (!d) return <Cargando />;

  const conAlerta = d.vehiculos.filter((v) => alertaPorVehiculo[v.id]).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Unidades</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {filtrados.length} de {d.vehiculos.length} vehículos
          </p>
        </div>
        {esFlotaAdmin && <Boton onClick={abrirNuevo}>+ Nueva unidad</Boton>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unidades registradas" value={d.vehiculos.length} />
        <Stat label="Con alerta" value={conAlerta} tone={conAlerta ? 'critical' : 'good'} />
        <Stat label="En mantenimiento" value={d.vehiculos.filter((v) => v.estado === 'en_mantenimiento').length} />
        <Stat label="Ciudades cubiertas" value={new Set(d.vehiculos.map((v) => v.ciudad_id).filter(Boolean)).size} />
      </div>

      {d.vehiculos.length === 0 && (
        <Aviso tono="warning">
          Todavía no hay unidades registradas. {esFlotaAdmin ? 'Da de alta la primera con "+ Nueva unidad".' : 'Pídele a un administrador de Flotas que las capture.'}
        </Aviso>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Buscar por código, marca, placas, conductor…" value={busca}
                 onChange={(e) => setBusca(e.target.value)} className="!w-auto min-w-[220px] flex-1" />
          <Select value={fCiudad} onChange={(e) => setFCiudad(e.target.value)} className="!w-auto">
            <option value="">Todas las ciudades</option>
            {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="!w-auto">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>

        <Tabla
          onRowClick={(v) => navigate(`/flotas/unidades/${v.id}`)}
          vacio="Ninguna unidad coincide con el filtro."
          columnas={[
            { key: 'codigo', header: 'Código', nowrap: true, render: (v) => v.codigo ?? '—' },
            { key: 'unidad', header: 'Unidad', render: (v) => (
                <div>
                  <div>{[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Sin datos'}</div>
                  {v.placas && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{v.placas}</div>}
                </div>) },
            { key: 'ciudad_id', header: 'Ciudad', nowrap: true, render: (v) => ciudadById[v.ciudad_id]?.nombre ?? '—' },
            { key: 'conductor_nombre', header: 'Conductor', render: (v) => v.conductor_nombre ?? 'Sin asignar' },
            { key: 'estado', header: 'Estado', nowrap: true,
              render: (v) => <Badge color={COLOR_ESTADO[v.estado]}>{ESTADOS[v.estado]}</Badge> },
            { key: 'alerta', header: 'Alertas', nowrap: true, render: (v) =>
                alertaPorVehiculo[v.id] ? <Badge color="var(--critical)">{alertaPorVehiculo[v.id]}</Badge> : '—' },
          ]}
          filas={filtrados}
        />
      </Card>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nueva unidad" ancho="max-w-2xl">
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Código / No. económico">
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </Campo>
            <Campo label="Ciudad">
              <Select value={form.ciudad_id} onChange={(e) => setForm({ ...form, ciudad_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Marca"><Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></Campo>
            <Campo label="Modelo"><Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></Campo>
            <Campo label="Año"><Input inputMode="numeric" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} /></Campo>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Tipo" hint="Pickup, Sedán, Van…"><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></Campo>
            <Campo label="Motor"><Input value={form.motor} onChange={(e) => setForm({ ...form, motor: e.target.value })} /></Campo>
            <Campo label="Color"><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Placas"><Input value={form.placas} onChange={(e) => setForm({ ...form, placas: e.target.value })} /></Campo>
            <Campo label="VIN"><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></Campo>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Propiedad">
              <Select value={form.propiedad} onChange={(e) => setForm({ ...form, propiedad: e.target.value })}>
                <option value="propio">Propio</option>
                <option value="arrendado">Arrendado</option>
              </Select>
            </Campo>
            <Campo label="Estado">
              <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
            <Campo label="Kilometraje"><Input inputMode="numeric" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} /></Campo>
          </div>
          <Campo label="Valor" hint="Opcional">
            <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
          </Campo>

          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Conductor asignado</div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nombre"><Input value={form.conductor_nombre} onChange={(e) => setForm({ ...form, conductor_nombre: e.target.value })} /></Campo>
              <Campo label="Teléfono"><Input value={form.conductor_telefono} onChange={(e) => setForm({ ...form, conductor_telefono: e.target.value })} /></Campo>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo label="Correo"><Input value={form.conductor_correo} onChange={(e) => setForm({ ...form, conductor_correo: e.target.value })} /></Campo>
              <Campo label="Licencia"><Input value={form.conductor_licencia} onChange={(e) => setForm({ ...form, conductor_licencia: e.target.value })} /></Campo>
            </div>
            <Campo label="Vencimiento de licencia" hint="Opcional">
              <Input type="date" value={form.licencia_vence} onChange={(e) => setForm({ ...form, licencia_vence: e.target.value })} />
            </Campo>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo label="Puesto"><Input value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} /></Campo>
              <Campo label="Departamento"><Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></Campo>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo label="Jefe directo"><Input value={form.jefe_directo} onChange={(e) => setForm({ ...form, jefe_directo: e.target.value })} /></Campo>
              <Campo label="Tipo de prestación"><Input value={form.tipo_prestacion} onChange={(e) => setForm({ ...form, tipo_prestacion: e.target.value })} /></Campo>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Próximo servicio</div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Kilometraje"><Input inputMode="numeric" value={form.proximo_servicio_km} onChange={(e) => setForm({ ...form, proximo_servicio_km: e.target.value })} /></Campo>
              <Campo label="Fecha"><Input type="date" value={form.proximo_servicio_fecha} onChange={(e) => setForm({ ...form, proximo_servicio_fecha: e.target.value })} /></Campo>
            </div>
          </div>

          <Campo label="Notas">
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
