import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Boton, Campo, Input, Aviso } from '../components/ui';

/* Acceso restringido al dominio corporativo.
   El bloqueo real vive en la base de datos (funcion es_de_la_empresa);
   esto solo da un mensaje claro antes de mandar la petición. */
const DOMINIO = '@grupoabsa.com';
const DOMINIO_RE = new RegExp(`${DOMINIO.replace('.', '\\.')}$`, 'i');

export default function Login() {
  const [modo, setModo] = useState('entrar');   // entrar | registrar
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e) {
    e.preventDefault();

    if (!DOMINIO_RE.test(email.trim())) {
      setMsg({ tono: 'critical', texto: `Solo se permiten correos ${DOMINIO}.` });
      return;
    }

    setOcupado(true);
    setMsg(null);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password: pass, options: { data: { nombre } },
        });
        if (error) throw error;
        setMsg({ tono: 'good', texto: 'Cuenta creada. Si tu proyecto pide confirmación, revisa tu correo.' });
      }
    } catch (err) {
      const t = err.message?.includes('Invalid login')
        ? 'Correo o contraseña incorrectos.'
        : err.message;
      setMsg({ tono: 'critical', texto: t });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg"
               style={{ background: 'var(--series-1)', color: '#fff' }} aria-hidden="true">⚙</div>
          <h1 className="text-lg font-semibold tracking-tight">Portal de Mantenimiento</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Plan, activos y control de gasto
          </p>
        </div>

        <form
          onSubmit={enviar}
          className="space-y-3 rounded-xl border p-5"
          style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        >
          {modo === 'registrar' && (
            <Campo label="Nombre" required>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)}
                     required autoComplete="name" placeholder="Tu nombre" />
            </Campo>
          )}
          <Campo label="Correo" required hint={`Solo cuentas ${DOMINIO}`}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   required autoComplete="email" placeholder={`nombre${DOMINIO}`} />
          </Campo>
          <Campo label="Contraseña" required hint={modo === 'registrar' ? 'Mínimo 6 caracteres.' : undefined}>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                   required minLength={6}
                   autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
          </Campo>

          {msg && <Aviso tono={msg.tono}>{msg.texto}</Aviso>}

          <Boton type="submit" disabled={ocupado} className="w-full">
            {ocupado ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
          </Boton>

          <button
            type="button"
            onClick={() => { setModo(modo === 'entrar' ? 'registrar' : 'entrar'); setMsg(null); }}
            className="w-full pt-1 text-center text-xs underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            {modo === 'entrar' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
