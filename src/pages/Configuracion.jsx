import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Card, Cargando, Aviso, Campo, Input, Boton } from '../components/ui';

export default function Configuracion() {
  const { esAdmin } = useAuth();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);
  const [guardado, setGuardado] = useState(false);

  async function cargar() {
    const { data, error: err } = await supabase.from('mantenimiento_config').select('*').eq('id', 1).single();
    if (err) { setError(err.message); return; }
    setConfig(data);
    setForm({
      monto_sin_autorizacion: data.monto_sin_autorizacion, monto_tres_cotizaciones: data.monto_tres_cotizaciones,
      caja_chica_limite_evento: data.caja_chica_limite_evento, caja_chica_limite_emergencia: data.caja_chica_limite_emergencia,
    });
  }
  useEffect(() => { cargar(); }, []);

  async function guardar(e) {
    e.preventDefault();
    setFormError(null); setGuardado(false);
    const sinAutorizacion = parseFloat(form.monto_sin_autorizacion);
    const tresCotizaciones = parseFloat(form.monto_tres_cotizaciones);
    const limiteEvento = parseFloat(form.caja_chica_limite_evento);
    const limiteEmergencia = parseFloat(form.caja_chica_limite_emergencia);
    if (isNaN(sinAutorizacion) || sinAutorizacion < 0) return setFormError('El monto sin autorización no es válido.');
    if (isNaN(tresCotizaciones) || tresCotizaciones < 0) return setFormError('El monto de 3 cotizaciones no es válido.');
    if (isNaN(limiteEvento) || limiteEvento < 0) return setFormError('El tope de caja chica por evento no es válido.');
    if (isNaN(limiteEmergencia) || limiteEmergencia < limiteEvento) return setFormError('El tope de emergencia no es válido (debe ser mayor o igual al de evento).');

    setGuardando(true);
    const { error: err } = await supabase.from('mantenimiento_config')
      .update({
        monto_sin_autorizacion: sinAutorizacion,
        monto_tres_cotizaciones: tresCotizaciones,
        caja_chica_limite_evento: limiteEvento,
        caja_chica_limite_emergencia: limiteEmergencia,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', 1);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setGuardado(true); cargar();
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
    </div>
  );
}
