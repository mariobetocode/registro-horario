import { useState, useEffect, useMemo } from 'react'
import { sGet, sSet } from './supabase.js'

const DAYS  = ['Lun','Mar','Mié','Jue','Vie','Sáb']
const DKEYS = ['Mon','Tue','Wed','Thu','Fri','Sat']
const LUNCH_BY_DAY = { Mon:60, Tue:60, Wed:60, Thu:60, Fri:60, Sat:15 }

const DEFAULT_EMPS = ['Angel','Alexa','Bautista','Brenda','Fermin','Gabriela','Jazmin',
  'Karina','Kimberly','Leticia','Lidia','Lucero','Mari','Mario','Marta','Monzon',
  'Paula','Prisma','Rosa','Ruby','Sanchez','Sara','Sonia','Teresa','Vazquez','Xochitl']
  .map(name => ({ name, jornada: 'completa' }))

const getMon  = d => { const x=new Date(d),dy=x.getDay(); x.setDate(x.getDate()-dy+(dy===0?-6:1)); x.setHours(0,0,0,0); return x }
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x }
const wKey    = d => d.toISOString().split('T')[0]
const fmtD    = (d,o={}) => d.toLocaleDateString('es-MX',{day:'numeric',month:'short',...o})
const toMin   = t => { if(!t) return null; const[h,m]=t.split(':').map(Number); return h*60+m }
const fmtH    = m => { if(m===null||m===undefined) return '—'; if(m===0) return '0h'; const h=Math.floor(m/60),mn=m%60; return mn?`${h}h ${mn}m`:`${h}h` }
const getLunch = (day, noLunch) => noLunch ? 0 : (LUNCH_BY_DAY[day] ?? 60)
const calcMin = (entry, exit, day='Mon', disc=0, noLunch=false) => {
  const a=toMin(entry), b=toMin(exit)
  if(a===null||b===null) return null
  return Math.max(0, b - a - getLunch(day, noLunch) - disc)
}
const nowTime = () => { const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}` }

const C = {
  acc:'#1F4E79', accL:'#e8f0f8', accT:'#1F4E79',
  grn:'#2d6a4f', grnL:'#eaf4ef',
  red:'#9b2226', redL:'#fdecea',
  ylw:'#7d4f00', ylwL:'#fef3cd',
  brd:'#e0dbd5', bg:'#f7f6f3', sur:'#ffffff',
  sat:'#f5f0ea', tx:'#1a1916', tx2:'#6b6760', tx3:'#a09d99',
}
const iSt = { width:'100%', padding:'8px 10px', border:`1px solid ${C.brd}`, borderRadius:6, fontFamily:'inherit', fontSize:13, background:'#fff', color:C.tx, outline:'none' }
const lSt = { display:'block', fontSize:10, fontWeight:600, color:C.tx2, marginBottom:4, textTransform:'uppercase', letterSpacing:'.5px' }

export default function App() {
  const [monday,  setMonday]  = useState(() => getMon(new Date()))
  const weekKey = useMemo(() => wKey(monday), [monday])
  const [weekData, setWeekData] = useState({})
  const [emps,     setEmps]     = useState([])
  const [cfg,      setCfg]      = useState({ completaMin:540, mediaMin:300 })
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const [offline,  setOffline]  = useState(!navigator.onLine)
  const [fEmp,      setFEmp]      = useState('')
  const [fDay,      setFDay]      = useState('Mon')
  const [fType,     setFType]     = useState('entry')
  const [fTime,     setFTime]     = useState('')
  const [fDiscMin,  setFDiscMin]  = useState('')
  const [fDiscNote, setFDiscNote] = useState('')
  const [fNoLunch,  setFNoLunch]  = useState(false)
  const [showAll,    setShowAll]    = useState(false)
  const [toastData,  setToastData]  = useState(null)
  const [newName,    setNewName]    = useState('')
  const [newJornada, setNewJornada] = useState('completa')
  const [showReport, setShowReport] = useState(false)
  const [bossEmail,  setBossEmail]  = useState('')
  const [cfgC,       setCfgC]       = useState(9)
  const [cfgM,       setCfgM]       = useState(5)
  const [tab,        setTab]        = useState('registro')

  useEffect(() => {
    const on  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const e = await sGet('rh:employees')
      setEmps(e || DEFAULT_EMPS)
      const c = await sGet('rh:cfg')
      if (c) { setCfg(c); setCfgC(Math.round(c.completaMin/60)); setCfgM(Math.round(c.mediaMin/60)) }
      const w = await sGet(`rh:week:${weekKey}`)
      setWeekData(w || {})
      const em = await sGet('rh:bossEmail')
      if (em) setBossEmail(em)
      setLoading(false)
    })()
  }, [weekKey])

  const toast    = (msg, type='ok') => { setToastData({msg,type}); setTimeout(()=>setToastData(null),3000) }
  const saveWD   = async d => { setWeekData(d); setSyncing(true); await sSet(`rh:week:${weekKey}`, d); setSyncing(false) }
  const saveEmps = async e => { setEmps(e);     await sSet('rh:employees', e) }
  const saveCfg  = async c => { setCfg(c);      await sSet('rh:cfg', c) }

  const loadNoLunch = (emp, day) => {
    const stored = (weekData[emp] || {})[day] || {}
    setFNoLunch(stored.noLunch || false)
  }
  const handleEmpChange  = emp  => { setFEmp(emp); if (emp && fType!=='disc') { setFTime(nowTime()); loadNoLunch(emp, fDay) } }
  const handleTypeChange = type => { setFType(type); if (fEmp && type!=='disc') { setFTime(nowTime()); loadNoLunch(fEmp, fDay) } if(type==='disc') setFNoLunch(false) }

  const handleSave = () => {
    if (!fEmp) { toast('Selecciona un empleado','err'); return }
    const nd = JSON.parse(JSON.stringify(weekData))
    if (!nd[fEmp]) nd[fEmp] = {}
    if (!nd[fEmp][fDay]) nd[fEmp][fDay] = {}
    if (fType === 'entry' || fType === 'exit') {
      if (!fTime) { toast('Ingresa la hora','err'); return }
      nd[fEmp][fDay][fType] = fTime
      nd[fEmp][fDay].noLunch = fNoLunch
      setFTime('')
      setFNoLunch(false)
    } else {
      const m = parseInt(fDiscMin) || 0
      if (!m) { toast('Ingresa los minutos','err'); return }
      nd[fEmp][fDay].discount = (nd[fEmp][fDay].discount||0) + m
      if (fDiscNote) {
        const ex = nd[fEmp][fDay].note || ''
        nd[fEmp][fDay].note = ex ? `${ex}; ${fDiscNote}` : fDiscNote
      }
      setFDiscMin(''); setFDiscNote('')
    }
    saveWD(nd)
    toast(`✓ ${fEmp} · ${DAYS[DKEYS.indexOf(fDay)]} guardado`)
  }

  const clearDay = (name, day) => {
    const nd = JSON.parse(JSON.stringify(weekData))
    if (nd[name]) delete nd[name][day]
    saveWD(nd)
    toast('Registro eliminado')
  }

  const addEmp = () => {
    const n = newName.trim()
    if (!n) return
    if (emps.find(e => e.name===n)) { toast('Empleado ya existe','err'); return }
    const ne = [...emps, {name:n, jornada:newJornada}].sort((a,b)=>a.name.localeCompare(b.name))
    saveEmps(ne); setNewName('')
    toast(`${n} agregado`)
  }
  const removeEmp     = name => { if(!confirm(`¿Eliminar a ${name}?`)) return; saveEmps(emps.filter(e=>e.name!==name)) }
  const updateJornada = (name,j) => saveEmps(emps.map(e=>e.name===name?{...e,jornada:j}:e))
  const applyCfg      = () => { const c={completaMin:cfgC*60,mediaMin:cfgM*60}; saveCfg(c); toast('Configuración guardada') }

  const changeWeek = n => setMonday(prev => addDays(prev, n*7))
  const goToday    = ()  => setMonday(getMon(new Date()))

  const getWorked   = (name,day)  => { const r=(weekData[name]||{})[day]||{}; return calcMin(r.entry,r.exit,day,r.discount||0,r.noLunch||false) }
  const getJorMin   = emp         => emp.jornada==='media' ? cfg.mediaMin : cfg.completaMin
  const cellStatus  = (m,jorMin)  => m===null?'empty':m===0?'red':m<jorMin?'yellow':'green'
  const calcWeekTot = emp         => { let t=null; for(const d of DKEYS){const m=getWorked(emp.name,d);if(m!==null)t=(t||0)+m} return t }
  const statusColor = s => ({red:C.red,yellow:C.ylw,green:C.grn,empty:C.tx3}[s])
  const statusBg    = (s,isSat) => s==='red'?C.redL:s==='yellow'?C.ylwL:isSat?C.sat:null

  const visEmps     = showAll ? emps : emps.filter(e=>Object.values(weekData[e.name]||{}).some(r=>r.entry||r.exit))
  const activeCount = emps.filter(e=>calcWeekTot(e)!==null).length
  const grandTot    = emps.reduce((s,e)=>{const t=calcWeekTot(e);return t!==null?s+t:s},0)

  const buildReport = () => {
    const d0=fmtD(monday,{weekday:'long',day:'numeric',month:'long'})
    const d1=fmtD(addDays(monday,5),{weekday:'long',day:'numeric',month:'long'})
    const sep='─'.repeat(42)
    const lines=['REPORTE SEMANAL DE HORAS',`Semana: ${d0} al ${d1}`,sep,
      `${'EMPLEADO'.padEnd(18)} ${'JORNADA'.padEnd(12)} ${'HORAS'.padStart(6)}`,sep]
    let grand=0
    for(const emp of emps){
      const t=calcWeekTot(emp); if(t===null) continue; grand+=t
      lines.push(`${emp.name.padEnd(18)} ${(emp.jornada==='media'?'Media':'Completa').padEnd(12)} ${fmtH(t).padStart(6)}`)
      for(const day of DKEYS){
        const r=(weekData[emp.name]||{})[day]||{}
        if(!r.entry&&!r.exit) continue
        const m=calcMin(r.entry,r.exit,day,r.discount||0,r.noLunch||false)
        const lunchNote = r.noLunch ? ' [sin descanso]' : day==='Sat' ? ' [-15m desayuno]' : ' [-1h comida]'
        let ln=`  ${DAYS[DKEYS.indexOf(day)]}: ${r.entry||'?'} → ${r.exit||'?'} (${fmtH(m)})${lunchNote}`
        if(r.discount) ln+=` [-${r.discount}m${r.note?' '+r.note:''}]`
        lines.push(ln)
      }
    }
    lines.push(sep,`${'TOTAL GENERAL'.padEnd(18)} ${''.padEnd(12)} ${fmtH(grand).padStart(6)}`,sep)
    lines.push(`Generado: ${new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}`)
    return lines.join('\n')
  }

  const sendEmail = () => {
    const d0=fmtD(monday,{day:'numeric',month:'long'}),d1=fmtD(addDays(monday,5),{day:'numeric',month:'long'})
    window.location.href=`mailto:${bossEmail}?subject=${encodeURIComponent(`Reporte semanal ${d0} al ${d1}`)}&body=${encodeURIComponent(buildReport())}`
  }
  const sendWA  = () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(buildReport())}`,'_blank')
  const copyRep = () => navigator.clipboard.writeText(buildReport()).then(()=>toast('Copiado')).catch(()=>toast('Error al copiar','err'))

  if (loading) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',gap:12,fontFamily:'system-ui',color:C.tx2}}>
      <div style={{width:36,height:36,border:`3px solid ${C.brd}`,borderTop:`3px solid ${C.acc}`,borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      <p style={{fontSize:13}}>Cargando datos…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const typeBtns = [
    {k:'entry',l:'↓ Entrada', aB:C.accL,aC:C.accT,aBr:C.acc},
    {k:'exit', l:'↑ Salida',  aB:C.grnL,aC:C.grn, aBr:C.grn},
    {k:'disc', l:'− Descuento',aB:C.ylwL,aC:C.ylw,aBr:C.ylw},
  ]

  const lunchLabel = day => {
    if(day==='Sat') return <p style={{fontSize:10,marginTop:6,padding:'6px 10px',background:C.accL,borderRadius:6,color:C.acc}}>📅 Sábado: se descuentan 15 min de desayuno automáticamente.</p>
    return (
      <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'8px 10px',background:C.ylwL,borderRadius:6,border:'1px solid #e6c84433',cursor:'pointer'}}>
        <input type="checkbox" checked={fNoLunch} onChange={e=>setFNoLunch(e.target.checked)} style={{width:16,height:16,accentColor:C.ylw,flexShrink:0}} />
        <span style={{fontSize:12,color:C.ylw,fontWeight:500}}>No tomó descanso de comida <span style={{fontWeight:400}}>(no descontar 1h)</span></span>
      </label>
    )
  }

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:'100vh',fontSize:14,color:C.tx,paddingBottom:72}}>
      <div style={{background:C.acc,color:'#fff',padding:'0 1rem',height:52,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50,boxShadow:'0 2px 10px rgba(0,0,0,.2)'}}>
        <b style={{fontSize:15}}>📋 Registro de Horarios</b>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {offline && <span style={{fontSize:10,background:'rgba(255,255,255,.2)',padding:'2px 8px',borderRadius:10}}>Sin conexión</span>}
          {syncing && <span style={{fontSize:10,opacity:.7}}>Guardando…</span>}
        </div>
      </div>

      {toastData&&(
        <div style={{position:'fixed',bottom:84,right:16,zIndex:999,background:toastData.type==='err'?C.red:C.grn,color:'#fff',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:500,boxShadow:'0 4px 16px rgba(0,0,0,.2)',maxWidth:280}}>
          {toastData.msg}
        </div>
      )}

      <div style={{background:C.sur,borderBottom:`1px solid ${C.brd}`,padding:'.75rem 1rem',display:'flex',alignItems:'center',gap:8}}>
        <button onClick={()=>changeWeek(-1)} style={{width:32,height:32,border:`1px solid ${C.brd}`,borderRadius:6,background:'transparent',cursor:'pointer',fontSize:16,color:C.tx2,flexShrink:0}}>←</button>
        <div style={{flex:1,textAlign:'center'}}>
          <div style={{fontWeight:600,fontSize:13.5}}>{fmtD(monday)} – {fmtD(addDays(monday,5))}</div>
          <div style={{fontSize:10,color:C.tx3,fontFamily:'monospace',marginTop:1}}>{weekKey}</div>
        </div>
        <button onClick={()=>changeWeek(1)} style={{width:32,height:32,border:`1px solid ${C.brd}`,borderRadius:6,background:'transparent',cursor:'pointer',fontSize:16,color:C.tx2,flexShrink:0}}>→</button>
        <button onClick={goToday} style={{padding:'5px 10px',border:`1px solid ${C.brd}`,borderRadius:6,background:'transparent',cursor:'pointer',fontSize:11,color:C.tx2,flexShrink:0}}>Hoy</button>
      </div>

      <div style={{padding:'1rem',maxWidth:900,margin:'0 auto'}}>

        {tab==='registro'&&(
          <div style={{display:'flex',flexDirection:'column',gap:1}}>
            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflow:'hidden',marginBottom:'1rem'}}>
              <div style={{padding:'.7rem 1rem',borderBottom:`1px solid ${C.brd}`,fontWeight:600,fontSize:13}}>Registrar</div>
              <div style={{padding:'1rem',display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <label style={lSt}>Empleado</label>
                  <select value={fEmp} onChange={e=>handleEmpChange(e.target.value)} style={iSt}>
                    <option value="">— Seleccionar —</option>
                    {emps.map(e=><option key={e.name} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lSt}>Día</label>
                  <select value={fDay} onChange={e=>{ setFDay(e.target.value); if(fEmp) loadNoLunch(fEmp, e.target.value) }} style={iSt}>
                    {DAYS.map((d,i)=><option key={d} value={DKEYS[i]}>{d} {fmtD(addDays(monday,i))}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lSt}>Tipo</label>
                  <div style={{display:'flex',gap:4}}>
                    {typeBtns.map(({k,l,aB,aC,aBr})=>(
                      <button key={k} onClick={()=>handleTypeChange(k)} style={{flex:1,padding:'8px 4px',fontSize:11,fontWeight:500,border:`1px solid ${fType===k?aBr:C.brd}`,borderRadius:6,background:fType===k?aB:'transparent',color:fType===k?aC:C.tx2,cursor:'pointer'}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {fType!=='disc'?(
                  <div>
                    <label style={lSt}>{fType==='entry'?'Hora de entrada':'Hora de salida'}</label>
                    <input type="time" value={fTime} onChange={e=>setFTime(e.target.value)} style={{...iSt,fontSize:18,fontFamily:'monospace',textAlign:'center'}} />
                    {fEmp&&<p style={{fontSize:10,color:C.tx3,marginTop:4}}>Hora actual — edítala si es necesario</p>}
                    {fEmp && lunchLabel(fDay)}
                  </div>
                ):(
                  <>
                    <div>
                      <label style={lSt}>Minutos a descontar</label>
                      <input type="number" min="1" max="480" placeholder="ej. 30" value={fDiscMin} onChange={e=>setFDiscMin(e.target.value)} style={iSt} />
                    </div>
                    <div>
                      <label style={lSt}>Motivo (opcional)</label>
                      <input type="text" placeholder="ej. composturas…" value={fDiscNote} onChange={e=>setFDiscNote(e.target.value)} style={iSt} />
                    </div>
                  </>
                )}
                <button onClick={handleSave} style={{width:'100%',padding:'11px',background:C.acc,color:'#fff',border:'none',borderRadius:6,fontFamily:'inherit',fontSize:14,fontWeight:600,cursor:'pointer'}}>
                  Guardar registro
                </button>
              </div>
            </div>

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:6}}>
              <div style={{display:'flex',gap:6}}>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:500,background:C.accL,color:C.acc}}>{activeCount} empleado{activeCount!==1?'s':''}</span>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:500,background:C.grnL,color:C.grn}}>{fmtH(grandTot)} esta semana</span>
              </div>
              <label style={{fontSize:11,color:C.tx2,display:'flex',alignItems:'center',gap:5}}>
                <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} style={{width:'auto'}} />
                Mostrar todos
              </label>
            </div>

            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{padding:'9px 8px',background:C.acc,color:'#fff',fontWeight:500,fontSize:11,textAlign:'left',minWidth:95,whiteSpace:'nowrap'}}>Empleado</th>
                    {DAYS.map((d,i)=>(
                      <th key={d} style={{padding:'9px 4px',background:i===5?'#2a5b8a':C.acc,color:'#fff',fontWeight:500,fontSize:11,textAlign:'center',minWidth:72}}>
                        {d}<br/><span style={{fontSize:9,fontWeight:400,opacity:.7}}>{fmtD(addDays(monday,i))}</span>
                      </th>
                    ))}
                    <th style={{padding:'9px 6px',background:C.grn,color:'#fff',fontWeight:500,fontSize:11,textAlign:'center',minWidth:68}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visEmps.length===0?(
                    <tr><td colSpan={9} style={{padding:'2.5rem',textAlign:'center',color:C.tx3,fontSize:13}}>Sin registros esta semana.</td></tr>
                  ):visEmps.map((emp,ei)=>{
                    const wt=calcWeekTot(emp),jorMin=getJorMin(emp)
                    return(
                      <tr key={emp.name} style={{background:ei%2===0?'#fff':'#fafaf9'}}>
                        <td style={{padding:'6px 8px',borderBottom:`1px solid ${C.brd}`,borderRight:`1px solid ${C.brd}`,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:110}}>
                          {emp.name}
                          <div style={{fontSize:9,color:emp.jornada==='media'?C.ylw:C.tx3,fontWeight:400,marginTop:1}}>{emp.jornada==='media'?'Media':'Completa'}</div>
                        </td>
                        {DKEYS.map((day,di)=>{
                          const r=(weekData[emp.name]||{})[day]||{}
                          const m=calcMin(r.entry,r.exit,day,r.discount||0,r.noLunch||false)
                          const hasData=r.entry||r.exit
                          const status=hasData?cellStatus(m,jorMin):'empty'
                          const bg=statusBg(status,di===5)||(ei%2===0?'#fff':'#fafaf9')
                          return(
                            <td key={day} style={{padding:'5px 3px',borderBottom:`1px solid ${C.brd}`,borderRight:`1px solid ${C.brd}`,textAlign:'center',background:bg,verticalAlign:'top'}}>
                              {hasData?(
                                <div style={{lineHeight:1.7}}>
                                  {r.entry&&<div style={{color:C.acc,fontFamily:'monospace',fontSize:11}}>→ {r.entry}</div>}
                                  {r.exit &&<div style={{color:C.tx2,fontFamily:'monospace',fontSize:11}}>← {r.exit}</div>}
                                  {m!==null&&<div style={{fontWeight:700,fontSize:11,color:statusColor(status)}}>{fmtH(m)}</div>}
                                  {r.noLunch&&<div style={{fontSize:9,color:C.ylw,background:C.ylwL,borderRadius:3,padding:'1px 4px',display:'inline-block'}}>sin comida</div>}
                                  {r.discount>0&&<div style={{fontSize:9,color:C.ylw,background:C.ylwL,borderRadius:3,padding:'1px 4px',display:'inline-block',marginTop:1}}>-{r.discount}m</div>}
                                  <button onClick={()=>clearDay(emp.name,day)} style={{display:'block',margin:'1px auto 0',fontSize:9,color:C.red,background:'none',border:'none',cursor:'pointer',padding:'1px 3px',opacity:.6}}>✕</button>
                                </div>
                              ):<span style={{color:C.tx3}}>—</span>}
                            </td>
                          )
                        })}
                        <td style={{padding:'6px 5px',borderBottom:`1px solid ${C.brd}`,textAlign:'center',background:C.grnL,fontWeight:700,fontSize:13,color:wt!==null?C.grn:C.tx3}}>
                          {wt!==null?fmtH(wt):'—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:10,color:C.tx3,marginTop:6}}>* Lun–Vie: -1h comida · Sáb: -15min desayuno · 🟡 menos de jornada · 🔴 sin horas</p>

            <button onClick={()=>setShowReport(true)} style={{width:'100%',marginTop:12,padding:'12px',background:C.grn,color:'#fff',border:'none',borderRadius:8,fontFamily:'inherit',fontSize:14,fontWeight:600,cursor:'pointer'}}>
              📄 Generar reporte semanal
            </button>
          </div>
        )}

        {tab==='empleados'&&(
          <div>
            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflow:'hidden',marginBottom:'1rem'}}>
              <div style={{padding:'.7rem 1rem',borderBottom:`1px solid ${C.brd}`,fontWeight:600,fontSize:13}}>Agregar empleado</div>
              <div style={{padding:'1rem',display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <label style={lSt}>Nombre</label>
                  <input type="text" placeholder="Nombre del empleado" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addEmp()} style={iSt} />
                </div>
                <div>
                  <label style={lSt}>Jornada</label>
                  <select value={newJornada} onChange={e=>setNewJornada(e.target.value)} style={iSt}>
                    <option value="completa">Jornada completa ({cfgC}h/día)</option>
                    <option value="media">Media jornada ({cfgM}h/día)</option>
                  </select>
                </div>
                <button onClick={addEmp} style={{width:'100%',padding:'10px',background:C.acc,color:'#fff',border:'none',borderRadius:6,fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Agregar</button>
              </div>
            </div>
            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'.7rem 1rem',borderBottom:`1px solid ${C.brd}`,fontWeight:600,fontSize:13}}>Lista de empleados ({emps.length})</div>
              <div style={{padding:'.5rem'}}>
                {emps.map(e=>(
                  <div key={e.name} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderBottom:`1px solid ${C.brd}`}}>
                    <span style={{flex:1,fontWeight:500,fontSize:13}}>{e.name}</span>
                    <select value={e.jornada} onChange={ev=>updateJornada(e.name,ev.target.value)} style={{fontSize:11,padding:'4px 6px',border:`1px solid ${C.brd}`,borderRadius:4,fontFamily:'inherit',color:e.jornada==='media'?C.ylw:C.acc}}>
                      <option value="completa">Completa</option>
                      <option value="media">Media</option>
                    </select>
                    <button onClick={()=>removeEmp(e.name)} style={{fontSize:18,color:C.red,background:'none',border:'none',cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==='config'&&(
          <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'.7rem 1rem',borderBottom:`1px solid ${C.brd}`,fontWeight:600,fontSize:13}}>Horas de jornada</div>
              <div style={{padding:'1rem',display:'flex',flexDirection:'column',gap:12}}>
                {[['Jornada completa (horas/día)',cfgC,setCfgC],['Media jornada (horas/día)',cfgM,setCfgM]].map(([lbl,val,setter])=>(
                  <div key={lbl}>
                    <label style={lSt}>{lbl}</label>
                    <input type="number" min="1" max="14" value={val} onChange={e=>setter(Number(e.target.value))} style={{...iSt,fontSize:15,fontFamily:'monospace'}} />
                  </div>
                ))}
                <div style={{fontSize:11,color:C.tx2,padding:'8px 12px',background:C.bg,borderRadius:6,lineHeight:1.7}}>
                  Completa: <b>{cfgC}h</b>/día · Media: <b>{cfgM}h</b>/día<br/>
                  Descuento automatico: Lun–Vie 1h comida · Sáb 15min desayuno.<br/>
                  Checkbox "No tomó descanso" cancela el descuento ese dia.
                </div>
                <button onClick={applyCfg} style={{width:'100%',padding:'10px',background:C.acc,color:'#fff',border:'none',borderRadius:6,fontFamily:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>Guardar configuración</button>
              </div>
            </div>
            <div style={{background:C.sur,border:`1px solid ${C.brd}`,borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'.7rem 1rem',borderBottom:`1px solid ${C.brd}`,fontWeight:600,fontSize:13}}>Correo del jefe</div>
              <div style={{padding:'1rem'}}>
                <label style={lSt}>Correo para reportes</label>
                <input type="email" placeholder="jefe@empresa.com" value={bossEmail} onChange={e=>{setBossEmail(e.target.value);sSet('rh:bossEmail',e.target.value)}} style={iSt} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:C.sur,borderTop:`1px solid ${C.brd}`,display:'flex',zIndex:50,boxShadow:'0 -2px 10px rgba(0,0,0,.06)'}}>
        {[
          {id:'registro',  icon:'📋', label:'Registro'},
          {id:'empleados', icon:'👥', label:'Empleados'},
          {id:'config',    icon:'⚙️', label:'Ajustes'},
        ].map(({id,icon,label})=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'10px 4px 8px',background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,color:tab===id?C.acc:C.tx3,fontFamily:'inherit',transition:'color .12s'}}>
            <span style={{fontSize:20}}>{icon}</span>
            <span style={{fontSize:10,fontWeight:tab===id?600:400}}>{label}</span>
            {tab===id&&<div style={{width:20,height:2,background:C.acc,borderRadius:2}}/>}
          </button>
        ))}
      </div>

      {showReport&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setShowReport(false)}>
          <div style={{background:'#fff',borderRadius:'16px 16px 0 0',width:'100%',maxWidth:640,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'1rem',borderBottom:`1px solid ${C.brd}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <b style={{fontSize:15}}>Reporte · {fmtD(monday)} – {fmtD(addDays(monday,5))}</b>
              <button onClick={()=>setShowReport(false)} style={{background:'none',border:'none',fontSize:24,cursor:'pointer',color:C.tx3,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:'1rem',overflowY:'auto',flex:1}}>
              <div style={{background:C.bg,borderRadius:6,padding:'1rem',fontFamily:'monospace',fontSize:11,lineHeight:1.9,whiteSpace:'pre-wrap',border:`1px solid ${C.brd}`,maxHeight:260,overflowY:'auto',marginBottom:'1rem'}}>
                {buildReport()}
              </div>
            </div>
            <div style={{padding:'.875rem 1rem',borderTop:`1px solid ${C.brd}`,display:'flex',gap:8,flexWrap:'wrap'}}>
              <button onClick={copyRep}   style={{flex:1,padding:'10px',border:`1px solid ${C.brd}`,borderRadius:6,background:'transparent',fontFamily:'inherit',fontSize:12,cursor:'pointer'}}>📋 Copiar</button>
              <button onClick={sendWA}    style={{flex:1,padding:'10px',border:'none',borderRadius:6,background:'#25D366',color:'#fff',fontFamily:'inherit',fontSize:12,fontWeight:600,cursor:'pointer'}}>💬 WhatsApp</button>
              <button onClick={sendEmail} style={{flex:1,padding:'10px',border:'none',borderRadius:6,background:C.acc,color:'#fff',fontFamily:'inherit',fontSize:12,fontWeight:600,cursor:'pointer'}}>✉️ Correo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
