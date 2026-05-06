import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";
import { deudoresApi, llamadasApi, campanasApi, agenteApi, adminApi } from "./api";

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const F = {
  display: "'Clash Display','Sora','Inter',sans-serif",
  body:    "'DM Sans','Inter','Segoe UI',sans-serif",
  mono:    "'DM Mono','IBM Plex Mono',monospace",
};

const C = {
  bg:          "#07090F",
  bgCard:      "#0C1220",
  bgElevated:  "#101929",
  bgHover:     "#13203A",
  border:      "rgba(255,255,255,0.07)",
  borderHi:    "rgba(255,255,255,0.14)",
  brand:       "#4F8EF7",
  brandDim:    "#2D6FE8",
  brandBg:     "rgba(79,142,247,0.13)",
  brandText:   "#89BBFF",
  text:        "#EDF1FF",
  textMid:     "#7A8DB8",
  textLight:   "#3D4E70",
  success:     "#0EC97F",
  successBg:   "rgba(14,201,127,0.13)",
  successText: "#4FFABC",
  warning:     "#F5A623",
  warningBg:   "rgba(245,166,35,0.13)",
  warningText: "#FFCA7A",
  danger:      "#FF4D6A",
  dangerBg:    "rgba(255,77,106,0.13)",
  dangerText:  "#FF8DA0",
  purple:      "#9B6EFF",
  purpleBg:    "rgba(155,110,255,0.13)",
  purpleText:  "#C4A8FF",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; min-width: 1280px; }
  html { font-size: 14px; }
  body { background: ${C.bg}; color: ${C.text}; font-family: ${F.body}; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

  .app-root { display: flex; min-height: 100vh; width: 100%; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 9px 18px; border-radius: 8px; font-family: ${F.body};
    font-size: 13px; font-weight: 500; cursor: pointer; border: none;
    transition: all 0.15s ease; white-space: nowrap; line-height: 1;
  }
  .btn-primary { background: linear-gradient(135deg, ${C.brand} 0%, #6B5EFF 100%); color: #fff; box-shadow: 0 0 20px rgba(79,142,247,0.3); }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 0 28px rgba(79,142,247,0.45); }
  .btn-primary:active { transform: translateY(0); }
  .btn-outline { background: transparent; color: ${C.text}; border: 1px solid ${C.borderHi}; }
  .btn-outline:hover { background: ${C.bgHover}; border-color: rgba(255,255,255,0.2); }
  .btn-ghost { background: transparent; color: ${C.textMid}; border: 1px solid ${C.border}; }
  .btn-ghost:hover { background: ${C.bgElevated}; color: ${C.text}; }
  .btn-danger { background: ${C.dangerBg}; color: ${C.dangerText}; border: 1px solid rgba(255,77,106,0.25); }
  .btn-danger:hover { background: rgba(255,77,106,0.22); }
  .btn-success { background: ${C.successBg}; color: ${C.successText}; border: 1px solid rgba(14,201,127,0.25); }
  .btn-success:hover { background: rgba(14,201,127,0.22); }
  .btn-sm { padding: 6px 12px; font-size: 12px; border-radius: 6px; }

  input, select, textarea {
    background: ${C.bgElevated}; border: 1px solid ${C.border};
    color: ${C.text}; font-family: ${F.body}; font-size: 13.5px;
    padding: 9px 12px; border-radius: 8px; width: 100%;
    outline: none; transition: border 0.14s, box-shadow 0.14s; appearance: auto;
  }
  input:focus, select:focus, textarea:focus { border-color: ${C.brand}; box-shadow: 0 0 0 3px ${C.brandBg}; }
  input::placeholder, textarea::placeholder { color: ${C.textLight}; }
  select option { background: ${C.bgElevated}; color: ${C.text}; }
  label { font-size: 11.5px; color: ${C.textMid}; font-weight: 500; letter-spacing: 0.03em; display: block; margin-bottom: 5px; text-transform: uppercase; }

  .card { background: ${C.bgCard}; border: 1px solid ${C.border}; border-radius: 14px; }
  .card-padded { background: ${C.bgCard}; border: 1px solid ${C.border}; border-radius: 14px; padding: 20px 22px; transition: border-color 0.15s; }
  .card-padded:hover { border-color: ${C.borderHi}; }
  .card-glow { background: ${C.bgCard}; border: 1px solid rgba(79,142,247,0.3); border-radius: 14px; padding: 20px 22px; box-shadow: 0 0 30px rgba(79,142,247,0.08); }

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 500; font-family: ${F.body}; }
  .badge-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .b-blue   { background: ${C.brandBg};   color: ${C.brandText}; }   .b-blue .badge-dot   { background: ${C.brand}; }
  .b-green  { background: ${C.successBg}; color: ${C.successText}; } .b-green .badge-dot  { background: ${C.success}; }
  .b-yellow { background: ${C.warningBg}; color: ${C.warningText}; } .b-yellow .badge-dot { background: ${C.warning}; }
  .b-red    { background: ${C.dangerBg};  color: ${C.dangerText}; }   .b-red .badge-dot    { background: ${C.danger}; }
  .b-gray   { background: rgba(255,255,255,0.07); color: ${C.textMid}; } .b-gray .badge-dot { background: ${C.textLight}; }
  .b-purple { background: ${C.purpleBg};  color: ${C.purpleText}; }  .b-purple .badge-dot { background: ${C.purple}; }

  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid ${C.border}; }
  th { text-align: left; padding: 11px 16px; font-size: 10.5px; font-weight: 600; color: ${C.textLight}; text-transform: uppercase; letter-spacing: 0.08em; background: rgba(255,255,255,0.02); }
  td { padding: 13px 16px; border-bottom: 1px solid ${C.border}; font-size: 13.5px; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: ${C.bgHover}; }

  .section-hd { font-size: 11px; font-weight: 700; color: ${C.textLight}; padding-bottom: 14px; border-bottom: 1px solid ${C.border}; margin-bottom: 18px; letter-spacing: 0.1em; text-transform: uppercase; }
  hr { border: none; border-top: 1px solid ${C.border}; margin: 14px 0; }

  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes spin   { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp 0.28s ease; }
  .pulse   { animation: pulse 2s ease infinite; }
  .spin    { animation: spin 0.7s linear infinite; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }

  *:focus-visible {
    outline: 2px solid ${C.brand};
    outline-offset: 2px;
    border-radius: 4px;
  }
  button, [role="button"] { cursor: pointer; }

  .transcript-bubble { padding: 10px 14px; border-radius: 10px; margin-bottom: 8px; font-size: 13px; line-height: 1.6; max-width: 85%; }
  .bubble-agent  { background: ${C.brandBg};    border: 1px solid rgba(79,142,247,0.2); align-self: flex-start; }
  .bubble-deudor { background: ${C.bgElevated}; border: 1px solid ${C.border}; align-self: flex-end; margin-left: auto; }
  .transcript-container { display: flex; flex-direction: column; gap: 4px; }

  .dia-btn {
    padding: 6px 10px; border-radius: 7px; cursor: pointer;
    font-size: 12px; font-weight: 600; transition: all 0.12s;
    font-family: ${F.body};
  }
`;

// ─── DATA ─────────────────────────────────────────────────────────
const DIAS = ["lun","mar","mié","jue","vie","sáb","dom"];

const FRECUENCIAS = [
  { value:"",          label:"No llamar" },
  { value:"diaria",    label:"Diaria" },
  { value:"cada2dias", label:"Cada 2 días" },
  { value:"cada3dias", label:"Cada 3 días" },
  { value:"semanal",   label:"Semanal" },
  { value:"quincenal", label:"Quincenal" },
  { value:"mensual",   label:"Mensual" },
];

const initDeudores = [
  { id:1, nombre:"Carlos Méndez",   tel:"+54 9 11 4523-7890",  monto:45000, acreedor:"Banco Patagonia", estado:"pendiente",    intentos:0, llamarAuto:true,  frecuencia:"semanal",  hora:"10:00", diasSemana:["lun","jue"] },
  { id:2, nombre:"Ana Rodríguez",   tel:"+54 9 351 6234-1234", monto:12300, acreedor:"FinanCo S.A.",    estado:"contactado",   intentos:2, llamarAuto:true,  frecuencia:"cada2dias",hora:"09:30", diasSemana:["lun","mar","mié","jue","vie"] },
  { id:3, nombre:"Martín López",    tel:"+54 9 261 7890-5678", monto:89750, acreedor:"Banco Patagonia", estado:"promesa_pago", intentos:1, llamarAuto:false, frecuencia:"",         hora:"10:00", diasSemana:[] },
  { id:4, nombre:"Lucía Fernández", tel:"+54 9 11 2345-6789",  monto:3200,  acreedor:"MicroCredit SA",  estado:"no_contesta",  intentos:4, llamarAuto:true,  frecuencia:"diaria",   hora:"11:00", diasSemana:["lun","mar","mié","jue","vie"] },
  { id:5, nombre:"Roberto Silva",   tel:"+54 9 341 4567-8901", monto:67400, acreedor:"FinanCo S.A.",    estado:"cancelado",    intentos:3, llamarAuto:false, frecuencia:"",         hora:"10:00", diasSemana:[] },
];

const initLlamadas = [
  { id:1, deudor:"Ana Rodríguez",  tel:"+54 9 351 6234-1234", fecha:"15/03 10:32", dur:"3m 24s", resultado:"contactado",   nota:"Prometió pagar el viernes", sentimiento:"positivo",
    transcripcion:[
      { quien:"agente", texto:"Buenos días, ¿hablo con Ana Rodríguez? Le llamo de parte de FinanCo S.A." },
      { quien:"deudor", texto:"Sí, soy yo. ¿En qué le puedo ayudar?" },
      { quien:"agente", texto:"Le llamo respecto a una deuda pendiente de $12.300. ¿Podría hablar al respecto?" },
      { quien:"deudor", texto:"Sí, estoy al tanto. Pensé pagar el viernes, ¿está bien?" },
      { quien:"agente", texto:"Por supuesto, quedamos en que el pago será el viernes. ¿Confirma?" },
      { quien:"deudor", texto:"Sí, el viernes lo pago. Muchas gracias." },
    ],
  },
  { id:2, deudor:"Carlos Méndez",  tel:"+54 9 11 4523-7890",  fecha:"15/03 11:05", dur:"0m 15s", resultado:"no_contesta",  nota:"Buzón de voz", sentimiento:"neutro",
    transcripcion:[
      { quien:"agente", texto:"Buenos días, le llamo de parte de Banco Patagonia. Le dejamos este mensaje para coordinar..." },
      { quien:"agente", texto:"[Buzón de voz — llamada finalizada automáticamente]" },
    ],
  },
  { id:3, deudor:"Martín López",   tel:"+54 9 261 7890-5678", fecha:"14/03 16:40", dur:"6m 11s", resultado:"promesa_pago", nota:"Acuerda pagar $40.000 el lunes", sentimiento:"positivo",
    transcripcion:[
      { quien:"agente", texto:"Buenas tardes, ¿hablo con Martín López? Le llamo de parte de Banco Patagonia." },
      { quien:"deudor", texto:"Sí, soy yo. Ya sé por qué me llaman." },
      { quien:"agente", texto:"Entiendo. La deuda pendiente es de $89.750. ¿Podríamos acordar un plan?" },
      { quien:"deudor", texto:"No puedo pagar todo, pero puedo hacer $40.000 el lunes. ¿Es posible?" },
      { quien:"agente", texto:"Por supuesto, registramos pago parcial de $40.000 para el lunes. ¿Confirma?" },
      { quien:"deudor", texto:"Sí, el lunes lo tendrán. Gracias por la flexibilidad." },
      { quien:"agente", texto:"Perfecto. Le enviaremos un recordatorio. ¡Hasta pronto!" },
    ],
  },
  { id:4, deudor:"Roberto Silva",  tel:"+54 9 341 4567-8901", fecha:"14/03 09:15", dur:"4m 55s", resultado:"cancelado",    nota:"Pago total confirmado", sentimiento:"positivo",
    transcripcion:[
      { quien:"agente", texto:"Buenos días Roberto, ¿cómo está? Le llamo de FinanCo respecto a su deuda." },
      { quien:"deudor", texto:"Buenos días, ya hice el pago completo esta mañana por transferencia." },
      { quien:"agente", texto:"¡Excelente! Confirmamos el pago total de $67.400. Muchas gracias." },
      { quien:"deudor", texto:"De nada. Ya pueden cerrar la cuenta." },
    ],
  },
];

const estadoMap = {
  pendiente:    { label:"Pendiente",    cls:"b-gray"   },
  contactado:   { label:"Contactado",   cls:"b-blue"   },
  promesa_pago: { label:"Promesa pago", cls:"b-yellow" },
  no_contesta:  { label:"No contesta",  cls:"b-red"    },
  cancelado:    { label:"Pagado",       cls:"b-green"  },
};

const resultMap = {
  contactado:   { label:"Contactado",  cls:"b-blue"   },
  no_contesta:  { label:"No contestó", cls:"b-gray"   },
  promesa_pago: { label:"Promesa pago",cls:"b-yellow" },
  cancelado:    { label:"Pagado",      cls:"b-green"  },
};

const sentimientoMap = {
  positivo: { label:"Positivo", cls:"b-green" },
  neutro:   { label:"Neutro",   cls:"b-gray"  },
  negativo: { label:"Negativo", cls:"b-red"   },
};

const fmt = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);

// ─── COMPONENTS ──────────────────────────────────────────────────
function Badge({ cls, label }) {
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" />{label}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = name.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase();
  const palette  = [C.brand, C.success, C.purple, C.warning, "#0891B2", "#E879F9"];
  const col      = palette[name.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background:col+"20", border:`1.5px solid ${col}40`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.33, fontWeight:700, color:col, flexShrink:0, fontFamily:F.body,
    }}>{initials}</div>
  );
}

function Field({ label, children }) {
  return <div style={{ marginBottom:14 }}><label>{label}</label>{children}</div>;
}

function Modal({ title, onClose, width = 480, children }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(4,7,15,0.8)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:300, padding:20, backdropFilter:"blur(6px)",
    }}>
      <div className="card fade-up" style={{
        width, padding:28, maxHeight:"92vh", overflowY:"auto",
        border:`1px solid ${C.borderHi}`,
        boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <span style={{ fontFamily:F.display, fontSize:17, fontWeight:600, color:C.text }}>{title}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── SELECTOR DE DÍAS ─────────────────────────────────────────────
function DiasPicker({ value, onChange }) {
  const toggle = d => onChange(value.includes(d) ? value.filter(x=>x!==d) : [...value, d]);
  return (
    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
      {DIAS.map(d => {
        const on = value.includes(d);
        return (
          <button key={d} type="button" onClick={()=>toggle(d)} style={{
            padding:"6px 10px", borderRadius:7, cursor:"pointer",
            fontSize:12, fontWeight:600, transition:"all 0.12s",
            border:`1.5px solid ${on ? C.brand : C.border}`,
            background: on ? C.brandBg : C.bgElevated,
            color: on ? C.brandText : C.textMid,
            boxShadow: on ? `0 0 10px ${C.brand}25` : "none",
          }}>{d}</button>
        );
      })}
    </div>
  );
}

// ─── FORM LLAMADAS ────────────────────────────────────────────────
function LlamadasConfig({ form, setForm }) {
  const llamar = form.llamarAuto;
  return (
    <div style={{ background:C.bgElevated, borderRadius:10, padding:"16px", border:`1px solid ${C.border}`, marginBottom:4 }}>
      {/* Toggle principal */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: llamar ? 16 : 0 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Llamar automáticamente</div>
          <div style={{ fontSize:11.5, color:C.textLight, marginTop:2 }}>La IA llamará a este cliente según la programación</div>
        </div>
        <label className="toggle" style={{ position:"relative", width:38, height:22, flexShrink:0 }}>
          <input type="checkbox" checked={llamar} onChange={e=>setForm(f=>({...f, llamarAuto:e.target.checked}))} style={{ opacity:0, width:0, height:0 }} />
          <span style={{
            position:"absolute", inset:0,
            background: llamar ? "linear-gradient(135deg,#4F8EF7,#6B5EFF)" : "rgba(255,255,255,0.1)",
            borderRadius:22, cursor:"pointer", transition:"0.2s",
            border: llamar ? "none" : `1px solid ${C.border}`,
          }}>
            <span style={{
              position:"absolute", width:16, height:16,
              left: llamar ? 20 : 2, top:3,
              background:"#fff", borderRadius:"50%", transition:"left 0.2s",
              boxShadow:"0 1px 4px rgba(0,0,0,0.3)",
            }} />
          </span>
        </label>
      </div>

      {llamar && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <Field label="Frecuencia">
              <select value={form.frecuencia} onChange={e=>setForm(f=>({...f,frecuencia:e.target.value}))}>
                {FRECUENCIAS.filter(x=>x.value).map(x=>(
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Hora de llamada">
              <input type="time" value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))} />
            </Field>
          </div>
          <Field label="Días habilitados">
            <DiasPicker value={form.diasSemana} onChange={v=>setForm(f=>({...f,diasSemana:v}))} />
          </Field>
        </>
      )}
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard", label:"Dashboard", icon:"M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { id:"deudores",  label:"Deudores",  icon:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { id:"agente",    label:"Agente IA", icon:"M12 2a10 10 0 100 20 10 10 0 000-20zM12 9a3 3 0 100 6 3 3 0 000-6z" },
  { id:"campanas",  label:"Campañas",  icon:"M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.1 10.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" },
  { id:"historial", label:"Historial", icon:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" },
];

function SidebarIcon({ path }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function Sidebar({ active, setActive }) {
  return (
    <aside style={{
      width:230,
      background:"linear-gradient(180deg, #0C1220 0%, #080E1A 100%)",
      display:"flex", flexDirection:"column", flexShrink:0,
      borderRight:`1px solid ${C.border}`,
      position:"sticky", top:0, height:"100vh",
    }}>
      <div style={{ padding:"26px 20px 20px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
          <div style={{
            width:36, height:36, borderRadius:10,
            background:"linear-gradient(135deg, #4F8EF7 0%, #6B5EFF 100%)",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 0 18px rgba(79,142,247,0.45)",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily:F.display, fontWeight:700, fontSize:16, color:"#fff", letterSpacing:"-0.02em" }}>Debtflow</div>
            <div style={{ fontSize:10, color:C.textLight, marginTop:1, letterSpacing:"0.05em" }}>AI COLLECTIONS</div>
          </div>
        </div>
      </div>

      <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:11, color:C.textLight }}>Plan actual</span>
          <span style={{
            fontSize:11, fontWeight:700,
            background:"linear-gradient(135deg,#4F8EF7,#9B6EFF)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            padding:"2px 8px", border:"1px solid rgba(79,142,247,0.3)", borderRadius:20,
          }}>✦ Silver</span>
        </div>
      </div>

      <nav style={{ flex:1, padding:"12px 10px", overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:700, color:C.textLight, letterSpacing:"0.15em", padding:"8px 10px 6px", textTransform:"uppercase" }}>Menú</div>
        {NAV.map(n => {
          const on = active === n.id;
          return (
            <button key={n.id} onClick={()=>setActive(n.id)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10,
              padding:"10px 12px",
              background: on ? "rgba(79,142,247,0.12)" : "transparent",
              border: on ? "1px solid rgba(79,142,247,0.2)" : "1px solid transparent",
              borderRadius:9, cursor:"pointer", marginBottom:2,
              color: on ? "#fff" : C.textMid,
              fontSize:13.5, fontFamily:F.body, fontWeight: on ? 600 : 400,
              transition:"all 0.13s", textAlign:"left", position:"relative",
            }}>
              {on && <div style={{
                position:"absolute", left:0, top:"50%", transform:"translateY(-50%)",
                width:3, height:22, background:"linear-gradient(180deg,#4F8EF7,#6B5EFF)", borderRadius:"0 3px 3px 0",
              }} />}
              <span style={{ opacity: on ? 1 : 0.6 }}><SidebarIcon path={n.icon} /></span>
              {n.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div className="pulse" style={{ width:7, height:7, borderRadius:"50%", background:C.danger }} />
          <span style={{ fontSize:11, color:C.textLight }}>Twilio sin conectar</span>
        </div>
      </div>
    </aside>
  );
}

// ─── TOPBAR ──────────────────────────────────────────────────────
function Topbar({ title }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      marginBottom:28, paddingBottom:22, borderBottom:`1px solid ${C.border}`,
    }}>
      <div>
        <h1 style={{
          fontFamily:F.display, fontSize:24, fontWeight:700, letterSpacing:"-0.03em",
          background:"linear-gradient(135deg, #EDF1FF 0%, #89BBFF 100%)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        }}>{title}</h1>
        <div style={{ fontSize:12, color:C.textLight, marginTop:4, fontFamily:F.mono }}>
          {new Date().toLocaleDateString("es-AR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
        </div>
      </div>
      <div style={{
        padding:"7px 14px", borderRadius:20,
        background:C.bgElevated, border:`1px solid ${C.border}`,
        fontSize:12, color:C.textMid, fontFamily:F.mono,
      }}>
        {new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────
function Dashboard({ deudores, llamadas }) {
  const totalDeuda = deudores.reduce((s,d)=>s+d.monto,0);
  const recuperado = deudores.filter(d=>d.estado==="cancelado").reduce((s,d)=>s+d.monto,0);
  const tasa       = Math.round(recuperado/totalDeuda*100);

  const metrics = [
    { label:"Deudores",    value:deudores.length,  sub:`${deudores.filter(d=>d.estado==="pendiente").length} pendientes`, color:C.brand,   grad:"135deg,#4F8EF7,#6B5EFF",
      icon:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
    { label:"Deuda total", value:fmt(totalDeuda),   sub:"Cartera activa",       color:C.warning, grad:"135deg,#F5A623,#FF6B35",
      icon:"M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" },
    { label:"Recuperado",  value:fmt(recuperado),   sub:`${tasa}% de recupero`, color:C.success, grad:"135deg,#0EC97F,#00BFAE",
      icon:"M22 11.08V12a10 10 0 11-5.93-9.14M22 4 12 14.01l-3-3" },
    { label:"Con llamadas",value:deudores.filter(d=>d.llamarAuto).length, sub:"Programados", color:C.purple, grad:"135deg,#9B6EFF,#E879F9",
      icon:"M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.1 10.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" },
  ];

  const barColor = {cancelado:C.success,promesa_pago:C.warning,contactado:C.brand,no_contesta:C.danger,pendiente:C.textLight};

  return (
    <div className="fade-up">
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
        {metrics.map(m=>(
          <div key={m.label} className="card-padded" style={{ position:"relative", overflow:"hidden" }}>
            <div style={{
              position:"absolute", top:-24, right:-24, width:80, height:80, borderRadius:"50%",
              background:`radial-gradient(${m.color}20, transparent 70%)`, pointerEvents:"none",
            }} />
            <div style={{
              width:38, height:38, borderRadius:10, marginBottom:14,
              background:`linear-gradient(${m.grad})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:`0 4px 12px ${m.color}35`,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={m.icon}/>
              </svg>
            </div>
            <div style={{ fontSize:10, color:m.color, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{m.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:C.text, fontFamily:F.mono, marginBottom:3 }}>{m.value}</div>
            <div style={{ fontSize:11, color:C.textLight }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16 }}>
        <div className="card-padded">
          <div className="section-hd">Estado de cartera</div>
          {Object.entries(estadoMap).map(([k,v])=>{
            const count = deudores.filter(d=>d.estado===k).length;
            const pct   = Math.round(count/deudores.length*100);
            return (
              <div key={k} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                  <Badge cls={v.cls} label={v.label} />
                  <span style={{ fontSize:12, color:C.textMid, fontFamily:F.mono }}>{count} ({pct}%)</span>
                </div>
                <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:6, height:5, overflow:"hidden" }}>
                  <div style={{
                    width:`${pct}%`, height:"100%", borderRadius:6, transition:"width 0.7s ease",
                    background:`linear-gradient(90deg,${barColor[k]},${barColor[k]}99)`,
                    boxShadow:`0 0 8px ${barColor[k]}60`,
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-padded">
          <div className="section-hd">Actividad reciente</div>
          {llamadas.map(l=>(
            <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
              <Avatar name={l.deudor} size={30} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:500, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:C.text }}>{l.deudor}</div>
                <div style={{ fontSize:11, color:C.textLight, fontFamily:F.mono, marginTop:1 }}>{l.fecha}</div>
              </div>
              <Badge cls={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).cls} label={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DEUDORES ────────────────────────────────────────────────────
const FORM_EMPTY = {
  nombre:"", tel:"", monto:"", acreedor:"", estado:"pendiente",
  llamarAuto:false, frecuencia:"semanal", hora:"10:00", diasSemana:["lun","mié","vie"],
};

function Deudores({ deudores, setDeudores }) {
  const [modal,    setModal]    = useState(false);
  const [editando, setEditando] = useState(null); // id del deudor que se está editando
  const [form,     setForm]     = useState(FORM_EMPTY);
  const [search,   setSearch]   = useState("");

  const openNuevo = () => {
    setEditando(null);
    setForm(FORM_EMPTY);
    setModal(true);
  };

  const openEditar = (d) => {
    setEditando(d.id);
    setForm({ ...d, monto: String(d.monto) });
    setModal(true);
  };

  const save = () => {
    if (!form.nombre||!form.tel||!form.monto) return;
    const data = { ...form, monto:parseFloat(form.monto), intentos: editando ? (deudores.find(d=>d.id===editando)?.intentos||0) : 0 };
    if (editando) {
      setDeudores(p=>p.map(d=>d.id===editando ? { ...d, ...data, id:d.id } : d));
    } else {
      setDeudores(p=>[...p, { ...data, id:Date.now() }]);
    }
    setModal(false);
  };

  const filtered = deudores.filter(d=>
    d.nombre.toLowerCase().includes(search.toLowerCase()) ||
    d.tel.includes(search)
  );

  const frecLabel = v => FRECUENCIAS.find(x=>x.value===v)?.label || "—";

  return (
    <div className="fade-up">
      <div style={{ display:"flex", gap:10, marginBottom:18 }}>
        <div style={{ position:"relative", flex:1, maxWidth:320 }}>
          <input placeholder="Buscar deudor..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:38 }} />
          <svg style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.textLight, pointerEvents:"none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </div>
        <button className="btn btn-primary" onClick={openNuevo}>+ Nuevo deudor</button>
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <table>
          <thead><tr>
            <th>Deudor</th><th>Teléfono</th><th>Monto</th><th>Acreedor</th><th>Estado</th>
            <th>Llamadas auto</th><th>Frecuencia</th><th>Días / Hora</th><th style={{width:100}}></th>
          </tr></thead>
          <tbody>
            {filtered.map(d=>(
              <tr key={d.id}>
                <td><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={d.nombre} size={28}/><span style={{fontWeight:500,color:C.text}}>{d.nombre}</span></div></td>
                <td style={{fontFamily:F.mono,color:C.textMid,fontSize:12.5}}>{d.tel}</td>
                <td style={{fontFamily:F.mono,fontWeight:700,color:C.brandText}}>{fmt(d.monto)}</td>
                <td style={{color:C.textMid,fontSize:12.5}}>{d.acreedor||"—"}</td>
                <td><Badge cls={(estadoMap[d.estado]||estadoMap.pendiente).cls} label={(estadoMap[d.estado]||estadoMap.pendiente).label} /></td>
                <td>
                  <Badge
                    cls={d.llamarAuto ? "b-green" : "b-gray"}
                    label={d.llamarAuto ? "Activo" : "Inactivo"}
                  />
                </td>
                <td style={{fontSize:12.5,color:C.textMid}}>{d.llamarAuto ? frecLabel(d.frecuencia) : "—"}</td>
                <td style={{fontSize:12,color:C.textMid,fontFamily:F.mono}}>
                  {d.llamarAuto && d.diasSemana?.length > 0
                    ? <span>{d.diasSemana.join(", ")} <span style={{color:C.brandText}}>· {d.hora}</span></span>
                    : "—"
                  }
                </td>
                <td>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>openEditar(d)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>setDeudores(p=>p.filter(x=>x.id!==d.id))} aria-label={`Eliminar ${d.nombre}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:48}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.textLight} strokeWidth="1.5" strokeLinecap="round" style={{margin:"0 auto 10px",display:"block"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <div style={{color:C.textMid,fontSize:13,fontWeight:500}}>Sin resultados</div>
              <div style={{color:C.textLight,fontSize:12,marginTop:4}}>Probá con otro término de búsqueda</div>
            </td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editando ? "Editar deudor" : "Nuevo deudor"} onClose={()=>setModal(false)} width={520}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"1/-1"}}>
              <Field label="Nombre completo"><input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Juan Pérez" /></Field>
            </div>
            <Field label="Teléfono"><input value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} placeholder="+54 9 11 XXXX-XXXX" /></Field>
            <Field label="Monto adeudado ($)"><input type="number" value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))} /></Field>
            <Field label="Acreedor"><input value={form.acreedor} onChange={e=>setForm(f=>({...f,acreedor:e.target.value}))} placeholder="Nombre del acreedor" /></Field>
            <Field label="Estado">
              <select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value}))}>
                {Object.entries(estadoMap).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>

          <hr style={{margin:"4px 0 16px"}} />
          <div style={{fontSize:12,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Programación de llamadas</div>
          <LlamadasConfig form={form} setForm={setForm} />

          <div style={{display:"flex",gap:10,marginTop:16}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={save}>
              {editando ? "Guardar cambios" : "Agregar deudor"}
            </button>
            <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── AGENTE ──────────────────────────────────────────────────────
function Agente() {
  const [cfg,setCfg]=useState({
    nombre:"Valentina",tono:"profesional",voz:"nova",idioma:"es-AR",modelo:"gpt-4o",apiKey:"",
    personalidad:"Soy un agente de cobranzas profesional y empático. Mi objetivo es llegar a un acuerdo de pago.",
    saludo:"Buenos días, ¿hablo con {nombre_deudor}? Le llamo de parte de {acreedor}.",
    objecion:"Entiendo su situación. ¿Podríamos acordar un plan de pagos?",
    cierre:"Gracias, quedamos en que realizará el pago el {fecha}. ¡Buen día!",
  });
  const [saved,setSaved]=useState(false);
  const s=k=>e=>setCfg(c=>({...c,[k]:e.target.value}));

  return (
    <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div className="card-glow">
          <div className="section-hd">Identidad del agente</div>
          <Field label="Nombre del agente"><input value={cfg.nombre} onChange={s("nombre")} /></Field>
          <Field label="Tono">
            <select value={cfg.tono} onChange={s("tono")}>
              <option value="profesional">Profesional y formal</option>
              <option value="amigable">Amigable y empático</option>
              <option value="firme">Firme y directo</option>
              <option value="urgente">Urgente y persuasivo</option>
            </select>
          </Field>
          <Field label="Voz">
            <select value={cfg.voz} onChange={s("voz")}>
              <option value="nova">Nova — femenina, cálida</option>
              <option value="alloy">Alloy — neutra, clara</option>
              <option value="echo">Echo — masculina, formal</option>
              <option value="shimmer">Shimmer — femenina, energética</option>
              <option value="onyx">Onyx — masculina, grave</option>
            </select>
          </Field>
          <Field label="Idioma">
            <select value={cfg.idioma} onChange={s("idioma")}>
              <option value="es-AR">Español — Argentina</option>
              <option value="es-ES">Español — España</option>
              <option value="es-MX">Español — México</option>
            </select>
          </Field>
        </div>
        <div className="card-padded">
          <div className="section-hd">Conexión Twilio + OpenAI</div>
          <Field label="API Key Twilio"><input type="password" placeholder="ACxxxxxxxx" value={cfg.apiKey} onChange={s("apiKey")} /></Field>
          <Field label="Modelo LLM">
            <select value={cfg.modelo} onChange={s("modelo")}>
              <option value="gpt-4o">GPT-4o (recomendado)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (económico)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            </select>
          </Field>
          <div style={{background:C.brandBg,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.brandText,border:`1px solid rgba(79,142,247,0.2)`,display:"flex",gap:8,alignItems:"flex-start"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Tu subcuenta de Twilio se crea automáticamente al registrarte. Solo configurá el modelo y la voz.
          </div>
        </div>
      </div>
      <div className="card-padded">
        <div className="section-hd">Scripts de conversación</div>
        <div style={{background:C.bgElevated,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.textMid,border:`1px solid ${C.border}`}}>
          Variables: {["{nombre_deudor}","{acreedor}","{monto}","{fecha}"].map(v=>(
            <span key={v} style={{background:C.brandBg,color:C.brandText,padding:"1px 7px",borderRadius:4,marginRight:4,fontFamily:F.mono,fontSize:11}}>{v}</span>
          ))}
        </div>
        {[["personalidad","Personalidad del agente",4],["saludo","Saludo inicial",3],["objecion","Manejo de objeciones",3],["cierre","Cierre",2]].map(([k,lbl,rows])=>(
          <Field key={k} label={lbl}><textarea rows={rows} value={cfg[k]} onChange={s(k)} style={{resize:"vertical",lineHeight:1.6}} /></Field>
        ))}
        <button className="btn btn-primary" style={{width:"100%",marginTop:6}} onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2500);}}>
          {saved
            ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Guardado</>
            : "Guardar configuración"
          }
        </button>
      </div>
    </div>
  );
}

// ─── CAMPAÑAS ────────────────────────────────────────────────────
function Campanas({ deudores }) {
  const [campanas, setCampanas] = useState([
    { id:1, nombre:"Cobranza Mayo — Banco Patagonia", hora:"10:00", frecuencia:"diaria",  diasSemana:["lun","mar","mié","jue","vie"], maxIntentos:3, activa:true,  total:2, pendientes:1 },
    { id:2, nombre:"Recupero FinanCo Q2",             hora:"09:00", frecuencia:"semanal", diasSemana:["lun"],                          maxIntentos:5, activa:false, total:2, pendientes:2 },
  ]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre:"", frecuencia:"semanal", hora:"10:00", maxIntentos:3, diasSemana:["lun"] });

  const toggle = id => setCampanas(p=>p.map(c=>c.id===id?{...c,activa:!c.activa}:c));
  const save = () => {
    if (!form.nombre) return;
    setCampanas(p=>[...p,{ ...form, id:Date.now(), total:deudores.filter(d=>d.llamarAuto).length, pendientes:deudores.filter(d=>d.estado==="pendiente"&&d.llamarAuto).length }]);
    setModal(false);
    setForm({ nombre:"", frecuencia:"semanal", hora:"10:00", maxIntentos:3, diasSemana:["lun"] });
  };

  const frecuenciaLabel = { diaria:"Diaria", cada2dias:"Cada 2 días", cada3dias:"Cada 3 días", semanal:"Semanal", quincenal:"Quincenal", mensual:"Mensual" };

  return (
    <div className="fade-up">
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:18}}>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Nueva campaña</button>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {campanas.map(c=>(
          <div key={c.id} className="card-padded" style={{display:"flex",alignItems:"center",gap:20}}>
            <div style={{
              width:46,height:46,borderRadius:12,flexShrink:0,
              background: c.activa ? "linear-gradient(135deg,#0EC97F,#00BFAE)" : C.bgElevated,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow: c.activa ? "0 4px 14px rgba(14,201,127,0.35)" : "none",
              border: c.activa ? "none" : `1px solid ${C.border}`,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.activa?"#fff":C.textLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.1 10.81 19.79 19.79 0 01.03 2.14 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
              </svg>
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                <span style={{fontWeight:700,fontSize:14,fontFamily:F.display,color:C.text}}>{c.nombre}</span>
                <Badge cls={c.activa?"b-green":"b-gray"} label={c.activa?"Activa":"Pausada"} />
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px 20px",fontSize:12,color:C.textMid}}>
                <span>Hora: <b style={{color:C.brandText,fontFamily:F.mono}}>{c.hora}</b></span>
                <span>Frecuencia: <b style={{color:C.text}}>{frecuenciaLabel[c.frecuencia]||c.frecuencia}</b></span>
                {c.diasSemana?.length > 0 && <span>Días: <b style={{color:C.text}}>{c.diasSemana.join(", ")}</b></span>}
                <span>Máx. intentos: <b style={{color:C.text,fontFamily:F.mono}}>{c.maxIntentos}</b></span>
              </div>
            </div>
            <div style={{display:"flex",gap:20,alignItems:"center"}}>
              {[{n:c.total,l:"deudores",col:C.brand},{n:c.pendientes,l:"pendientes",col:C.warning}].map(m=>(
                <div key={m.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:F.mono,color:m.col}}>{m.n}</div>
                  <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div>
                </div>
              ))}
              <button className={`btn btn-sm ${c.activa?"btn-danger":"btn-success"}`} onClick={()=>toggle(c.id)}>
                {c.activa
                  ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pausar</>
                  : <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><polygon points="5 3 19 12 5 21 5 3"/></svg> Activar</>
                }
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Nueva campaña" onClose={()=>setModal(false)} width={520}>
          <Field label="Nombre de la campaña">
            <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Cobranza Junio 2025"/>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Frecuencia">
              <select value={form.frecuencia} onChange={e=>setForm(f=>({...f,frecuencia:e.target.value}))}>
                {FRECUENCIAS.filter(x=>x.value).map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Hora de llamada">
              <input type="time" value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))}/>
            </Field>
            <Field label="Máx. intentos">
              <input type="number" min={1} max={10} value={form.maxIntentos} onChange={e=>setForm(f=>({...f,maxIntentos:parseInt(e.target.value)}))}/>
            </Field>
          </div>
          <Field label="Días activos">
            <DiasPicker value={form.diasSemana} onChange={v=>setForm(f=>({...f,diasSemana:v}))} />
          </Field>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={save}>Crear campaña</button>
            <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── HISTORIAL ───────────────────────────────────────────────────
function Historial({ llamadas }) {
  const [filtro,     setFiltro]     = useState("todos");
  const [detalle,    setDetalle]    = useState(null);
  const [tabDetalle, setTabDetalle] = useState("transcript");

  const filtros = [{k:"todos",l:"Todos"},...Object.entries(resultMap).map(([k,v])=>({k,l:v.label}))];
  const filtered = filtro==="todos" ? llamadas : llamadas.filter(l=>l.resultado===filtro);

  return (
    <div className="fade-up">
      <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
        {filtros.map(f=>(
          <button key={f.k} onClick={()=>setFiltro(f.k)} style={{
            padding:"7px 16px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:filtro===f.k?600:400,
            border:`1.5px solid ${filtro===f.k?C.brand:C.border}`,
            background: filtro===f.k ? C.brandBg : "transparent",
            color: filtro===f.k ? C.brandText : C.textMid,
            transition:"all 0.12s",
            boxShadow: filtro===f.k ? `0 0 12px ${C.brand}30` : "none",
          }}>{f.l}</button>
        ))}
      </div>

      <div className="card" style={{overflow:"hidden"}}>
        <table>
          <thead><tr>
            <th>Deudor</th><th>Teléfono</th><th>Fecha</th><th>Duración</th>
            <th>Resultado</th><th>Sentimiento IA</th><th>Notas</th><th style={{width:110}}></th>
          </tr></thead>
          <tbody>
            {filtered.map(l=>(
              <tr key={l.id}>
                <td><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={l.deudor} size={28}/><span style={{fontWeight:500,color:C.text}}>{l.deudor}</span></div></td>
                <td style={{fontFamily:F.mono,fontSize:12.5,color:C.textMid}}>{l.tel}</td>
                <td style={{fontFamily:F.mono,fontSize:12.5,color:C.textMid}}>{l.fecha}</td>
                <td style={{fontFamily:F.mono,fontWeight:600,color:C.brandText}}>{l.dur}</td>
                <td><Badge cls={(resultMap[l.resultado]||resultMap.no_contesta).cls} label={(resultMap[l.resultado]||resultMap.no_contesta).label}/></td>
                <td><Badge cls={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).cls} label={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).label}/></td>
                <td style={{fontSize:12.5,color:C.textMid,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.nota}</td>
                <td>
                  <button className="btn btn-outline btn-sm" onClick={()=>{setDetalle(l);setTabDetalle("transcript");}}>
                    Ver transcript
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <Modal title={`Llamada — ${detalle.deudor}`} onClose={()=>setDetalle(null)} width={560}>
          <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <Badge cls={(resultMap[detalle.resultado]||resultMap.no_contesta).cls} label={(resultMap[detalle.resultado]||resultMap.no_contesta).label}/>
            <Badge cls={(sentimientoMap[detalle.sentimiento]||sentimientoMap.neutro).cls} label={`Sentimiento: ${(sentimientoMap[detalle.sentimiento]||sentimientoMap.neutro).label}`}/>
            <span style={{fontSize:12,color:C.textMid,fontFamily:F.mono,alignSelf:"center"}}>{detalle.fecha} · {detalle.dur}</span>
          </div>

          <div style={{display:"flex",gap:4,marginBottom:18,borderBottom:`1px solid ${C.border}`}}>
            {[["transcript","Transcripción"],["resumen","Resumen IA"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTabDetalle(k)} style={{
                padding:"8px 16px",borderRadius:"8px 8px 0 0",cursor:"pointer",
                fontSize:13,fontWeight:tabDetalle===k?600:400,border:"none",
                background: tabDetalle===k ? C.brandBg : "transparent",
                color: tabDetalle===k ? C.brandText : C.textMid,
                borderBottom: tabDetalle===k ? `2px solid ${C.brand}` : "2px solid transparent",
                transition:"all 0.12s",
              }}>{l}</button>
            ))}
          </div>

          {tabDetalle==="transcript" && (
            <div className="transcript-container" style={{maxHeight:340,overflowY:"auto",paddingRight:4}}>
              {detalle.transcripcion.map((t,i)=>(
                <div key={i} style={{display:"flex",flexDirection:"column"}}>
                  <div style={{fontSize:10,color:C.textLight,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em",textAlign:t.quien==="deudor"?"right":"left",display:"flex",alignItems:"center",gap:4,justifyContent:t.quien==="deudor"?"flex-end":"flex-start"}}>
                    {t.quien==="agente"
                      ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="5"/><path d="M3 21a9 9 0 0118 0"/></svg>Agente IA</>
                      : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/></svg>Deudor</>
                    }
                  </div>
                  <div className={`transcript-bubble ${t.quien==="agente"?"bubble-agent":"bubble-deudor"}`}>
                    {t.texto}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tabDetalle==="resumen" && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{background:C.bgElevated,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Resultado</div>
                <Badge cls={(resultMap[detalle.resultado]||resultMap.no_contesta).cls} label={(resultMap[detalle.resultado]||resultMap.no_contesta).label}/>
              </div>
              <div style={{background:C.bgElevated,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Sentimiento detectado por IA</div>
                <Badge cls={(sentimientoMap[detalle.sentimiento]||sentimientoMap.neutro).cls} label={(sentimientoMap[detalle.sentimiento]||sentimientoMap.neutro).label}/>
              </div>
              <div style={{background:C.bgElevated,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Notas del agente</div>
                <p style={{fontSize:13.5,color:C.text,lineHeight:1.7}}>{detalle.nota}</p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────
function AdminPanel() {
  const [stats,    setStats]    = useState(null);
  const [users,    setUsers]    = useState([]);
  const [llamadas, setLlamadas] = useState([]);
  const [tab,      setTab]      = useState("usuarios");

  useEffect(() => {
    adminApi.stats().then(setStats).catch(()=>{});
    adminApi.users().then(setUsers).catch(()=>{});
    adminApi.llamadas().then(setLlamadas).catch(()=>{});
  }, []);

  const PLANES = ["trial","silver","gold","enterprise"];

  const cambiarPlan = async (id, plan) => {
    await adminApi.setPlan(id, plan);
    setUsers(u => u.map(x => x.id===id ? {...x,plan} : x));
  };

  const cambiarRol = async (id, role) => {
    await adminApi.setRole(id, role);
    setUsers(u => u.map(x => x.id===id ? {...x,role} : x));
  };

  return (
    <div className="fade-up">
      {/* Stats */}
      {stats && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
          {[
            {label:"Usuarios",  value:stats.totalUsuarios,  color:C.brand},
            {label:"Deudores",  value:stats.totalDeudores,  color:C.warning},
            {label:"Llamadas",  value:stats.totalLlamadas,  color:C.success},
          ].map(m=>(
            <div key={m.label} className="card-padded">
              <div style={{fontSize:10,color:m.color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{m.label}</div>
              <div style={{fontSize:28,fontWeight:700,fontFamily:F.mono,color:C.text}}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${C.border}`}}>
        {[["usuarios","Usuarios"],["llamadas","Todas las llamadas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:"9px 18px",borderRadius:"8px 8px 0 0",cursor:"pointer",
            fontSize:13,fontWeight:tab===k?600:400,border:"none",
            background:tab===k?C.brandBg:"transparent",
            color:tab===k?C.brandText:C.textMid,
            borderBottom:tab===k?`2px solid ${C.brand}`:"2px solid transparent",
          }}>{l}</button>
        ))}
      </div>

      {tab==="usuarios" && (
        <div className="card" style={{overflow:"hidden"}}>
          <table>
            <thead><tr><th>Email</th><th>Plan</th><th>Rol</th><th>Número Twilio</th><th>Registrado</th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td style={{color:C.text,fontWeight:500}}>{u.email}</td>
                  <td>
                    <select value={u.plan} onChange={e=>cambiarPlan(u.id,e.target.value)} style={{width:"auto",padding:"5px 8px",fontSize:12}}>
                      {PLANES.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={u.role} onChange={e=>cambiarRol(u.id,e.target.value)} style={{width:"auto",padding:"5px 8px",fontSize:12}}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td style={{fontFamily:F.mono,fontSize:12,color:u.twilio_phone_number?C.successText:C.textLight}}>
                    {u.twilio_phone_number||"Provisionando..."}
                  </td>
                  <td style={{fontSize:12,color:C.textLight,fontFamily:F.mono}}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-AR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="llamadas" && (
        <div className="card" style={{overflow:"hidden"}}>
          <table>
            <thead><tr><th>Usuario</th><th>Deudor</th><th>Resultado</th><th>Sentimiento</th><th>Duración</th><th>Fecha</th></tr></thead>
            <tbody>
              {llamadas.map(l=>(
                <tr key={l.id}>
                  <td style={{fontSize:12,color:C.textMid}}>{l.users?.email||"—"}</td>
                  <td style={{fontWeight:500,color:C.text}}>{l.deudores?.nombre||"—"}</td>
                  <td><Badge cls={(resultMap[l.resultado]||resultMap.no_contesta).cls} label={(resultMap[l.resultado]||resultMap.no_contesta).label}/></td>
                  <td><Badge cls={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).cls} label={(sentimientoMap[l.sentimiento]||sentimientoMap.neutro).label}/></td>
                  <td style={{fontFamily:F.mono,fontSize:12,color:C.brandText}}>
                    {l.duracion_seg ? `${Math.floor(l.duracion_seg/60)}m ${l.duracion_seg%60}s` : '—'}
                  </td>
                  <td style={{fontSize:12,color:C.textLight,fontFamily:F.mono}}>
                    {l.iniciada_at ? new Date(l.iniciada_at).toLocaleString('es-AR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout } = useAuth();

  const [active,   setActive]   = useState("dashboard");
  const [deudores, setDeudores] = useState([]);
  const [llamadas, setLlamadas] = useState([]);

  // Cargar datos desde la API
  useEffect(() => {
    if (!user) return;
    deudoresApi.list().then(setDeudores).catch(()=>{});
    llamadasApi.list().then(setLlamadas).catch(()=>{});
  }, [user]);

  // Pantalla de carga
  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
        <div style={{
          width:40,height:40,borderRadius:"50%",
          border:`3px solid ${C.border}`,
          borderTopColor:C.brand,
          animation:"spin 0.7s linear infinite",
        }} />
        <div style={{color:C.textLight,fontFamily:F.body,fontSize:13}}>Cargando...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Sin sesión → login
  if (!user) return <LoginPage />;

  const isAdmin = user.role === "admin";
  const titles = {
    dashboard:"Dashboard", deudores:"Deudores",
    agente:"Agente IA", campanas:"Campañas", historial:"Historial de llamadas",
    admin:"Panel de Admin",
  };

  // Nav items: admin ve opción extra
  const NAV_ITEMS = [
    { id:"dashboard", label:"Dashboard", icon:"M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
    { id:"deudores",  label:"Deudores",  icon:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
    { id:"agente",    label:"Agente IA", icon:"M12 2a10 10 0 100 20 10 10 0 000-20zM12 9a3 3 0 100 6 3 3 0 000-6z" },
    { id:"campanas",  label:"Campañas",  icon:"M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.1 10.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" },
    { id:"historial", label:"Historial", icon:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" },
    ...(isAdmin ? [{ id:"admin", label:"Admin", icon:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }] : []),
  ];

  return (
    <>
      <style>{css}</style>
      <div className="app-root">
        {/* Sidebar con nav dinámico + logout */}
        <aside style={{
          width:230, background:"linear-gradient(180deg, #0C1220 0%, #080E1A 100%)",
          display:"flex", flexDirection:"column", flexShrink:0,
          borderRight:`1px solid ${C.border}`, position:"sticky", top:0, height:"100vh",
        }}>
          <div style={{ padding:"26px 20px 20px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:11 }}>
              <div style={{ width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#4F8EF7,#6B5EFF)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 18px rgba(79,142,247,0.45)" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              </div>
              <div>
                <div style={{ fontFamily:F.display,fontWeight:700,fontSize:16,color:"#fff",letterSpacing:"-0.02em" }}>Debtflow</div>
                <div style={{ fontSize:10,color:C.textLight,marginTop:1,letterSpacing:"0.05em" }}>AI COLLECTIONS</div>
              </div>
            </div>
          </div>

          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:C.textLight }}>{user.email?.split('@')[0]}</span>
              <span style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,background:"linear-gradient(135deg,#4F8EF7,#9B6EFF)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",padding:"2px 8px",border:"1px solid rgba(79,142,247,0.3)",borderRadius:20 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="url(#pg)" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                  <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4F8EF7"/><stop offset="100%" stopColor="#9B6EFF"/></linearGradient></defs>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {isAdmin ? "Admin" : (user.plan||"trial")}
              </span>
            </div>
          </div>

          <nav style={{ flex:1, padding:"12px 10px", overflowY:"auto" }}>
            <div style={{ fontSize:9,fontWeight:700,color:C.textLight,letterSpacing:"0.15em",padding:"8px 10px 6px",textTransform:"uppercase" }}>Menú</div>
            {NAV_ITEMS.map(n => {
              const on = active === n.id;
              return (
                <button key={n.id} onClick={()=>setActive(n.id)} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:10,
                  padding:"10px 12px",
                  background:on?"rgba(79,142,247,0.12)":"transparent",
                  border:on?"1px solid rgba(79,142,247,0.2)":"1px solid transparent",
                  borderRadius:9,cursor:"pointer",marginBottom:2,
                  color:on?"#fff":C.textMid,
                  fontSize:13.5,fontFamily:F.body,fontWeight:on?600:400,
                  transition:"all 0.13s",textAlign:"left",position:"relative",
                }}>
                  {on && <div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:22,background:"linear-gradient(180deg,#4F8EF7,#6B5EFF)",borderRadius:"0 3px 3px 0"}} />}
                  <span style={{opacity:on?1:0.6}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon}/></svg>
                  </span>
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div className="pulse" style={{ width:7, height:7, borderRadius:"50%", background:user.twilio_phone_number ? C.success : C.danger }} />
                <span style={{ fontSize:11, color:C.textLight }}>
                  {user.twilio_phone_number ? user.twilio_phone_number : "Provisionando..."}
                </span>
              </div>
              <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" style={{ background:"none", border:"none", color:C.textLight, cursor:"pointer", padding:"4px", borderRadius:6, display:"flex", alignItems:"center", transition:"color 0.15s" }} onMouseEnter={e=>e.currentTarget.style.color=C.danger} onMouseLeave={e=>e.currentTarget.style.color=C.textLight}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          </div>
        </aside>

        <main style={{ flex:1, padding:"28px 36px", overflowY:"auto", minWidth:0 }}>
          <Topbar title={titles[active]} />
          {active==="dashboard" && <Dashboard deudores={deudores} llamadas={llamadas}/>}
          {active==="deudores"  && <Deudores  deudores={deudores} setDeudores={setDeudores}/>}
          {active==="agente"    && <Agente/>}
          {active==="campanas"  && <Campanas  deudores={deudores}/>}
          {active==="historial" && <Historial llamadas={llamadas}/>}
          {active==="admin" && isAdmin && <AdminPanel />}
        </main>
      </div>
    </>
  );
}
