import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

/**
 * Rol de Flotas del usuario actual — independiente del rol de
 * Mantenimiento. Si es la primera vez que entra, se crea su fila
 * como "pendiente" (igual que el alta de perfil en Mantenimiento).
 */
export function useFlotaPerfil() {
  const { sesion } = useAuth();
  const [flotaPerfil, setFlotaPerfil] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!sesion?.user) return;
    let vivo = true;

    (async () => {
      const uid = sesion.user.id;
      const { data, error: errSelect } = await supabase.from('flota_perfiles')
        .select('perfil_id, rol, vehiculo_asignado_id, supervisor_id')
        .eq('perfil_id', uid).maybeSingle();

      if (!vivo) return;

      if (errSelect) {
        setError(errSelect.message);
        setCargando(false);
        return;
      }

      // Si ya tenia unidad asignada no hace falta volver a llamar al
      // servidor; si no, damos de alta (o intentamos vincular con una
      // precarga pendiente por su correo) en un solo viaje.
      if (data?.vehiculo_asignado_id) {
        setFlotaPerfil(data);
      } else {
        const { data: nuevo, error: errAlta } = await supabase.rpc('flota_alta_perfil').maybeSingle();
        if (!vivo) return;
        if (errAlta) {
          setError(errAlta.message);
          setCargando(false);
          return;
        }
        setFlotaPerfil(nuevo ?? data ?? { perfil_id: uid, rol: 'pendiente', vehiculo_asignado_id: null });
      }
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [sesion]);

  const esFlotaAdmin = flotaPerfil?.rol === 'admin';   // Administrador General
  const esDirector = flotaPerfil?.rol === 'director';
  const esGerente = flotaPerfil?.rol === 'gerente';
  const puedeVerEquipo = ['admin', 'director', 'gerente'].includes(flotaPerfil?.rol);
  const aprobado = !!flotaPerfil && ['admin', 'director', 'gerente', 'usuario'].includes(flotaPerfil.rol);

  return { flotaPerfil, cargando, esFlotaAdmin, esDirector, esGerente, puedeVerEquipo, aprobado, error };
}
