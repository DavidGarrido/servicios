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

  renderServices();
  renderPackages();
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

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', () => {
  loadLang(currentLang);
  initNav();
  initSmoothScroll();
  initAnimations();

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => loadLang(btn.dataset.lang));
  });
});
