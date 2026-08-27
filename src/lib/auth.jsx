import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthCtx = createContext({ sesion: null, perfil: null, cargando: true });

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSesion(s);
      if (!s) { setPerfil(null); setCargando(false); }
    });

    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sesion?.user) return;
    let vivo = true;

    (async () => {
      const u = sesion.user;
      const { data } = await supabase
        .from('perfiles')
        .select('id, nombre, rol, sucursal_id')
        .eq('id', u.id)
        .maybeSingle();

      if (!vivo) return;

      if (data) {
        setPerfil(data);
      } else {
        // Primer ingreso: se crea el perfil. La policy exige el dominio de la empresa.
        const { data: nuevo } = await supabase
          .from('perfiles')
          .insert({
            id: u.id,
            nombre: u.user_metadata?.nombre || u.email,
            rol: 'consulta',
          })
          .select('id, nombre, rol, sucursal_id')
          .maybeSingle();

        if (!vivo) return;
        setPerfil(nuevo ?? { id: u.id, nombre: u.email, rol: 'consulta' });
      }
      setCargando(false);
    })();

    return () => { vivo = false; };
  }, [sesion]);

  // esAdmin: dinero (presupuestos, caja chica), sucursales, y alta/edicion
  //   directa de activos.
  // puedeGestionar: operacion del dia a dia (ordenes, gastos, proveedores) —
  //   lo tienen admin y usuario por igual.
  const esAdmin = perfil?.rol === 'admin';
  const puedeGestionar = esAdmin || perfil?.rol === 'usuario';

  return (
    <AuthCtx.Provider value={{ sesion, perfil, cargando, esAdmin, puedeGestionar }}>
      {children}
    </AuthCtx.Provider>
  );
}
