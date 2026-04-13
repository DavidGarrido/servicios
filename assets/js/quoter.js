/* =============================================
   PROCLIUP — Cotizador IA
   Requiere: worker/quoter-worker.js desplegado en Cloudflare
   ============================================= */

const WORKER_URL      = 'https://procliup-quoter.www-davidalexander.workers.dev';
const TELEGRAM_HANDLE = 'TELEGRAM_BOT_PLACEHOLDER';            // Reemplazar con handle real
// URL del Apps Script — se configura en el Worker como secret SHEETS_WEBHOOK_URL

let servicesCache  = null;
let lastAIResponse = null;
let lastClientText = '';
let existingQuote  = null; // cotización previa del cliente (por email)

/* ---- Carga services.json siempre fresco desde red ---- */
async function loadServices() {
  const res = await fetch('assets/data/services.json', { cache: 'no-store' });
  servicesCache = await res.json(); // sobreescribe siempre
  return servicesCache;
}

/* ---- Todos los servicios en un array plano ---- */
function allServices(data) {
  return [...data.base, ...data.modules, ...data.integrations, ...data.infrastructure];
}

/* ---- Busca un servicio por código ---- */
function findService(data, code) {
  return allServices(data).find(s => s.code === code);
}

/* ---- Formatea número a COP ---- */
function cop(n) {
  return '$' + n.toLocaleString('es-CO');
}

/* ---- Textos i18n (lee la variable global de main.js) ---- */
function t(key) {
  return getNestedKey(translations, key) || key;
}

/* ---- Renderiza la tabla de resultados ---- */
function renderResult() {
  const container = document.getElementById('quoter-result');
  if (!container || !lastAIResponse || !servicesCache) return;

  const lang = currentLang || 'es';
  const nameKey = lang === 'en' ? 'name_en' : 'name_es';

  // Soporta nuevo formato { services: [{code, reason}] } y legado { codes: [] }
  const rawServices = lastAIResponse.services
    || (lastAIResponse.codes || []).map(code => ({ code, reason: '' }));

  const rows = rawServices
    .map(({ code, reason }) => ({ code, reason: reason || '', svc: findService(servicesCache, code) }))
    .filter(r => r.svc);

  const totalMin = rows.reduce((s, r) => s + r.svc.price_min, 0);
  const totalMax = rows.reduce((s, r) => s + r.svc.price_max, 0);

  let html = `
    <div class="qr-meta">
      <p class="qr-summary">${lastAIResponse.summary || ''}</p>
      <span class="qr-confidence">${Math.round((lastAIResponse.confidence || 0) * 100)}% ${t('quoter.confidence')}</span>
    </div>

    <div class="qr-table-wrap">
      <table class="qr-table">
        <thead>
          <tr>
            <th>${t('quoter.thService')}</th>
            <th>${t('quoter.thCode')}</th>
            <th>${t('quoter.thRange')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ code, reason, svc }) => {
            const suffix = svc.monthly ? '/mes' : svc.per_hour ? '/h' : '';
            return `
              <tr>
                <td>
                  <span class="svc-name">${svc[nameKey] || svc.name_es}</span>
                  ${reason ? `<span class="svc-reason">${reason}</span>` : ''}
                </td>
                <td><code class="svc-code">${code}</code></td>
                <td class="price-cell">${cop(svc.price_min)} – ${cop(svc.price_max)}${suffix}</td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="total-label">${t('quoter.total')}</td>
            <td class="price-cell total-price">${cop(totalMin)} – ${cop(totalMax)} COP</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  if (lastAIResponse.questions?.length) {
    html += `
      <div class="qr-questions">
        <p class="qr-questions-title">${t('quoter.questionsTitle')}</p>
        ${lastAIResponse.questions.map((q, i) => `
          <div class="qr-question-item">
            <label class="qr-question-label">${q}</label>
            <textarea class="quoter-textarea qr-question-input" rows="2" data-question="${i}" placeholder="Tu respuesta..."></textarea>
          </div>`).join('')}
        <button class="btn btn-secondary qr-refine-btn" onclick="refineQuote()">${t('quoter.refineCta')}</button>
      </div>`;
  }

  const clientName = document.getElementById('quoter-name')?.value.trim();
  html += `
    <div class="qr-actions">
      <p class="qr-saved-notice">✓ ${clientName ? `${clientName}, h` : 'H'}emos guardado tu solicitud. Te contactaremos pronto.</p>
    </div>`;

  const isSameProject = existingQuote && lastAIResponse.is_same_project === true;

  if (existingQuote) {
    const fecha = new Date(existingQuote.timestamp).toLocaleDateString('es-CO');
    html += `
      <div class="qr-existing-notice">
        <p>${isSameProject
          ? `Solicitud vinculada a tu cotización del <strong>${fecha}</strong> — cotización actualizada.`
          : `Proyecto diferente a tu cotización del <strong>${fecha}</strong> — guardada como nueva.`
        }</p>
      </div>`;
  }

  container.innerHTML = html;
  container.classList.remove('hidden');

  saveQuotation(rows, totalMin, totalMax, isSameProject);
}

/* ---- Construye la URL de Telegram con el mensaje pre-escrito ---- */
function buildTelegramURL(rows, totalMin, totalMax) {
  const lang = currentLang || 'es';
  const nameKey = lang === 'en' ? 'name_en' : 'name_es';

  const lines = rows.map(({ code, svc }) =>
    `- ${svc[nameKey] || svc.name_es} (${code}) — ${cop(svc.price_min)} – ${cop(svc.price_max)} COP`
  ).join('\n');

  const msg = `Hola Procliup, generé una cotización automática en su sitio web:

📋 Lo que necesito:
${lastClientText}

🤖 Servicios detectados:
${lines}

💰 Estimado total: ${cop(totalMin)} – ${cop(totalMax)} COP

¿Podemos hablar para afinar los detalles?`;

  return `https://t.me/${TELEGRAM_HANDLE}?text=${encodeURIComponent(msg)}`;
}

/* ---- Muestra / oculta el estado de carga ---- */
function setLoading(on) {
  const btn   = document.getElementById('quoter-btn');
  const label = document.getElementById('quoter-btn-label');
  const spin  = document.getElementById('quoter-spinner');
  if (!btn) return;
  btn.disabled = on;
  if (label) label.textContent = on ? t('quoter.loading') : t('quoter.cta');
  if (spin)  spin.classList.toggle('hidden', !on);
}

/* ---- Muestra un error ---- */
function showError(msg) {
  const el = document.getElementById('quoter-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  const el = document.getElementById('quoter-error');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

/* ---- Handler principal: enviar cotización ---- */
async function submitQuote() {
  const input = document.getElementById('quoter-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) { showError(t('quoter.errorEmpty')); return; }

  console.log('[quoter] existingQuote al submit:', existingQuote);

  clearError();
  document.getElementById('quoter-result')?.classList.add('hidden');
  setLoading(true);

  try {
    const [res] = await Promise.all([
      fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          ...(existingQuote ? {
            existing_text:     existingQuote.text     || '',
            existing_summary:  existingQuote.summary  || '',
            existing_services: existingQuote.services || '',
          } : {}),
        }),
      }),
      loadServices(),
    ]);

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Error del servidor');
    }

    lastAIResponse = data;
    lastClientText = text;
    renderResult();

  } catch (err) {
    showError(t('quoter.errorWorker') + (err.message ? ` (${err.message})` : ''));
  } finally {
    setLoading(false);
  }
}

/* ---- Guarda cotización en Google Sheets vía Worker (evita CORS) ---- */
async function saveQuotation(rows, totalMin, totalMax, doUpdate) {
  const lang = currentLang || 'es';
  const nameKey = lang === 'en' ? 'name_en' : 'name_es';
  const saved = fetch(WORKER_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      log:             true,
      update:          doUpdate === true,
      row_index:       doUpdate === true ? existingQuote?.row_index : null,
      timestamp:       new Date().toISOString(),
      client_name:     document.getElementById('quoter-name')?.value.trim()  || '',
      client_email:    document.getElementById('quoter-email')?.value.trim() || '',
      client_phone:    document.getElementById('quoter-phone')?.value.trim() || '',
      text:            lastClientText,
      summary:         lastAIResponse.summary    || '',
      confidence:      lastAIResponse.confidence || 0,
      services:        rows.map(r => r.code).join(', '),
      services_detail: rows.map(r => `${r.code}: ${r.reason || (r.svc[nameKey] || r.svc.name_es)}`).join(' | '),
      services_prices: rows.map(r => `${r.code}: ${cop(r.svc.price_min)}–${cop(r.svc.price_max)}`).join(' | '),
      budget_min:      totalMin,
      budget_max:      totalMax,
      questions:       (lastAIResponse.questions || []).join(' | '),
    }),
  });
  try {
    const res      = await saved;
    const data     = await res.json();
    const rowIndex = data.sheets?.row_index || existingQuote?.row_index;
    if (rowIndex) {
      // Mantener existingQuote actualizado para refinadas posteriores
      existingQuote = {
        row_index: rowIndex,
        text:      lastClientText,
        summary:   lastAIResponse?.summary  || '',
        services:  rows.map(r => r.code).join(', '),
      };
    }
  } catch { /* silencioso */ }
}

/* ---- Muestra/oculta el formulario principal ---- */
function showMainForm(prefill = '') {
  const form = document.getElementById('quoter-main-form');
  const btn  = document.getElementById('quoter-btn');
  const input = document.getElementById('quoter-input');
  if (form) form.classList.remove('hidden');
  if (btn)  btn.classList.remove('hidden');
  if (input && prefill) input.value = prefill;
  form?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---- Tabla resumen de cotización existente ---- */
async function renderExistingTable(quote) {
  const el = document.getElementById('quoter-existing-table');
  if (!el) return;
  const lang    = currentLang || 'es';
  const nameKey = lang === 'en' ? 'name_en' : 'name_es';
  const svcData = servicesCache || await loadServices();
  const codes   = (quote.services || '').split(',').map(c => c.trim()).filter(Boolean);
  const rows    = codes.map(code => ({ code, svc: findService(svcData, code) })).filter(r => r.svc);

  if (!rows.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="qr-table-wrap" style="margin-top:12px">
      <table class="qr-table">
        <thead><tr><th>${t('quoter.thService')}</th><th>${t('quoter.thCode')}</th><th>${t('quoter.thRange')}</th></tr></thead>
        <tbody>
          ${rows.map(({ code, svc }) => `
            <tr>
              <td><span class="svc-name">${svc[nameKey] || svc.name_es}</span></td>
              <td><code class="svc-code">${code}</code></td>
              <td class="price-cell">${cop(svc.price_min)} – ${cop(svc.price_max)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="2" class="total-label">${t('quoter.total')}</td>
          <td class="price-cell total-price">${cop(quote.budget_min)} – ${cop(quote.budget_max)} COP</td>
        </tr></tfoot>
      </table>
    </div>`;
}

/* ---- Lookup de cotización existente por email ---- */
async function checkExistingQuote(email) {
  existingQuote = null;
  const choiceEl  = document.getElementById('quoter-existing-choice');
  const msgEl     = document.getElementById('quoter-existing-msg');
  const statusEl  = document.getElementById('quoter-lookup-status');
  const form      = document.getElementById('quoter-main-form');
  const btn       = document.getElementById('quoter-btn');

  form?.classList.add('hidden');
  btn?.classList.add('hidden');
  choiceEl?.classList.add('hidden');

  if (!email) { showMainForm(); return; }

  if (statusEl) { statusEl.textContent = 'Buscando cotizaciones anteriores…'; statusEl.classList.remove('hidden'); }

  try {
    const res  = await fetch(`${WORKER_URL}?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    if (data.found) {
      existingQuote = data;
      const fecha = new Date(data.timestamp).toLocaleDateString('es-CO');
      if (msgEl) msgEl.innerHTML = `Tienes una cotización activa del <strong>${fecha}</strong>. ¿Qué deseas hacer?`;
      if (statusEl) statusEl.classList.add('hidden');
      await renderExistingTable(data);
      choiceEl?.classList.remove('hidden');
    } else {
      if (statusEl) statusEl.classList.add('hidden');
      showMainForm();
    }
  } catch {
    if (statusEl) statusEl.classList.add('hidden');
    showMainForm();
  }
}

/* ---- Re-envía cotización con respuestas a las preguntas de la IA ---- */
async function refineQuote() {
  const inputs = document.querySelectorAll('.qr-question-input');
  const qa = [];
  inputs.forEach(input => {
    const i   = input.dataset.question;
    const q   = lastAIResponse.questions[i];
    const ans = input.value.trim();
    if (ans) qa.push(`- ${q} → ${ans}`);
  });

  if (!qa.length) return;

  // Asegurar que existingQuote tenga el contexto actual para que la IA
  // siempre identifique esto como el mismo proyecto
  if (!existingQuote) existingQuote = {};
  existingQuote.text     = lastClientText;
  existingQuote.summary  = lastAIResponse?.summary  || '';
  existingQuote.services = (lastAIResponse?.services || []).map(s => s.code).join(', ');

  const refinedText = `${lastClientText}\n\nRespuestas a preguntas de aclaración:\n${qa.join('\n')}`;
  document.getElementById('quoter-input').value = refinedText;
  document.getElementById('quoter-result')?.classList.add('hidden');
  await submitQuote();
}

/* ---- Re-renderiza si el idioma cambia con un resultado activo ---- */
window.rerenderQuoterResult = function () {
  if (lastAIResponse) renderResult();
};

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('quoter-btn');
  const input = document.getElementById('quoter-input');

  btn?.addEventListener('click', submitQuote);

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitQuote();
  });

  document.getElementById('quoter-email')?.addEventListener('blur', e => {
    const name = document.getElementById('quoter-name')?.value.trim();
    if (name) checkExistingQuote(e.target.value.trim());
    else if (e.target.value.trim()) checkExistingQuote(e.target.value.trim());
  });

  document.getElementById('btn-continue-quote')?.addEventListener('click', () => {
    document.getElementById('quoter-existing-choice')?.classList.add('hidden');
    showMainForm(existingQuote?.text || '');
  });

  document.getElementById('btn-new-quote')?.addEventListener('click', () => {
    existingQuote = null;
    document.getElementById('quoter-existing-choice')?.classList.add('hidden');
    showMainForm('');
  });
});
