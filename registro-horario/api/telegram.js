// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK DE TELEGRAM → REGISTRO DE ASISTENCIA
// Función serverless para Vercel. Recibe mensajes del bot de Telegram y se los
// pasa al mismo cerebro que usa WhatsApp (lib/registro.js): mismos comandos,
// mismos lotes, misma base de datos.
//
// Variables de entorno (Vercel):
//   TELEGRAM_BOT_TOKEN        token que da @BotFather
//   TELEGRAM_WEBHOOK_SECRET   texto que TÚ inventas; Telegram lo manda en cada
//                             petición y así sabemos que viene de Telegram
//   TELEGRAM_ALLOWED_USER_ID  tu ID numérico de Telegram. Mientras no esté
//                             configurado, el bot solo te responde con tu ID
//                             (modo configuración) y no registra nada.
// ═══════════════════════════════════════════════════════════════════════════

import { procesarMensaje } from '../lib/registro.js'

const TG_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const TG_SECRET  = process.env.TELEGRAM_WEBHOOK_SECRET
const TG_ALLOWED = (process.env.TELEGRAM_ALLOWED_USER_ID || '').trim()

// ── Comandos estilo Telegram → texto que entiende el cerebro ──
// "/start" → "ayuda" · "/hoy@MiBot" → "hoy" · "/corregir Mario 8:10" → "corregir Mario 8:10"
// Lo que no empieza con "/" pasa tal cual.
function normalizarComando(texto) {
  const t = (texto || '').trim()
  const m = t.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i)
  if (!m) return t
  const cmd = m[1].toLowerCase()
  const resto = (m[2] || '').trim()
  if (cmd === 'start' || cmd === 'help') return 'ayuda'
  return resto ? `${cmd} ${resto}` : cmd
}

// ── Enviar respuesta ──
// El cerebro escribe con el formato de WhatsApp (*negritas*, _cursivas_,
// `código`), que coincide con el Markdown básico de Telegram. Si Telegram no
// logra interpretarlo (p. ej. un guion bajo suelto en un nombre), se reenvía
// como texto plano para que la confirmación nunca se pierda.
async function enviarTelegram(chatId, texto) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`
  const enviar = body => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  let res = await enviar({ chat_id: chatId, text: texto, parse_mode: 'Markdown' })
  if (res.ok) return
  const detalle = await res.text()

  if (res.status === 400) {
    res = await enviar({ chat_id: chatId, text: texto })
    if (res.ok) return
    console.error('enviarTelegram (texto plano) falló:', res.status, await res.text())
    return
  }
  console.error('enviarTelegram falló:', res.status, detalle)
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {

  // GET: comprobación rápida desde el navegador de que la función existe
  if (req.method === 'GET') return res.status(200).send('Webhook de Telegram activo')
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  // ── Solo Telegram conoce el secreto ──
  // Sin secreto configurado, se rechaza todo (falla cerrado).
  if (!TG_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== TG_SECRET) {
    return res.status(401).send('Unauthorized')
  }

  try {
    const msg = req.body?.message
    // Fotos, stickers, mensajes editados, etc.: se ignoran sin error
    if (!msg || typeof msg.text !== 'string') return res.status(200).json({ ok: true })

    const chatId = msg.chat.id
    const userId = String(msg.from?.id ?? '')

    // ── Modo configuración: todavía no sabemos cuál es tu ID ──
    if (!TG_ALLOWED) {
      await enviarTelegram(chatId,
        `🔧 *Modo configuración*\n\nTu ID de Telegram es: \`${userId}\`\n\n` +
        `Guárdalo en Vercel como \`TELEGRAM_ALLOWED_USER_ID\` y vuelve a desplegar. ` +
        `Mientras tanto no registro nada.`)
      return res.status(200).json({ ok: true })
    }

    // ── Solo tú puedes registrar; a los demás se les ignora en silencio ──
    if (userId !== TG_ALLOWED) {
      console.log('Usuario de Telegram no autorizado:', userId)
      return res.status(200).json({ ok: true })
    }

    const { reply } = await procesarMensaje(normalizarComando(msg.text))
    await enviarTelegram(chatId, reply)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Error procesando webhook de Telegram:', e)
    return res.status(200).json({ ok: true })   // 200 igual, para que Telegram no reintente en bucle
  }
}
