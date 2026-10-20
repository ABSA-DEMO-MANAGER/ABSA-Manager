import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import Unidades from './Unidades';
import MiUnidad from './MiUnidad';

/** Un usuario normal o un Administrador Gasolina ven directo su unidad
 * (este ultimo no tiene por que ver el listado completo de la flota);
 * el resto de los roles aprobados ven el listado completo. */
export default function InicioFlotas() {
  const { flotaPerfil } = useFlotaPerfil();
  return ['usuario', 'admin_gasolina'].includes(flotaPerfil?.rol) ? <MiUnidad /> : <Unidades />;
}
