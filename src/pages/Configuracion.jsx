import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fechaCorta } from '../lib/format';
import { Card, Cargando, Aviso, Campo, Input, Boton, Modal, Textarea, Tabla } from '../components/ui';

const INDICE_VACIO = { instalaciones: '', documentos: '', portal: '', notas: '' };

export default function Configuracion() {
  const { perfil, esAdmin } = useAuth();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);
  const [guardado, setGuardado] = useState(false);

  const [historialIndice, setHistorialIndice] = useState([]);
  const [modalIndice, setModalIndice] = useState(false);
  const [formIndice, setFormIndice] = useState(INDICE_VACIO);
  const [guardandoIndice, setGuardandoIndice] = useState(false);
  const [indiceError, setIndiceError] = useState(null);

  async function cargar() {
    const [cfg, idx] = await Promise.all([
      supabase.from('mantenimiento_config').select('*').eq('id', 1).single(),
      supabase.from('mantenimiento_indice_orden')
        .select('id, fecha, instalaciones, documentos, portal, notas').order('fecha', { ascending: false }),
    ]);
    if (cfg.error) { setError(cfg.error.message); return; }
    setConfig(cfg.data);
    setForm({
      monto_sin_autorizacion: cfg.data.monto_sin_autorizacion, monto_tres_cotizaciones: cfg.data.monto_tres_cotizaciones,
      caja_chica_limite_evento: cfg.data.caja_chica_limite_evento, caja_chica_limite_emergencia: cfg.data.caja_chica_limite_emergencia,
      rezago_inicial: cfg.data.rezago_inicial ?? '',
    });
    setHistorialIndice(idx.data ?? []);
  }
  useEffect(() => { cargar(); }, []);

  async function guardar(e) {
    e.preventDefault();
    setFormError(null); setGuardado(false);
    const sinAutorizacion = parseFloat(form.monto_sin_autorizacion);
    const tresCotizaciones = parseFloat(form.monto_tres_cotizaciones);
    const limiteEvento = parseFloat(form.caja_chica_limite_evento);
    const limiteEmergencia = parseFloat(form.caja_chica_limite_emergencia);
    const rezagoInicial = form.rezago_inicial === '' ? null : parseInt(form.rezago_inicial, 10);
    if (isNaN(sinAutorizacion) || sinAutorizacion < 0) return setFormError('El monto sin autorización no es válido.');
    if (isNaN(tresCotizaciones) || tresCotizaciones < 0) return setFormError('El monto de 3 cotizaciones no es válido.');
    if (isNaN(limiteEvento) || limiteEvento < 0) return setFormError('El tope de caja chica por evento no es válido.');
    if (isNaN(limiteEmergencia) || limiteEmergencia < limiteEvento) return setFormError('El tope de emergencia no es válido (debe ser mayor o igual al de evento).');
    if (rezagoInicial !== null && (isNaN(rezagoInicial) || rezagoInicial < 0)) return setFormError('El rezago inicial no es válido.');

    setGuardando(true);
    const { error: err } = await supabase.from('mantenimiento_config')
      .update({
        monto_sin_autorizacion: sinAutorizacion,
        monto_tres_cotizaciones: tresCotizaciones,
        caja_chica_limite_evento: limiteEvento,
        caja_chica_limite_emergencia: limiteEmergencia,
        rezago_inicial: rezagoInicial,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', 1);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setGuardado(true); cargar();
  }

  function abrirCapturaIndice() {
    setFormIndice(INDICE_VACIO);
    setIndiceError(null); setModalIndice(true);
  }

  async function guardarIndice(e) {
    e.preventDefault();
    setIndiceError(null);
    const instalaciones = parseFloat(formIndice.instalaciones);
    const documentos = parseFloat(formIndice.documentos);
    const portal = parseFloat(formIndice.portal);
    if ([instalaciones, documentos, portal].some((v) => isNaN(v) || v < 0 || v > 100)) {
      return setIndiceError('Los tres porcentajes deben estar entre 0 y 100.');
    }
    setGuardandoIndice(true);
    const { error: err } = await supabase.from('mantenimiento_indice_orden').insert({
      instalaciones, documentos, portal, notas: formIndice.notas.trim() || null, creado_por: perfil.id,
    });
    setGuardandoIndice(false);
    if (err) return setIndiceError(err.message);
    setModalIndice(false); cargar();
  }

  if (!esAdmin) return <Aviso tono="critical">Solo un administrador puede ver este módulo.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo cargar la configuración: {error}</Aviso>;
  if (!config) return <Cargando />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Montos que rigen las reglas de autorización y cotizaciones de Mantenimiento
        </p>
      </div>

      <Card>
        <form onSubmit={guardar} className="max-w-md space-y-3">
          <Campo label="Monto sin autorización" required
                 hint="Gastos hasta este monto se marcan aprobado/pagado directo. Arriba se envían a Aprobaciones.">
            <Input inputMode="decimal" value={form.monto_sin_autorizacion} required
                   onChange={(e) => setForm({ ...form, monto_sin_autorizacion: e.target.value })} />
          </Campo>
          <Campo label="Monto que exige 3 cotizaciones" required
                 hint="Órdenes con costo arriba de este monto necesitan 3 cotizaciones o una excepción justificada.">
            <Input inputMode="decimal" value={form.monto_tres_cotizaciones} required
                   onChange={(e) => setForm({ ...form, monto_tres_cotizaciones: e.target.value })} />
          </Campo>
          <Campo label="Tope de caja chica por evento" required
                 hint="Ningún gasto de caja chica normal puede superar este monto.">
            <Input inputMode="decimal" value={form.caja_chica_limite_evento} required
                   onChange={(e) => setForm({ ...form, caja_chica_limite_evento: e.target.value })} />
          </Campo>
          <Campo label="Tope de caja chica en emergencia" required
                 hint="Al marcar un gasto de caja chica como emergencia, puede llegar hasta este monto.">
            <Input inputMode="decimal" value={form.caja_chica_limite_emergencia} required
                   onChange={(e) => setForm({ ...form, caja_chica_limite_emergencia: e.target.value })} />
          </Campo>
          <Campo label="Rezago inicial" hint="Cuántos pendientes había al día 0 del plan — para medir el KPI de reducción de rezago en el Tablero.">
            <Input inputMode="numeric" value={form.rezago_inicial} placeholder="Sin capturar"
                   onChange={(e) => setForm({ ...form, rezago_inicial: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          {guardado && !formError && <Aviso tono="good">Configuración guardada.</Aviso>}

          <div className="flex justify-end pt-1">
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Boton>
          </div>
        </form>
      </Card>

      <Aviso>
        El monto sin autorización y los topes de caja chica también son la regla que aplica
        la base de datos al guardar un gasto, no solo lo que muestra esta pantalla.
      </Aviso>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Índice de orden</h2>
          <Boton onClick={abrirCapturaIndice}>+ Capturar medición</Boton>
        </div>
        <Card subtitle="Instalaciones 40% + documentos 30% + portal 30%. Es una evaluación visual — se captura a mano, el sistema no la puede calcular sola.">
          <Tabla
            vacio="Sin mediciones capturadas todavía."
            columnas={[
              { key: 'fecha', header: 'Fecha', nowrap: true, render: (i) => fechaCorta(i.fecha) },
              { key: 'instalaciones', header: 'Instalaciones', align: 'right', render: (i) => `${i.instalaciones}%` },
              { key: 'documentos', header: 'Documentos', align: 'right', render: (i) => `${i.documentos}%` },
              { key: 'portal', header: 'Portal', align: 'right', render: (i) => `${i.portal}%` },
              { key: 'total', header: 'Índice', align: 'right', render: (i) => (
                  <strong>{(i.instalaciones * 0.4 + i.documentos * 0.3 + i.portal * 0.3).toFixed(1)}%</strong>) },
              { key: 'notas', header: 'Notas', render: (i) => i.notas ?? '—' },
            ]}
            filas={historialIndice}
          />
        </Card>
      </div>

      <Modal abierto={modalIndice} onClose={() => setModalIndice(false)} titulo="Capturar índice de orden">
        <form onSubmit={guardarIndice} className="space-y-3">
          <Campo label="Instalaciones (%)" required hint="Condición, limpieza, identificación y ausencia de riesgos visibles">
            <Input inputMode="decimal" value={formIndice.instalaciones} required
                   onChange={(e) => setFormIndice({ ...formIndice, instalaciones: e.target.value })} />
          </Campo>
          <Campo label="Documentos (%)" required hint="Folio, autorización, comprobante, evidencia y cierre">
            <Input inputMode="decimal" value={formIndice.documentos} required
                   onChange={(e) => setFormIndice({ ...formIndice, documentos: e.target.value })} />
          </Campo>
          <Campo label="Portal (%)" required hint="Registro oportuno, responsable, fechas y actualización">
            <Input inputMode="decimal" value={formIndice.portal} required
                   onChange={(e) => setFormIndice({ ...formIndice, portal: e.target.value })} />
          </Campo>
          <Campo label="Notas">
            <Textarea rows={2} value={formIndice.notas} onChange={(e) => setFormIndice({ ...formIndice, notas: e.target.value })} />
          </Campo>

          {indiceError && <Aviso tono="critical">{indiceError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardandoIndice} onClick={() => setModalIndice(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardandoIndice}>{guardandoIndice ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
