import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import Unidades from './Unidades';
import MiUnidad from './MiUnidad';

/** Un usuario normal ve directo su unidad; admin/director/gerente ven el listado completo. */
export default function InicioFlotas() {
  const { flotaPerfil } = useFlotaPerfil();
  return flotaPerfil?.rol === 'usuario' ? <MiUnidad /> : <Unidades />;
}
