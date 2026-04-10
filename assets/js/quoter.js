/* =============================================
   PROCLIUP — Cotizador IA
   Requiere: worker/quoter-worker.js desplegado en Cloudflare
   ============================================= */

const WORKER_URL      = 'https://procliup-quoter.www-davidalexander.workers.dev';
const TELEGRAM_HANDLE = 'TELEGRAM_BOT_PLACEHOLDER';            // Reemplazar con handle real

let servicesCache  = null;
let lastAIResponse = null;
let lastClientText = '';

/* ---- Carga services.json (lazy) ---- */
async function loadServices() {
  if (servicesCache) return servicesCache;
  const res = await fetch('assets/data/services.json');
  servicesCache = await res.json();
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
        <ul>${lastAIResponse.questions.map(q => `<li>${q}</li>`).join('')}</ul>
      </div>`;
  }

  html += `
    <div class="qr-actions">
      <a href="${buildTelegramURL(rows, totalMin, totalMax)}"
         target="_blank" rel="noopener noreferrer"
         class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
        </svg>
        ${t('quoter.telegramCta')}
      </a>
    </div>`;

  container.innerHTML = html;
  container.classList.remove('hidden');
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

  clearError();
  document.getElementById('quoter-result')?.classList.add('hidden');
  setLoading(true);

  try {
    const [res] = await Promise.all([
      fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }),
      loadServices(), // popula servicesCache como efecto secundario
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
});
