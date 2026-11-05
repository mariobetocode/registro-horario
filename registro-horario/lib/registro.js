// ═══════════════════════════════════════════════════════════════════════════
// CEREBRO DEL REGISTRO DE ASISTENCIA — compartido por todos los canales
// (WhatsApp, Telegram). Interpreta "nombre [hora]", lotes, corregir, hoy,
// lista y ayuda, y guarda en Supabase con la misma estructura que la app web
// (rh:week:YYYY-MM-DD). No sabe nada del canal: recibe texto, devuelve texto.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)


// ── Constantes de fecha (igual que la app) ──
const DKEYS = ['Mon','Tue','Wed','Thu','Fri','Sat']

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES (idénticas a las del simulador ya validado)
// ═══════════════════════════════════════════════════════════════════════════

const normName = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()


function parseHora(txt) {
  if (!txt) return null
  let t = txt.toLowerCase().replace(/\s+/g,'').trim()
  let ampm = null
  if (t.includes('am')) { ampm = 'am'; t = t.replace('am','') }
  else if (t.includes('pm')) { ampm = 'pm'; t = t.replace('pm','') }
  let h, m = 0
  if (t.includes(':')) { const [hh,mm] = t.split(':'); h = parseInt(hh); m = parseInt(mm) || 0 }
  else { h = parseInt(t) }
  if (isNaN(h) || h < 0 || h > 23 || m < 0 || m > 59) return null
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function fmt12(t) {
  if (!t) return ''
  let [h,m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12; if (h === 0) h = 12
  return `${h}:${String(m).padStart(2,'0')} ${ap}`
}

// ── Fecha/hora en zona horaria de México (Pachuca = America/Mexico_City) ──
function ahoraMexico() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false, weekday:'short'
  })
  const parts = {}
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value
  // parts: year, month, day, hour, minute, weekday
  const fecha = `${parts.year}-${parts.month}-${parts.day}`
  const hora  = `${parts.hour}:${parts.minute}`
  const wdMap = { Mon:'Mon', Tue:'Tue', Wed:'Wed', Thu:'Thu', Fri:'Fri', Sat:'Sat', Sun:'Sun' }
  return { fecha, hora, weekday: wdMap[parts.weekday] || 'Mon' }
}

// ── Lunes de la semana que contiene una fecha YYYY-MM-DD ──
function mondayOf(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const dy = d.getDay()
  d.setDate(d.getDate() - dy + (dy === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}

// ── Día de la semana (Mon..Sat) de una fecha ──
function dkeyOf(fechaStr) {
  const dy = new Date(fechaStr + 'T12:00:00').getDay()
  return dy === 0 ? 'Sat' : DKEYS[dy - 1]  // domingo cae fuera; se trata como Sat por seguridad
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESO A DATOS (Supabase key-value, igual que la app)
// ═══════════════════════════════════════════════════════════════════════════

async function sGet(key) {
  const { data, error } = await supabase.from('storage').select('value').eq('key', key).maybeSingle()
  if (error) { console.error('sGet', error); return null }
  return data ? data.value : null
}

async function sSet(key, value) {
  const { error } = await supabase.from('storage')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) { console.error('sSet', error); throw error }
}

async function getEmpleados() {
  const raw = await sGet('rh:employees')
  if (!raw) return []
  // La app guarda [{name, jornada}]; extraemos solo los nombres
  return raw.map(e => typeof e === 'string' ? e : e.name)
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH DE EMPLEADO
// ═══════════════════════════════════════════════════════════════════════════

function matchEmpleado(nombre, empleados) {
  const n = normName(nombre)
  let found = empleados.find(e => normName(e) === n)
  if (found) return { match: found, ambiguous: false }
  const partial = empleados.filter(e => normName(e).startsWith(n))
  if (partial.length === 1) return { match: partial[0], ambiguous: false }
  if (partial.length > 1)  return { match: null, ambiguous: true, options: partial }
  return { match: null, ambiguous: false }
}

// ═══════════════════════════════════════════════════════════════════════════
// EL CEREBRO: procesa un mensaje y devuelve { reply, accion }
// (misma lógica validada en el simulador)
// ═══════════════════════════════════════════════════════════════════════════

async function procesarMensaje(texto) {
  const limpio = (texto || '').trim()
  const empleados = await getEmpleados()
  const { fecha, hora: horaActual } = ahoraMexico()

  if (!limpio) return { reply: '⚠️ Mensaje vacío. Escribe `ayuda` para ver cómo usarme.' }

  // ── Comandos ──
  if (normName(limpio) === 'ayuda' || limpio === '?') {
    return { reply: '📋 *Cómo registrar:*\n\n• Nombre solo: `Mario` (hora actual)\n• Con hora: `Mario 8:00 am`\n\n• 1er registro del día = ENTRADA\n• 2do registro del día = SALIDA\n\n*Varios de una vez* (recomendado):\n• `catalina 6pm, fermin 6pm, rosa 6pm`\n• `6pm: catalina, fermin, rosa`\n  _(la hora del inicio aplica a todos)_\n\nTambién sirve uno por renglón. Un solo mensaje de respuesta para todo el lote.\n\n*Corregir:*\n• `corregir Mario` — borra su día\n• `corregir Mario 8:10` — cambia entrada\n• `corregir Mario salida 6pm` — cambia salida\n\n_Otros:_ `lista`, `hoy`' }
  }
  if (normName(limpio) === 'lista') {
    if (empleados.length === 0) return { reply: '⚠️ No hay empleados cargados en la app todavía.' }
    return { reply: '👥 *Empleados:*\n' + empleados.join(', ') }
  }

  const weekKey = `rh:week:${mondayOf(fecha)}`
  const dkey = dkeyOf(fecha)

  if (normName(limpio) === 'hoy') {
    const week = await sGet(weekKey) || {}
    const lineas = []
    for (const emp of empleados) {
      const r = (week[emp] || {})[dkey]
      if (r && (r.entry || r.exit)) {
        lineas.push(`• ${emp}: ${r.entry ? '🟢 '+fmt12(r.entry) : ''}${r.exit ? ' → 🔴 '+fmt12(r.exit) : r.entry ? ' (sin salida)' : ''}`)
      }
    }
    if (lineas.length === 0) return { reply: '📅 Aún no hay registros hoy.' }
    return { reply: '📅 *Registros de hoy:*\n\n' + lineas.join('\n') }
  }

  // ── Registros múltiples en un solo mensaje ──
  // "catalina 6pm, fermin 6pm" se separa por coma, punto y coma o salto de línea.
  // Prefijo de hora compartida: "6pm: catalina, fermin" aplica esa hora a todos
  // los que no traigan la suya.
  let horaComun = null
  let cuerpo = limpio
  const pref = limpio.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*:\s*([\s\S]+)$/i)
  if (pref && /[a-záéíóúñ]/i.test(pref[2])) {
    const h = parseHora(pref[1])
    if (h) { horaComun = h; cuerpo = pref[2].trim() }
  }

  const partes = cuerpo.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
  if (partes.length === 0) return { reply: '⚠️ Mensaje vacío. Escribe `ayuda` para ver cómo usarme.' }
  if (partes.length > 40) return { reply: '⚠️ Demasiados registros en un mensaje (máximo 40). Mándalo en dos partes.' }

  // La semana se lee UNA vez y se guarda UNA vez, traiga el mensaje uno o veinte
  // registros: así un solo mensaje de respuesta cubre todo el lote.
  const week = await sGet(weekKey) || {}
  const resultados = partes.map(parte =>
    procesarItem(parte, { week, dkey, empleados, horaActual, horaComun })
  )
  const guardados = resultados.filter(r => r.changed).length
  if (guardados > 0) await sSet(weekKey, week)

  // Un solo registro → respuesta detallada de siempre
  if (resultados.length === 1) return { reply: resultados[0].detail }

  // Varios → un único resumen (1 mensaje de servicio en vez de N)
  const fallos = resultados.length - guardados
  const enc = fallos === 0
    ? `✅ ${guardados} registro${guardados === 1 ? '' : 's'} guardado${guardados === 1 ? '' : 's'}`
    : `✅ ${guardados} guardado${guardados === 1 ? '' : 's'} · ⚠️ ${fallos} sin registrar`
  return { reply: enc + '\n\n' + resultados.map(r => r.line).join('\n') }
}

// ═══════════════════════════════════════════════════════════════════════════
// UN REGISTRO INDIVIDUAL, aplicado sobre el objeto `week` que ya está en memoria.
// No lee ni escribe en Supabase: de eso se encarga procesarMensaje una sola vez.
// Devuelve { changed, line (compacta, para lotes), detail (completa, para 1 solo) }
// ═══════════════════════════════════════════════════════════════════════════

function procesarItem(texto, ctx) {
  const { week, dkey, empleados, horaActual, horaComun } = ctx
  const limpio = (texto || '').trim()
  const nada = (line, detail) => ({ changed: false, line, detail: detail || line })

  // ── corregir <nombre> [entrada|salida] [hora] ──
  const corrMatch = limpio.match(/^corregir\s+(.+)$/i)
  if (corrMatch) {
    const resto = corrMatch[1].trim()
    const conHora = resto.match(/^(.+?)\s+(?:(entrada|salida)\s+)?(\d{1,2}(:\d{2})?\s*(am|pm)?)\s*$/i)
    let nombreCorr, tipoCorr = null, horaCorrTxt = null
    if (conHora) { nombreCorr = conHora[1].trim(); tipoCorr = conHora[2] ? conHora[2].toLowerCase() : null; horaCorrTxt = conHora[3].trim() }
    else { nombreCorr = resto }

    const { match: empC, ambiguous: ambC, options: optC } = matchEmpleado(nombreCorr, empleados)
    if (ambC) return nada(`🤔 "${nombreCorr}" — varios: ${optC.join(', ')}`)
    if (!empC) return nada(`❌ "${nombreCorr}" — no está en la lista`)

    const regActual = (week[empC] || {})[dkey]
    if (!regActual || (!regActual.entry && !regActual.exit)) {
      return nada(`ℹ️ ${empC} — sin registros hoy`,
        `ℹ️ *${empC}* no tiene registros hoy.\nEscribe \`${empC}\` para registrar su entrada.`)
    }

    // Sin hora → borra el día
    if (!horaCorrTxt) {
      delete week[empC][dkey]
      return { changed: true,
        line: `🗑️ ${empC} — día borrado`,
        detail: `🗑️ *${empC}* — registros de hoy borrados.\nEscribe \`${empC}\` para volver a registrar.` }
    }

    const horaCorr = parseHora(horaCorrTxt)
    if (!horaCorr) return nada(`⚠️ ${empC} — hora "${horaCorrTxt}" no entendida`)
    if (!tipoCorr) tipoCorr = 'entrada'
    const tipoKey = tipoCorr === 'salida' ? 'exit' : 'entry'

    if (tipoKey === 'exit' && regActual.entry && horaCorr <= regActual.entry)
      return nada(`⚠️ ${empC} — salida ${fmt12(horaCorr)} no puede ser antes de la entrada ${fmt12(regActual.entry)}`)
    if (tipoKey === 'entry' && regActual.exit && horaCorr >= regActual.exit)
      return nada(`⚠️ ${empC} — entrada ${fmt12(horaCorr)} no puede ser después de la salida ${fmt12(regActual.exit)}`)

    week[empC][dkey][tipoKey] = horaCorr
    const etiqueta = tipoCorr === 'salida' ? 'SALIDA' : 'ENTRADA'
    return { changed: true,
      line: `✏️ ${empC} — ${tipoCorr} → ${fmt12(horaCorr)}`,
      detail: `✏️ *${empC}* — ${etiqueta} corregida a ${fmt12(horaCorr)}` }
  }

  // ── Registro normal: nombre [+ hora opcional] ──
  let nombre = limpio, horaTxt = null
  const m = limpio.match(/^(.+?)\s+(\d{1,2}(:\d{2})?\s*(am|pm)?)\s*$/i)
  if (m) { nombre = m[1].trim(); horaTxt = m[2].trim() }

  const { match: emp, ambiguous, options } = matchEmpleado(nombre, empleados)
  if (ambiguous) return nada(`🤔 "${nombre}" — varios: ${options.join(', ')}`,
    `🤔 Varios coinciden con "${nombre}":\n${options.join(', ')}\n\nEscribe el nombre completo.`)
  if (!emp) return nada(`❌ "${nombre}" — no está en la lista`,
    `❌ No encontré a "${nombre}" en la lista.\nEscribe \`lista\` para ver los empleados.`)

  let hora
  if (horaTxt) {
    hora = parseHora(horaTxt)
    if (!hora) return nada(`⚠️ ${emp} — hora "${horaTxt}" no entendida`,
      `⚠️ No entendí la hora "${horaTxt}".\nEjemplos: \`8:00 am\`, \`6 pm\`, \`18:30\``)
  } else {
    hora = horaComun || horaActual   // la hora compartida del prefijo manda sobre la actual
  }

  if (!week[emp]) week[emp] = {}
  if (!week[emp][dkey]) week[emp][dkey] = {}
  const actual = week[emp][dkey]

  if (!actual.entry) {
    actual.entry = hora
    return { changed: true,
      line: `🟢 ${emp} — entrada ${fmt12(hora)}`,
      detail: `✅ *${emp}* — ENTRADA registrada\n🟢 ${fmt12(hora)}` }
  }
  if (!actual.exit) {
    if (hora <= actual.entry)
      return nada(`⚠️ ${emp} — salida ${fmt12(hora)} no puede ser antes de la entrada ${fmt12(actual.entry)}`,
        `⚠️ La salida (${fmt12(hora)}) no puede ser antes o igual que la entrada (${fmt12(actual.entry)}).\n\nSi la entrada está mal: \`corregir ${emp} ${fmt12(hora).replace(' ','')}\``)
    actual.exit = hora
    return { changed: true,
      line: `🔴 ${emp} — salida ${fmt12(hora)}`,
      detail: `✅ *${emp}* — SALIDA registrada\n🟢 ${fmt12(actual.entry)} → 🔴 ${fmt12(hora)}` }
  }
  return nada(`ℹ️ ${emp} — ya tenía entrada y salida`,
    `ℹ️ *${emp}* ya tiene entrada y salida hoy:\n🟢 ${fmt12(actual.entry)} → 🔴 ${fmt12(actual.exit)}\n\n_Para corregir:_\n• \`corregir ${emp}\`\n• \`corregir ${emp} salida 6pm\``)
}

export { procesarMensaje }
