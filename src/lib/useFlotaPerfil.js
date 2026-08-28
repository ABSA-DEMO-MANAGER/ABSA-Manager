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
        .select('perfil_id, rol, vehiculo_asignado_id')
        .eq('perfil_id', uid).maybeSingle();

      if (!vivo) return;

      if (errSelect) {
        setError(errSelect.message);
        setCargando(false);
        return;
      }

      if (data) {
        setFlotaPerfil(data);
      } else {
        const { data: nuevo, error: errInsert } = await supabase.from('flota_perfiles')
          .insert({ perfil_id: uid })
          .select('perfil_id, rol, vehiculo_asignado_id').maybeSingle();
        if (!vivo) return;
        if (errInsert) {
          setError(errInsert.message);
          setCargando(false);
          return;
        }
        setFlotaPerfil(nuevo ?? { perfil_id: uid, rol: 'pendiente', vehiculo_asignado_id: null });
      }
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [sesion]);

  const esFlotaAdmin = flotaPerfil?.rol === 'admin';
  const aprobado = !!flotaPerfil && ['admin', 'gerente', 'usuario'].includes(flotaPerfil.rol);

  return { flotaPerfil, cargando, esFlotaAdmin, aprobado, error };
}
