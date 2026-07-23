// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK DE WHATSAPP → REGISTRO DE ASISTENCIA
// Función serverless para Vercel. Recibe mensajes de WhatsApp (Meta Cloud API),
// interpreta el nombre + hora, y guarda entrada/salida en Supabase — usando
// EXACTAMENTE la misma estructura de datos que tu app (rh:week:YYYY-MM-DD).
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

// ── Variables de entorno (se configuran en Vercel) ──
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const WA_TOKEN          = process.env.WA_TOKEN          // Token permanente de Meta
const WA_PHONE_ID       = process.env.WA_PHONE_ID       // ID del número de WhatsApp
const WA_VERIFY_TOKEN   = process.env.WA_VERIFY_TOKEN   // Token que TÚ inventas para verificar
const ALLOWED_NUMBER    = process.env.WA_ALLOWED_NUMBER // Tu número (solo tú puedes registrar)

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
    return { reply: '📋 *Cómo registrar:*\n\n• Nombre solo: `Mario` (hora actual)\n• Con hora: `Mario 8:00 am`\n\n• 1er mensaje del día = ENTRADA\n• 2do mensaje del día = SALIDA\n\n*Corregir:*\n• `corregir Mario` — borra su día\n• `corregir Mario 8:10` — cambia entrada\n• `corregir Mario salida 6pm` — cambia salida\n\n_Otros:_ `lista`, `hoy`' }
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

  // ── Comando CORREGIR ──
  const corrMatch = limpio.match(/^corregir\s+(.+)$/i)
  if (corrMatch) {
    const resto = corrMatch[1].trim()
    const conHora = resto.match(/^(.+?)\s+(?:(entrada|salida)\s+)?(\d{1,2}(:\d{2})?\s*(am|pm)?)\s*$/i)
    let nombreCorr, tipoCorr = null, horaCorrTxt = null
    if (conHora) { nombreCorr = conHora[1].trim(); tipoCorr = conHora[2] ? conHora[2].toLowerCase() : null; horaCorrTxt = conHora[3].trim() }
    else { nombreCorr = resto }

    const { match: empC, ambiguous: ambC, options: optC } = matchEmpleado(nombreCorr, empleados)
    if (ambC) return { reply: `🤔 Varios coinciden con "${nombreCorr}": ${optC.join(', ')}. Usa el nombre completo.` }
    if (!empC) return { reply: `❌ No encontré a "${nombreCorr}" para corregir.` }

    const week = await sGet(weekKey) || {}
    const regActual = (week[empC] || {})[dkey]
    if (!regActual || (!regActual.entry && !regActual.exit)) {
      return { reply: `ℹ️ *${empC}* no tiene registros hoy.\nEscribe \`${empC}\` para registrar su entrada.` }
    }

    // Sin hora → borra el día
    if (!horaCorrTxt) {
      if (week[empC]) delete week[empC][dkey]
      await sSet(weekKey, week)
      return { reply: `🗑️ *${empC}* — registros de hoy borrados.\nEscribe \`${empC}\` para volver a registrar.` }
    }

    const horaCorr = parseHora(horaCorrTxt)
    if (!horaCorr) return { reply: `⚠️ No entendí la hora "${horaCorrTxt}".` }
    if (!tipoCorr) tipoCorr = 'entrada'
    const tipoKey = tipoCorr === 'salida' ? 'exit' : 'entry'

    if (tipoKey === 'exit' && regActual.entry && horaCorr <= regActual.entry)
      return { reply: `⚠️ La salida (${fmt12(horaCorr)}) no puede ser antes o igual que la entrada (${fmt12(regActual.entry)}).` }
    if (tipoKey === 'entry' && regActual.exit && horaCorr >= regActual.exit)
      return { reply: `⚠️ La entrada (${fmt12(horaCorr)}) no puede ser después o igual que la salida (${fmt12(regActual.exit)}).` }

    if (!week[empC]) week[empC] = {}
    if (!week[empC][dkey]) week[empC][dkey] = {}
    week[empC][dkey][tipoKey] = horaCorr
    await sSet(weekKey, week)
    return { reply: `✏️ *${empC}* — ${tipoCorr === 'salida' ? 'SALIDA' : 'ENTRADA'} corregida a ${fmt12(horaCorr)}` }
  }

  // ── Registro normal: nombre [+ hora opcional] ──
  let nombre = limpio, horaTxt = null
  const m = limpio.match(/^(.+?)\s+(\d{1,2}(:\d{2})?\s*(am|pm)?)\s*$/i)
  if (m) { nombre = m[1].trim(); horaTxt = m[2].trim() }

  const { match: emp, ambiguous, options } = matchEmpleado(nombre, empleados)
  if (ambiguous) return { reply: `🤔 Varios coinciden con "${nombre}":\n${options.join(', ')}\n\nEscribe el nombre completo.` }
  if (!emp) return { reply: `❌ No encontré a "${nombre}" en la lista.\nEscribe \`lista\` para ver los empleados.` }

  let hora
  if (horaTxt) { hora = parseHora(horaTxt); if (!hora) return { reply: `⚠️ No entendí la hora "${horaTxt}".\nEjemplos: \`8:00 am\`, \`6 pm\`, \`18:30\`` } }
  else { hora = horaActual }

  // Cargar semana, aplicar lógica POR ORDEN
  const week = await sGet(weekKey) || {}
  if (!week[emp]) week[emp] = {}
  if (!week[emp][dkey]) week[emp][dkey] = {}
  const actual = week[emp][dkey]

  if (!actual.entry) {
    actual.entry = hora
    await sSet(weekKey, week)
    return { reply: `✅ *${emp}* — ENTRADA registrada\n🟢 ${fmt12(hora)}` }
  } else if (!actual.exit) {
    if (hora <= actual.entry)
      return { reply: `⚠️ La salida (${fmt12(hora)}) no puede ser antes o igual que la entrada (${fmt12(actual.entry)}).\n\nSi la entrada está mal: \`corregir ${emp} ${fmt12(hora).replace(' ','')}\`` }
    actual.exit = hora
    await sSet(weekKey, week)
    return { reply: `✅ *${emp}* — SALIDA registrada\n🟢 ${fmt12(actual.entry)} → 🔴 ${fmt12(hora)}` }
  } else {
    return { reply: `ℹ️ *${emp}* ya tiene entrada y salida hoy:\n🟢 ${fmt12(actual.entry)} → 🔴 ${fmt12(actual.exit)}\n\n_Para corregir:_\n• \`corregir ${emp}\`\n• \`corregir ${emp} salida 6pm\`` }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENVIAR RESPUESTA POR WHATSAPP
// ═══════════════════════════════════════════════════════════════════════════

async function enviarWhatsApp(to, texto) {
  const url = `https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } })
  })
  if (!res.ok) console.error('enviarWhatsApp fallo:', res.status, await res.text())
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL (lo que Vercel ejecuta)
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {

  // ── Verificación del webhook (Meta hace un GET al configurarlo) ──
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // ── Mensajes entrantes (POST) ──
  if (req.method === 'POST') {
    try {
      const entry = req.body?.entry?.[0]
      const change = entry?.changes?.[0]
      const value = change?.value
      const msg = value?.messages?.[0]

      // Si no es un mensaje de texto, responder 200 y salir (evita reintentos de Meta)
      if (!msg || msg.type !== 'text') return res.status(200).json({ ok: true })

      const from = msg.from            // número que envió
      const texto = msg.text.body

      // ── Seguridad: solo tu número puede registrar ──
      if (ALLOWED_NUMBER && from !== ALLOWED_NUMBER) {
        await enviarWhatsApp(from, '🔒 Este bot es privado y no está autorizado para tu número.')
        return res.status(200).json({ ok: true })
      }

      const { reply } = await procesarMensaje(texto)
      await enviarWhatsApp(from, reply)   // confirmación siempre (como pediste)

      return res.status(200).json({ ok: true })
    } catch (e) {
      console.error('Error procesando webhook:', e)
      return res.status(200).json({ ok: true })  // 200 igual, para que Meta no reintente en bucle
    }
  }

  return res.status(405).send('Method Not Allowed')
}
