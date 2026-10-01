import { useEffect, useRef, useState } from 'react';

/**
 * Modal con la camara en vivo del dispositivo (telefono, tablet o PC).
 * Nunca abre el selector de archivos del sistema, asi que no hay forma
 * de elegir una foto de la galeria -- solo se puede capturar en el
 * momento. Cada captura se muestra primero como vista previa (foto
 * congelada) para confirmar o repetir antes de agregarla; onCapturar
 * solo se llama hasta que se confirma. El modal se queda abierto para
 * tomar varias fotos seguidas.
 */
export default function CamaraCaptura({ abierto, onCerrar, onCapturar, facingMode = 'environment' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);
  const [previa, setPrevia] = useState(null); // { blob, url } pendiente de confirmar

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setListo(false);
    setPrevia(null);
    let cancelado = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara aquí. Prueba con Chrome o Safari actualizado.');
      return;
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } }, audio: false,
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setListo(true);
      } catch (err) {
        if (cancelado) return;
        setError(
          err.name === 'NotAllowedError' ? 'Necesitas darle permiso de cámara a tu navegador para tomar la foto.'
          : err.name === 'NotFoundError' ? 'No se encontró ninguna cámara en este dispositivo.'
          : `No se pudo abrir la cámara (${err.message}).`
        );
      }
    })();

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [abierto, facingMode]);

  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPrevia({ blob, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.85);
  }

  function usarFoto() {
    if (!previa) return;
    onCapturar(new File([previa.blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    setPrevia(null);
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-black">
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-medium text-white">{previa ? '¿Usar esta foto?' : 'Tomar foto'}</span>
          <button type="button" onClick={onCerrar} className="text-xl leading-none text-white">×</button>
        </div>
        {error ? (
          <div className="p-6 text-center text-sm text-white">{error}</div>
        ) : previa ? (
          <img src={previa.url} alt="Vista previa" className="aspect-[4/3] w-full bg-black object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full bg-black object-cover" />
        )}
        <div className="flex justify-center gap-3 p-4">
          {error ? (
            <button type="button" onClick={onCerrar} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white">
              Cerrar
            </button>
          ) : previa ? (
            <>
              <button type="button" onClick={() => setPrevia(null)} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white">
                Repetir
              </button>
              <button type="button" onClick={usarFoto} className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black">
                Usar foto
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onCerrar} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white">
                Listo
              </button>
              <button type="button" onClick={capturar} disabled={!listo}
                      className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-50">
                Capturar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
