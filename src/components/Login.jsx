import { useEffect, useRef, useState } from 'react';
import { decodificarJwt, dominioPermitido, guardarSesion } from '../lib/auth.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login({ onLogin }) {
  const botonRef = useRef(null);
  const [error, setError] = useState(null);
  const [scriptListo, setScriptListo] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setScriptListo(true);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!scriptListo || !window.google || !CLIENT_ID) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (respuesta) => {
        try {
          const payload = decodificarJwt(respuesta.credential);
          if (!dominioPermitido(payload.email)) {
            setError(`El correo ${payload.email} no pertenece a un dominio autorizado.`);
            return;
          }
          const sesion = { email: payload.email, nombre: payload.name, foto: payload.picture };
          guardarSesion(sesion);
          setError(null);
          onLogin(sesion);
        } catch {
          setError('No se pudo procesar el inicio de sesión. Intenta de nuevo.');
        }
      },
    });

    if (botonRef.current) {
      window.google.accounts.id.renderButton(botonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      });
    }
  }, [scriptListo, onLogin]);

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-lg bg-accent-500 flex items-center justify-center text-lg font-semibold text-white mx-auto mb-5">
          ED
        </div>
        <h1 className="text-lg font-semibold text-slate-50">Evaluación Docente</h1>
        <p className="text-sm text-slate-400 mt-1.5 mb-8">
          Calidad Académica HE — acceso restringido a cuentas Kuepa / La Nueva América.
        </p>

        {!CLIENT_ID ? (
          <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800 rounded-md px-3 py-2">
            Falta configurar VITE_GOOGLE_CLIENT_ID en las variables de entorno.
          </div>
        ) : (
          <div className="flex justify-center" ref={botonRef} />
        )}

        {error && (
          <div className="mt-4 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
