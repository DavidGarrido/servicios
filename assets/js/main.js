/* =============================================
   PROCLIUP — i18n + interactions
   ============================================= */

const LANGS = ['es', 'en'];
let currentLang = localStorage.getItem('lang') || 'es';
let translations = {};

/* ---- Load JSON ---- */
async function loadLang(lang) {
  const res = await fetch(`assets/i18n/${lang}.json`);
  translations = await res.json();
  applyTranslations();
  updateLangButtons(lang);
  currentLang = lang;
  localStorage.setItem('lang', lang);
}

/* ---- Apply all [data-i18n] keys ---- */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = getNestedKey(translations, key);
    if (val !== undefined) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const val = getNestedKey(translations, key);
    if (val !== undefined) el.placeholder = val;
  });

  // Swap <title>, <meta description> and <html lang>
  if (translations.meta) {
    document.title = translations.meta.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', translations.meta.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', translations.meta.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', translations.meta.description);
    document.getElementById('html-root')?.setAttribute('lang', translations.meta.lang || 'es');
  }

  renderServices();
  renderPackages();
  renderFaq();
  window.rerenderQuoterResult?.();
  // Trigger animation hooks after DOM is updated
  requestAnimationFrame(() => window.onTranslationsApplied?.());
}

function getNestedKey(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

/* ---- Language buttons ---- */
function updateLangButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

/* ---- Render services grid ---- */
function renderServices() {
  const container = document.getElementById('services-grid');
  if (!container) return;
  const items = translations?.services?.items || [];

  container.innerHTML = items.map(item => `
    <div class="service-card">
      <span class="service-icon">${item.icon}</span>
      <h3 class="service-title">${item.title}</h3>
      <p class="service-desc">${item.description}</p>
    </div>
  `).join('');
}

/* ---- Render packages ---- */
function renderPackages() {
  const container = document.getElementById('packages-grid');
  if (!container) return;
  const items = translations?.packages?.items || [];
  const ctaText = translations?.packages?.cta || 'Consultar';

  container.innerHTML = items.map(item => `
    <div class="package-card ${item.highlight ? 'highlight' : ''}">
      <span class="package-tag">${item.tag}</span>
      <h3 class="package-name">${item.name}</h3>
      <p class="package-desc">${item.description}</p>
      <ul class="package-features">
        ${item.features.map(f => `<li>${f}</li>`).join('')}
      </ul>
      <a href="#contact" class="btn ${item.highlight ? 'btn-primary' : 'btn-secondary'}">${ctaText}</a>
    </div>
  `).join('');
}

/* ---- Nav scroll effect ---- */
function initNav() {
  const nav = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  });
}

/* ---- Smooth scroll for nav links ---- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ---- Intersection observer for fade-in ---- */
function initAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

/* ---- Theme toggle ---- */
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const body = document.body;

  const sunIcon = `<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M3 12h2.25m.386-6.364l1.591 1.591M12 18.75V21" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 7a5 5 0 100 10 5 5 0 000-10z" />`;
  const moonIcon = `<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />`;

  const setTheme = (theme) => {
    if (theme === 'light') {
      body.classList.add('light-theme');
      themeIcon.innerHTML = sunIcon;
    } else {
      body.classList.remove('light-theme');
      themeIcon.innerHTML = moonIcon;
    }
    localStorage.setItem('theme', theme);
  };

  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);

  themeToggle?.addEventListener('click', () => {
    const newTheme = body.classList.contains('light-theme') ? 'dark' : 'light';
    setTheme(newTheme);
  });
}

/* ---- Render FAQ + FAQPage schema ---- */
function renderFaq() {
  const container = document.getElementById('faq-list');
  if (!container) return;
  const items = translations?.faq?.items || [];

  container.innerHTML = items.map((item, i) => `
    <div class="faq-item">
      <button class="faq-question" aria-expanded="false" aria-controls="faq-answer-${i}">
        <span>${item.q}</span>
        <svg class="faq-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="faq-answer" id="faq-answer-${i}" hidden>${item.a}</div>
    </div>
  `).join('');

  container.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const answer = document.getElementById(btn.getAttribute('aria-controls'));
      if (expanded) answer.setAttribute('hidden', '');
      else answer.removeAttribute('hidden');
    });
  });

  // FAQPage schema
  const schemaEl = document.getElementById('faq-schema');
  if (schemaEl && items.length) {
    schemaEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a }
      }))
    });
  }
}

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', () => {
  loadLang(currentLang);
  initNav();
  initSmoothScroll();
  initAnimations();
  initTheme();

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => loadLang(btn.dataset.lang));
  });
});
