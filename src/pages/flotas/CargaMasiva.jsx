import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { Card, Tabla, Boton, Aviso, Badge, Cargando } from '../../components/ui';

const COLUMNAS = [
  'codigo', 'ciudad', 'marca', 'modelo', 'anio', 'tipo', 'version', 'motor', 'color', 'placas', 'vin', 'origen_placa',
  'propiedad', 'estado', 'km', 'valor', 'costo_poliza',
  'conductor_nombre', 'conductor_correo', 'conductor_telefono', 'conductor_licencia', 'licencia_vence',
  'puesto', 'departamento', 'area', 'jefe_directo', 'tipo_prestacion',
  'proximo_servicio_km', 'proximo_servicio_fecha', 'fecha_ultimo_servicio', 'notas',
  'verificacion_vence', 'seguro_vence', 'tenencia_vence', 'circulacion_vence', 'arrendadora', 'contrato_fin',
];

const FILA_EJEMPLO = [
  'ECO-1001', 'Guadalajara', 'Nissan', 'NP300', '2023', 'Pickup', 'XL 4X2 TA', '2.5L 4 cil.', 'Blanco', 'JAB-12-34', '3N6AD33C4MK000000', 'JALISCO',
  'arrendado', 'activo', '42000', '520000', '9500',
  'Nombre Apellido', 'correo@grupoabsa.com', '+52 33 1234 5678', 'B-1234567', '2027-05-14',
  'Consultor Comercial', 'Ventas', 'Comercial', 'Nombre del jefe', 'Herramienta',
  '48000', '2026-11-10', '2026-05-10', '',
  '2026-11-30', '2027-01-15', '2027-03-31', '2028-06-01', 'Element Fleet México', '2027-02-01',
];

function parseCSV(texto) {
  const filas = []; let fila = [], cur = '', comillas = false;
  const t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else comillas = false; }
      else cur += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur); filas.push(fila); fila = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''));
}

function descargarPlantilla() {
  const csv = [COLUMNAS, FILA_EJEMPLO].map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_flotas.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CargaMasiva() {
  const { esFlotaAdmin } = useFlotaPerfil();
  const [ciudades, setCiudades] = useState(null);
  const [codigosExistentes, setCodigosExistentes] = useState(new Set());
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState(null);

  const [filas, setFilas] = useState(null); // preview parseado
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    (async () => {
      const [c, v, p] = await Promise.all([
        supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
        supabase.from('flota_vehiculos').select('codigo'),
        supabase.rpc('flota_listar_usuarios'),
      ]);
      if (c.error || v.error || p.error) { setError((c.error || v.error || p.error).message); return; }
      setCiudades(c.data);
      setCodigosExistentes(new Set(v.data.map((x) => (x.codigo || '').toUpperCase()).filter(Boolean)));
      setPersonas(p.data);
    })();
  }, []);

  const ciudadPorNombre = useMemo(() => Object.fromEntries((ciudades ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.id])), [ciudades]);
  const personaPorCorreo = useMemo(() => Object.fromEntries((personas ?? []).filter((p) => p.email).map((p) => [p.email.trim().toLowerCase(), p])), [personas]);

  function num(v) { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; }
  function txt(v) { return String(v ?? '').trim() || null; }

  function onArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultado(null);
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result));
      const encabezado = grid[0].map((h) => h.trim().toLowerCase());
      const datos = grid.slice(1).map((fila) => {
        const o = {};
        encabezado.forEach((col, i) => { o[col] = fila[i]; });
        const codigo = txt(o.codigo);
        const ciudadTexto = txt(o.ciudad);
        const correo = txt(o.conductor_correo)?.toLowerCase() || null;
        const persona = correo ? personaPorCorreo[correo] : null;
        const conductorConflicto = !!(persona && persona.vehiculo_asignado_id);
        return {
          _codigoDuplicado: codigo && codigosExistentes.has(codigo.toUpperCase()),
          _ciudadId: ciudadTexto ? ciudadPorNombre[ciudadTexto.toLowerCase()] ?? null : null,
          _ciudadTexto: ciudadTexto,
          _persona: persona && !conductorConflicto ? persona : null,
          _conductorSinCuenta: !!(correo && !persona),
          _conductorConflicto: conductorConflicto,
          codigo, ciudad: o.ciudad,
          marca: txt(o.marca), modelo: txt(o.modelo), anio: num(o.anio), tipo: txt(o.tipo),
          version: txt(o.version), motor: txt(o.motor), color: txt(o.color), placas: txt(o.placas), vin: txt(o.vin),
          origen_placa: txt(o.origen_placa),
          propiedad: /arrend/i.test(o.propiedad || '') ? 'arrendado' : 'propio',
          estado: ['activo', 'en_mantenimiento', 'inactivo'].includes((o.estado || '').toLowerCase()) ? o.estado.toLowerCase() : 'activo',
          km: num(o.km) ?? 0, valor: num(o.valor), costo_poliza: num(o.costo_poliza),
          conductor_nombre: txt(o.conductor_nombre), conductor_correo: correo, conductor_telefono: txt(o.conductor_telefono),
          conductor_licencia: txt(o.conductor_licencia), licencia_vence: txt(o.licencia_vence),
          puesto: txt(o.puesto), departamento: txt(o.departamento), area: txt(o.area),
          jefe_directo: txt(o.jefe_directo), tipo_prestacion: txt(o.tipo_prestacion),
          proximo_servicio_km: num(o.proximo_servicio_km), proximo_servicio_fecha: txt(o.proximo_servicio_fecha),
          fecha_ultimo_servicio: txt(o.fecha_ultimo_servicio), notas: txt(o.notas),
          verificacion_vence: txt(o.verificacion_vence), seguro_vence: txt(o.seguro_vence),
          tenencia_vence: txt(o.tenencia_vence), circulacion_vence: txt(o.circulacion_vence),
          arrendadora: txt(o.arrendadora), contrato_fin: txt(o.contrato_fin),
        };
      });
      setFilas(datos);
    };
    reader.readAsText(file, 'utf-8');
  }

  async function importar() {
    setImportando(true);
    let creadas = 0, omitidas = 0, errores = 0, conConductor = 0;
    for (const f of filas) {
      if (f._codigoDuplicado) { omitidas++; continue; }

      const tieneConductor = !!f._persona;
      const notasExtra = [];
      if (f.notas) notasExtra.push(f.notas);
      if (!tieneConductor && f.conductor_nombre) {
        notasExtra.push(`Conductor propuesto (sin cuenta en Flotas todavía): ${[f.conductor_nombre, f.conductor_telefono, f.conductor_correo].filter(Boolean).join(' · ')}`);
      }
      if (f._conductorConflicto) {
        notasExtra.push(`${f.conductor_nombre || 'El conductor propuesto'} ya tiene otra unidad asignada — no se vinculó automáticamente.`);
      }

      const { data: nuevo, error: err } = await supabase.from('flota_vehiculos').insert({
        codigo: f.codigo, ciudad_id: f._ciudadId, marca: f.marca, modelo: f.modelo, anio: f.anio, tipo: f.tipo,
        version: f.version, motor: f.motor, color: f.color, placas: f.placas, vin: f.vin, origen_placa: f.origen_placa,
        propiedad: f.propiedad, estado: f.estado, km: f.km, valor: f.valor, costo_poliza: f.costo_poliza,
        proximo_servicio_km: f.proximo_servicio_km, proximo_servicio_fecha: f.proximo_servicio_fecha,
        notas: notasExtra.join(' · ') || null,
        ...(tieneConductor ? {
          conductor_nombre: f._persona.nombre, conductor_correo: f._persona.email,
          conductor_telefono: f.conductor_telefono, conductor_licencia: f.conductor_licencia,
          licencia_vence: f.licencia_vence, puesto: f.puesto, departamento: f.departamento,
          jefe_directo: f.jefe_directo, tipo_prestacion: f.tipo_prestacion,
        } : {}),
      }).select('id').maybeSingle();

      if (err || !nuevo) { errores++; continue; }
      creadas++;

      if (tieneConductor) {
        const { error: ePerfil } = await supabase.from('flota_perfiles')
          .update({ vehiculo_asignado_id: nuevo.id }).eq('perfil_id', f._persona.id);
        if (!ePerfil) conConductor++;
      }

      if (f.fecha_ultimo_servicio) {
        await supabase.from('flota_servicios').insert({
          vehiculo_id: nuevo.id, fecha: f.fecha_ultimo_servicio, tipo: 'preventivo',
          concepto: 'Servicio importado del inventario', km: f.km,
        });
      }

      const docs = [
        f.verificacion_vence && { tipo: 'Verificación vehicular', vence: f.verificacion_vence },
        f.seguro_vence && { tipo: 'Póliza de seguro', vence: f.seguro_vence },
        f.tenencia_vence && { tipo: 'Refrendo / tenencia', vence: f.tenencia_vence },
        f.circulacion_vence && { tipo: 'Tarjeta de circulación', vence: f.circulacion_vence },
        f.contrato_fin && { tipo: 'Contrato de arrendamiento', vence: f.contrato_fin, referencia: f.arrendadora },
      ].filter(Boolean);
      if (docs.length) {
        await supabase.from('flota_documentos').insert(docs.map((d) => ({ vehiculo_id: nuevo.id, ...d })));
      }
    }
    setImportando(false);
    setResultado({ creadas, omitidas, errores, conConductor });
    setFilas(null);
  }

  if (!esFlotaAdmin) return <Aviso tono="critical">Solo un administrador de Flotas puede hacer carga masiva.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo preparar la carga masiva: {error}</Aviso>;
  if (!ciudades || !personas) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Carga masiva</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Sube tu inventario real de vehículos de un jalón, en vez de capturarlo uno por uno.
        </p>
      </div>

      <Card title="1. Descarga la plantilla" subtitle="Llénala en Excel o Google Sheets y guárdala como CSV.">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>La columna <strong>ciudad</strong> debe escribirse tal como aparece en Flotas (Guadalajara, Hermosillo, Culiacán…). Si no coincide, la unidad se crea sin ciudad.</li>
          <li>Fechas en formato <strong>AAAA-MM-DD</strong>. Deja vacío lo que no aplique.</li>
          <li><strong>propiedad</strong>: "propio" o "arrendado". <strong>estado</strong>: "activo", "en_mantenimiento" o "inactivo".</li>
          <li>Si el <strong>código</strong> ya existe en el sistema, esa fila se omite al importar (no se duplica).</li>
          <li>El conductor solo se asigna si <strong>conductor_correo</strong> ya tiene cuenta registrada en Flotas — así puede ver su propia unidad. Si no tiene cuenta todavía, sus datos quedan anotados en "Notas" y lo asignas después con "Asignar conductor".</li>
          <li>Si <strong>fecha_ultimo_servicio</strong> viene llena, se registra automáticamente como un servicio en el historial de la unidad.</li>
        </ul>
        <Boton variant="ghost" onClick={descargarPlantilla}>Descargar plantilla CSV</Boton>
      </Card>

      <Card title="2. Sube tu archivo">
        <input type="file" accept=".csv" onChange={onArchivo}
               className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--series-1)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
               style={{ color: 'var(--text-secondary)' }} />
      </Card>

      {resultado && (
        <Aviso tono={resultado.errores ? 'warning' : 'good'}>
          Se importaron <strong>{resultado.creadas}</strong> unidades ({resultado.conConductor} con conductor vinculado).
          {resultado.omitidas > 0 && <> {resultado.omitidas} se omitieron por código duplicado.</>}
          {resultado.errores > 0 && <> {resultado.errores} tuvieron un error al guardarse.</>}
        </Aviso>
      )}

      {filas && (
        <Card title={`3. Revisa antes de importar (${filas.length} filas)`}
              right={<Boton onClick={importar} disabled={importando}>{importando ? 'Importando…' : `Importar ${filas.filter((f) => !f._codigoDuplicado).length} unidades`}</Boton>}>
          {filas.some((f) => f._ciudadTexto && !f._ciudadId) && (
            <Aviso tono="warning">Algunas filas tienen una ciudad que no reconozco — esas unidades se crearán sin ciudad asignada.</Aviso>
          )}
          {filas.some((f) => f._conductorSinCuenta) && (
            <Aviso>Algunas filas tienen un conductor sin cuenta en Flotas todavía — sus datos se guardan en "Notas" de la unidad, sin vincularlo.</Aviso>
          )}
          {filas.some((f) => f._conductorConflicto) && (
            <Aviso tono="warning">Algunas filas tienen un conductor que ya trae otra unidad asignada — no se vincula de nuevo, para no quitársela.</Aviso>
          )}
          <div className="mt-3">
            <Tabla
              columnas={[
                { key: 'codigo', header: 'Código', nowrap: true, render: (f) => f.codigo ?? '—' },
                { key: 'unidad', header: 'Unidad', render: (f) => [f.marca, f.modelo, f.anio].filter(Boolean).join(' ') || '—' },
                { key: 'ciudad', header: 'Ciudad', nowrap: true, render: (f) =>
                    f._ciudadTexto ? (f._ciudadId ? f._ciudadTexto : <span style={{ color: 'var(--critical)' }}>{f._ciudadTexto} (no encontrada)</span>) : '—' },
                { key: 'placas', header: 'Placas', nowrap: true, render: (f) => f.placas ?? '—' },
                { key: 'conductor', header: 'Conductor', render: (f) => (
                    f._persona ? <Badge color="var(--good)">{f.conductor_nombre} — vinculado</Badge>
                    : f._conductorConflicto ? <Badge color="var(--serious)">{f.conductor_nombre} — ya tiene unidad</Badge>
                    : f._conductorSinCuenta ? <Badge color="var(--text-muted)">{f.conductor_nombre} — sin cuenta</Badge>
                    : '—'
                  ) },
                { key: 'estatus', header: '', nowrap: true, render: (f) =>
                    f._codigoDuplicado ? <Badge color="var(--critical)">ya existe — se omite</Badge> : <Badge color="var(--good)">nueva</Badge> },
              ]}
              filas={filas}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
