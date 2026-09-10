import { useEffect, useState } from 'react';
import { urlFirmada } from '../lib/storage';

/** Miniatura de una imagen guardada en el bucket privado; resuelve una URL firmada. */
export default function FotoFirmada({ path, alt = '', className = '' }) {
  const [url, setUrl] = useState(null);
  const [falla, setFalla] = useState(false);

  useEffect(() => {
    let vivo = true;
    setUrl(null); setFalla(false);
    urlFirmada(path).then((u) => { if (vivo) (u ? setUrl(u) : setFalla(true)); });
    return () => { vivo = false; };
  }, [path]);

  if (falla) {
    return (
      <div className={`flex items-center justify-center rounded-lg border text-xs ${className}`}
           style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', minHeight: 72 }}>
        sin vista previa
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'var(--grid)', minHeight: 72 }} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      <img src={url} alt={alt} loading="lazy"
           className="h-full w-full rounded-lg border object-cover"
           style={{ borderColor: 'var(--border)' }} />
    </a>
  );
}
