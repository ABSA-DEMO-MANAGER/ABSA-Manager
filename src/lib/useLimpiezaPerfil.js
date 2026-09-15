import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

/**
 * Rol de Limpieza del usuario actual — independiente del rol de
 * Mantenimiento y de Flotas. Si es la primera vez que entra, se crea
 * su fila como "pendiente".
 */
export function useLimpiezaPerfil() {
  const { sesion } = useAuth();
  const [limpiezaPerfil, setLimpiezaPerfil] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!sesion?.user) return;
    let vivo = true;

    (async () => {
      const uid = sesion.user.id;
      const { data, error: errSelect } = await supabase.from('limpieza_perfiles')
        .select('perfil_id, rol')
        .eq('perfil_id', uid).maybeSingle();

      if (!vivo) return;

      if (errSelect) {
        setError(errSelect.message);
        setCargando(false);
        return;
      }

      if (data) {
        setLimpiezaPerfil(data);
      } else {
        const { data: nuevo, error: errInsert } = await supabase.from('limpieza_perfiles')
          .insert({ perfil_id: uid })
          .select('perfil_id, rol').maybeSingle();
        if (!vivo) return;
        if (errInsert) {
          setError(errInsert.message);
          setCargando(false);
          return;
        }
        setLimpiezaPerfil(nuevo ?? { perfil_id: uid, rol: 'pendiente' });
      }
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [sesion]);

  const esLimpiezaAdmin = limpiezaPerfil?.rol === 'admin';
  const puedeCapturar = !!limpiezaPerfil && ['admin', 'usuario'].includes(limpiezaPerfil.rol);
  const aprobado = !!limpiezaPerfil && ['admin', 'usuario', 'consulta'].includes(limpiezaPerfil.rol);

  return { limpiezaPerfil, cargando, esLimpiezaAdmin, puedeCapturar, aprobado, error };
}
