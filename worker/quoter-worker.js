/* =============================================
   PROCLIUP — Cloudflare Worker: Cotizador IA
   Despliegue: https://dash.cloudflare.com → Workers
   Variable de entorno requerida: AI_API_KEY (clave DeepSeek)
   ============================================= */

const SYSTEM_PROMPT = `Eres el asistente de cotización de Procliup, una agencia de desarrollo de software.
Tu tarea es analizar la descripción de un cliente y detectar qué servicios necesita,
devolviendo ÚNICAMENTE un objeto JSON válido, sin texto adicional.

Los servicios disponibles y sus códigos son:

PRODUCTOS BASE:
- WEB-BASIC: sitio web estático simple (landing page, 1-3 secciones, sin backend)
- WEB-STD: sitio web estático estándar (4-6 secciones, animaciones, multiidioma)
- WEB-PRE: sitio web estático premium (diseño a medida, múltiples páginas)
- LAR-BASIC: plataforma web Laravel básica (formularios, CRUD, 1-2 roles)
- LAR-MED: plataforma web Laravel media (múltiples roles, flujos de proceso complejos)
- LAR-COM: plataforma web Laravel compleja (lógica avanzada, integraciones múltiples)
- BOT-SIM: bot de Telegram simple (respuestas fijas, menús)
- BOT-DB: bot de Telegram con consulta a base de datos
- BOT-AI: bot de Telegram con inteligencia artificial integrada
- ECOM-LAR: tienda online / e-commerce a medida en Laravel
- APP-MVP: aplicación móvil MVP (producto mínimo viable, Android/iOS)
- APP-STD: aplicación móvil estándar con funcionalidades avanzadas
- SAAS-MVP: plataforma SaaS (múltiples usuarios, suscripción, onboarding)

MÓDULOS ADD-ON:
- MOD-AUTH: login, registro, roles de usuario (admin, operador, cliente)
- MOD-PAY-MAN: módulo de pagos con verificación manual de comprobantes
- MOD-PAY-GW: integración con pasarela de pagos automática (Wompi, PSE, PayU)
- MOD-TRACK: seguimiento y trazabilidad de procesos por cliente
- MOD-DOC: revisión y aprobación de documentos adjuntos
- MOD-AI: integración con IA para traducción, análisis o respuestas
- MOD-OCR: lectura de documentos escaneados (OCR)
- MOD-QUOTE: cotizador automático por conteo de palabras o características
- MOD-REQ: consulta automática de requisitos desde fuentes externas
- MOD-GLOS: glosario de términos y traducciones
- MOD-PAY-INFO: panel informativo de medios de pago sin lógica de cobro
- MOD-CHAT: chatbot con IA para atención al cliente en el sitio web
- MOD-AUTO: automatización de procesos o notificaciones internas

INTEGRACIONES:
- INT-WOMPI: pasarela Wompi, PSE o PayU
- INT-WA: WhatsApp Business API
- INT-DIAN: facturación electrónica DIAN (Colombia)
- INT-ERP: integración con ERP o CRM externo (HubSpot, Salesforce, etc.)
- INT-API: integración con API de terceros genérica

INFRAESTRUCTURA:
- INF-VPS: configuración de servidor VPS
- INF-MAN: administración mensual del servidor
- SVC-MAINT-BASIC: mantenimiento básico mensual del sitio o plataforma
- SVC-MAINT-PRO: mantenimiento activo mensual con nuevas funcionalidades menores
- CON-TECH: consultoría técnica o diagnóstico

REGLAS:
1. Siempre incluye exactamente UN producto base (WEB-*, LAR-*, BOT-*, ECOM-*, APP-*, SAAS-*).
   Si no puedes determinarlo con certeza, elige el más probable.
2. Incluye todos los módulos e integraciones que se puedan inferir del texto.
3. El campo "confidence" va de 0 a 1 (qué tan seguro estás de la detección).
4. El campo "summary" es una frase corta en español describiendo lo detectado.
5. El campo "questions" lista hasta 2 preguntas clave que aclararían la cotización.
6. El campo "reason" de cada servicio explica en una frase corta por qué se incluye,
   citando directamente lo que el cliente mencionó.
7. Si el cliente menciona algo fuera del catálogo, usa el código más cercano e indica
   la duda en "questions".
8. Responde SOLO con el JSON, sin markdown, sin explicaciones.
   Si el texto contiene respuestas previas (líneas con "→"), NO repitas esas preguntas
   en "questions". Solo haz preguntas sobre aspectos aún no aclarados.
9. Si se incluye una cotización anterior en el contexto:
   - Añade el campo "is_same_project": true si la nueva solicitud es una extensión o
     modificación del mismo proyecto, false si es un proyecto completamente diferente.
   - Si is_same_project es true, la lista "services" debe ser la fusión de los servicios
     anteriores y los nuevos (sin duplicar códigos). Mantén los reasons del servicio más
     completo/reciente.
   - Si is_same_project es false, incluye solo los servicios de la nueva solicitud.

FORMATO DE RESPUESTA:
{
  "services": [
    { "code": "LAR-MED",   "reason": "Necesita múltiples roles y flujos de proceso complejos" },
    { "code": "MOD-AUTH",  "reason": "Requiere login diferenciado para administrador y cliente" },
    { "code": "MOD-TRACK", "reason": "Los clientes deben consultar el estado de su trámite" }
  ],
  "confidence": 0.87,
  "summary": "Plataforma web con gestión de usuarios y seguimiento de procesos",
  "is_same_project": true,
  "questions": [
    "¿Necesita portal de consulta para clientes finales?",
    "¿Requiere módulo de pagos o solo gestión interna?"
  ]
}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsResponse();

    // Lookup de cotización existente por email
    if (request.method === 'GET') {
      const email = new URL(request.url).searchParams.get('email') || '';
      if (!email.trim() || !env.SHEETS_WEBHOOK_URL) {
        return jsonResponse({ found: false });
      }
      try {
        const res = await fetch(`${env.SHEETS_WEBHOOK_URL}?email=${encodeURIComponent(email.trim())}`);
        return jsonResponse(await res.json());
      } catch {
        return jsonResponse({ found: false });
      }
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    // Ruta IA bíblica
    const path = new URL(request.url).pathname;
    if (path === '/bible') {
      const messages = body.messages;
      if (!Array.isArray(messages) || !messages.length) {
        return jsonResponse({ error: 'No messages provided' }, 400);
      }
      const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 1000, temperature: 0.7 }),
      });
      const aiData = await aiRes.json();
      if (aiData.error) return jsonResponse({ error: aiData.error.message }, 502);
      return jsonResponse({ reply: aiData.choices?.[0]?.message?.content || 'Sin respuesta.' });
    }

    // Ruta de logging: el frontend envía cotización ya calculada para guardar en Sheets
    if (body.log === true) {
      if (!env.SHEETS_WEBHOOK_URL) {
        return jsonResponse({ ok: false, reason: 'SHEETS_WEBHOOK_URL not configured' });
      }
      const sheetsRes = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update:          body.update          || false,
          row_index:       body.row_index       || null,
          timestamp:       body.timestamp       || new Date().toISOString(),
          client_name:     body.client_name     || '',
          client_email:    body.client_email    || '',
          client_phone:    body.client_phone    || '',
          text:            body.text            || '',
          summary:         body.summary         || '',
          confidence:      body.confidence      || 0,
          services:        body.services        || '',
          services_detail: body.services_detail || '',
          services_prices: body.services_prices || '',
          budget_min:      body.budget_min      || 0,
          budget_max:      body.budget_max      || 0,
          questions:       body.questions       || '',
        }),
      });
      const sheetsData = await sheetsRes.json().catch(() => ({}));
      return jsonResponse({ ok: true, sheets: sheetsData });
    }

    const text = (body.text || '').trim();
    if (!text) {
      return jsonResponse({ error: 'No text provided' }, 400);
    }

    const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analiza este requerimiento de un cliente y devuelve el JSON de cotización:\n\n"${text}"${
            (body.existing_summary || body.existing_services)
              ? `\n\nContexto: este cliente ya tiene una cotización activa.\n- Descripción original: ${body.existing_text || ''}\n- Resumen anterior: ${body.existing_summary || ''}\n- Servicios anteriores: ${body.existing_services || ''}\n\nSi la nueva solicitud describe el mismo sistema o proyecto (aunque agregue nuevas funcionalidades), is_same_project debe ser true. Solo es false si es claramente un proyecto diferente y sin relación. Incluye "is_same_project" en el JSON.`
              : ''
          }` },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    const aiData = await aiRes.json();

    if (aiData.error) {
      return jsonResponse({ error: aiData.error.message }, 502);
    }

    const raw = aiData.choices[0].message.content.trim();
 
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return jsonResponse({ error: 'La IA devolvió una respuesta inválida' }, 502);
        }
      } else {
        return jsonResponse({ error: 'La IA devolvió una respuesta inválida' }, 502);
      }
    }
 
    return jsonResponse(parsed);

  },
};
