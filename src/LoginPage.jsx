import { useState } from 'react';
import { useAuth } from './AuthContext';

// Mismos tokens de diseño que App.jsx
const F = { display:"'Clash Display','Sora','Inter',sans-serif", body:"'DM Sans','Inter',sans-serif" };
const C = {
  bg:"#07090F", bgCard:"#0C1220", bgElevated:"#101929",
  border:"rgba(255,255,255,0.07)", borderHi:"rgba(255,255,255,0.14)",
  brand:"#4F8EF7", brandBg:"rgba(79,142,247,0.13)", brandText:"#89BBFF",
  text:"#EDF1FF", textMid:"#7A8DB8", textLight:"#3D4E70",
  danger:"#FF4D6A", dangerBg:"rgba(255,77,106,0.13)",
};

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode,     setMode]     = useState('login');
  const [email,    setEmail]    = useState('');
  const [pass,     setPass]     = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'login') await login(email, pass);
      else                  await register(email, pass);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07090F; }
        .login-input {
          background: #101929; border: 1px solid rgba(255,255,255,0.07);
          color: #EDF1FF; font-family: 'DM Sans',sans-serif; font-size: 13.5px;
          padding: 10px 13px; border-radius: 8px; width: 100%;
          outline: none; transition: border 0.14s, box-shadow 0.14s;
        }
        .login-input:focus { border-color: #4F8EF7; box-shadow: 0 0 0 3px rgba(79,142,247,0.13); }
        .login-input::placeholder { color: #3D4E70; }
        .login-btn {
          width: 100%; padding: 11px; border-radius: 9px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #4F8EF7 0%, #6B5EFF 100%);
          color: #fff; font-family: 'DM Sans',sans-serif; font-size: 14px; font-weight: 600;
          box-shadow: 0 0 20px rgba(79,142,247,0.3); transition: all 0.15s;
        }
        .login-btn:hover { transform: translateY(-1px); box-shadow: 0 0 28px rgba(79,142,247,0.45); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      `}</style>

      <div style={{
        minHeight: '100vh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{
          width: 420, padding: 40,
          background: C.bgCard,
          border: `1px solid ${C.borderHi}`,
          borderRadius: 18,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}>
          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
            <div style={{
              width:42, height:42, borderRadius:12,
              background:'linear-gradient(135deg, #4F8EF7, #6B5EFF)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 20px rgba(79,142,247,0.45)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily:F.display, fontWeight:700, fontSize:20, color:'#fff', letterSpacing:'-0.02em' }}>Debtflow</div>
              <div style={{ fontSize:11, color:C.textLight, letterSpacing:'0.05em' }}>AI COLLECTIONS</div>
            </div>
          </div>

          <h2 style={{ fontFamily:F.display, fontSize:18, fontWeight:600, color:C.text, marginBottom:6 }}>
            {mode === 'login' ? 'Bienvenido de vuelta' : 'Crear cuenta'}
          </h2>
          <p style={{ fontSize:13, color:C.textLight, marginBottom:28 }}>
            {mode === 'login'
              ? 'Ingresá tus credenciales para continuar'
              : 'Tu número de Twilio se configura automáticamente'}
          </p>

          <form onSubmit={submit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:C.textMid, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', display:'block', marginBottom:6 }}>
                Email
              </label>
              <input
                className="login-input"
                type="email" value={email}
                onChange={e=>setEmail(e.target.value)}
                placeholder="tu@email.com" required
                autoComplete="email"
                name="email"
              />
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ fontSize:11, color:C.textMid, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', display:'block', marginBottom:6 }}>
                Contraseña
              </label>
              <div style={{ position:'relative' }}>
                <input
                  className="login-input"
                  type={showPass ? 'text' : 'password'} value={pass}
                  onChange={e=>setPass(e.target.value)}
                  placeholder="••••••••" required minLength={8}
                  autoComplete={mode==='login' ? 'current-password' : 'new-password'}
                  name="password"
                  style={{ paddingRight:42 }}
                />
                <button
                  type="button"
                  onClick={()=>setShowPass(v=>!v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:C.textLight, padding:2, display:'flex', alignItems:'center' }}
                >
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" style={{ background:C.dangerBg, border:'1px solid rgba(255,77,106,0.25)', borderRadius:8, padding:'10px 14px', fontSize:12.5, color:C.danger, marginBottom:16, display:'flex', gap:8, alignItems:'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <button className="login-btn" type="submit" disabled={busy}>
              {busy ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>

          {mode === 'register' && (
            <div style={{ background:C.brandBg, border:`1px solid rgba(79,142,247,0.2)`, borderRadius:8, padding:'10px 14px', fontSize:12, color:C.brandText, marginTop:16, display:'flex', gap:8, alignItems:'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
              Al registrarte se te asigna automáticamente un número de Twilio y un agente IA.
            </div>
          )}

          <p style={{ textAlign:'center', fontSize:12.5, color:C.textLight, marginTop:20 }}>
            {mode === 'login' ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
            <button
              onClick={() => { setMode(mode==='login'?'register':'login'); setError(''); }}
              style={{ background:'none', border:'none', color:C.brand, cursor:'pointer', fontSize:12.5, fontWeight:600 }}
            >
              {mode === 'login' ? 'Registrarse' : 'Iniciar sesión'}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
