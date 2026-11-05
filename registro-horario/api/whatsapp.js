// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK DE WHATSAPP → REGISTRO DE ASISTENCIA
// Función serverless para Vercel. Recibe mensajes de WhatsApp (Meta Cloud API)
// y se los pasa al cerebro compartido (lib/registro.js).
// ═══════════════════════════════════════════════════════════════════════════

import { procesarMensaje } from '../lib/registro.js'

// ── Variables de entorno (se configuran en Vercel) ──
const WA_TOKEN          = process.env.WA_TOKEN          // Token permanente de Meta
const WA_PHONE_ID       = process.env.WA_PHONE_ID       // ID del número de WhatsApp
const WA_VERIFY_TOKEN   = process.env.WA_VERIFY_TOKEN   // Token que TÚ inventas para verificar
const ALLOWED_NUMBER    = process.env.WA_ALLOWED_NUMBER // Tu número (solo tú puedes registrar)


// ── Normaliza números de teléfono ──
// WhatsApp entrega los celulares de México como 52 + 1 + 10 dígitos (ej. 5217713199870),
// pero la API SOLO acepta enviar a 52 + 10 dígitos (ej. 527713199870).
// Esta función deja ambos en el mismo formato canónico (sin el 1 extra).
function normPhone(num) {
  let n = String(num || '').replace(/\D/g, '')          // solo dígitos
  if (n.startsWith('521') && n.length === 13) n = '52' + n.slice(3)   // México: quita el 1
  if (n.startsWith('549') && n.length === 13) n = '54' + n.slice(3)   // Argentina: mismo caso
  return n
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
      if (ALLOWED_NUMBER && normPhone(from) !== normPhone(ALLOWED_NUMBER)) {
        console.log('Número no autorizado:', from, '(normalizado:', normPhone(from), ') vs permitido:', normPhone(ALLOWED_NUMBER))
        return res.status(200).json({ ok: true })
      }

      const { reply } = await procesarMensaje(texto)
      await enviarWhatsApp(normPhone(from), reply)   // confirmación siempre (número normalizado)

      return res.status(200).json({ ok: true })
    } catch (e) {
      console.error('Error procesando webhook:', e)
      return res.status(200).json({ ok: true })  // 200 igual, para que Meta no reintente en bucle
    }
  }

  return res.status(405).send('Method Not Allowed')
}
