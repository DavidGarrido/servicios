/* =============================================
   PROCLIUP — animations.js
   Neural network · counters · 3D tilt · stagger · magnetic
   ============================================= */

(function () {
  'use strict';

  const SKY      = '#00bcfe';
  const VIOLET   = '#8d54ff';
  const REDUCED  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================================================
     SCROLL PROGRESS BAR
  ================================================ */
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.id = 'scroll-progress';
    document.body.prepend(bar);
    window.addEventListener('scroll', () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    }, { passive: true });
  }

  /* ================================================
     HERO — NEURAL NETWORK CANVAS
  ================================================ */
  function initHeroCanvas() {
    if (REDUCED) return;
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'hero-canvas';
    hero.prepend(canvas);
    const ctx = canvas.getContext('2d');

    const COUNT    = window.innerWidth < 640 ? 35 : 65;
    const MAX_DIST = 130;
    const SPEED    = 0.35;
    let W, H, particles;
    let mouse = { x: -9999, y: -9999 };
    let raf;

    class Particle {
      constructor() { this.reset(true); }
      reset(rand) {
        this.x  = rand ? Math.random() * W : (Math.random() > 0.5 ? 0 : W);
        this.y  = Math.random() * H;
        this.vx = (Math.random() - 0.5) * SPEED * 2;
        this.vy = (Math.random() - 0.5) * SPEED * 2;
        this.r  = Math.random() * 1.8 + 0.8;
        this.hue = Math.random() > 0.5 ? SKY : VIOLET;
      }
    }

    function resize() {
      W = canvas.width  = hero.offsetWidth;
      H = canvas.height = hero.offsetHeight;
      if (!particles) particles = Array.from({ length: COUNT }, () => new Particle());
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse repulsion
        const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
        const md  = Math.hypot(mdx, mdy);
        if (md < 90 && md > 0) {
          const force = (90 - md) / 90 * 0.4;
          p.vx += (mdx / md) * force;
          p.vy += (mdy / md) * force;
        }

        // Speed cap + gentle drag
        const spd = Math.hypot(p.vx, p.vy);
        if (spd > SPEED * 2.5) { p.vx *= 0.92; p.vy *= 0.92; }

        p.x += p.vx;
        p.y += p.vy;

        // Soft bounce
        if (p.x < 0)  { p.x = 0;  p.vx = Math.abs(p.vx); }
        if (p.x > W)  { p.x = W;  p.vx = -Math.abs(p.vx); }
        if (p.y < 0)  { p.y = 0;  p.vy = Math.abs(p.vy); }
        if (p.y > H)  { p.y = H;  p.vy = -Math.abs(p.vy); }

        // Draw node with glow
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        glow.addColorStop(0, p.hue + 'cc');
        glow.addColorStop(1, p.hue + '00');
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.hue;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const q    = particles[j];
          const dist = Math.hypot(p.x - q.x, p.y - q.y);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.45;
            const grad  = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
            grad.addColorStop(0, p.hue);
            grad.addColorStop(1, q.hue);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = grad;
            ctx.globalAlpha = alpha;
            ctx.lineWidth   = 0.8;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();

    window.addEventListener('resize', resize, { passive: true });
    hero.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    hero.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

    // Pause when off-screen
    const heroObs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!raf) draw(); }
      else { cancelAnimationFrame(raf); raf = null; }
    });
    heroObs.observe(hero);
  }

  /* ================================================
     HERO — WORD REVEAL
  ================================================ */
  function initWordReveal() {
    window.triggerWordReveal = function () {
      const title = document.querySelector('.hero-title');
      if (!title || title.dataset.revealed) return;
      title.dataset.revealed = '1';

      title.querySelectorAll(':scope > span').forEach((span, si) => {
        const isHighlight = span.classList.contains('hero-title-highlight');
        const words = span.textContent.trim().split(/\s+/);
        span.innerHTML = words.map((w, wi) => {
          const delay = (si * 4 + wi) * 75;
          return `<span class="word-reveal${isHighlight ? ' word-reveal--hl' : ''}" style="animation-delay:${delay}ms">${w}</span>`;
        }).join('<span class="word-space"> </span>');
      });
    };
  }

  /* ================================================
     STATS — COUNTER ANIMATION
  ================================================ */
  function initCounters() {
    if (REDUCED) return;
    const els = document.querySelectorAll('.stat-number');
    if (!els.length) return;

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        const el  = e.target;
        const raw = el.textContent.trim();
        const num = parseFloat(raw);
        if (isNaN(num)) return;
        const suffix   = raw.replace(/[\d.]/g, '');
        const duration = 1400;
        const start    = performance.now();
        function step(now) {
          const t    = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(num * ease) + suffix;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });

    els.forEach(el => obs.observe(el));
  }

  /* ================================================
     CARDS — 3D TILT
  ================================================ */
  function initCardTilt() {
    if (REDUCED) return;
    const SELECTORS = '.service-card, .package-card, .project-card, .testimonial-card, .process-step';
    function attach() {
      document.querySelectorAll(SELECTORS).forEach(card => {
        if (card.dataset.tilt) return;
        card.dataset.tilt = '1';
        card.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
        card.style.willChange = 'transform';

        card.addEventListener('mousemove', e => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width  - 0.5;
          const y = (e.clientY - r.top)  / r.height - 0.5;
          card.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(10px) scale(1.025)`;
          card.style.boxShadow = `${-x * 12}px ${-y * 12}px 32px rgba(0,188,254,0.12), 0 8px 24px rgba(0,0,0,0.3)`;
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = '';
          card.style.boxShadow = '';
        });
      });
    }
    window.attachCardTilt = attach;
    attach();
  }

  /* ================================================
     GRIDS — STAGGER ENTRANCE
  ================================================ */
  function initStagger() {
    if (REDUCED) return;
    const GRID_SEL = '.services-grid, .packages-grid, .projects-grid, .testimonials-grid, .process-grid';

    function observe() {
      document.querySelectorAll(GRID_SEL).forEach(grid => {
        if (grid.dataset.staggerObs) return;
        grid.dataset.staggerObs = '1';
        const obs = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) return;
          obs.disconnect();
          Array.from(grid.children).forEach((child, i) => {
            child.style.opacity = '0';
            child.style.animationDelay = `${i * 90}ms`;
            child.classList.add('stagger-in');
          });
        }, { threshold: 0.1 });
        obs.observe(grid);
      });
    }

    window.attachStagger = observe;
    observe();
  }

  /* ================================================
     PROCESS — LINE DRAW
  ================================================ */
  function initProcessLine() {
    if (REDUCED) return;
    const grid = document.querySelector('.process-grid');
    if (!grid || grid.dataset.lineAdded) return;
    grid.dataset.lineAdded = '1';

    const line = document.createElement('div');
    line.className = 'process-line-anim';
    grid.prepend(line);

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { line.classList.add('draw'); obs.disconnect(); }
    }, { threshold: 0.3 });
    obs.observe(grid);
  }

  /* ================================================
     BUTTONS — MAGNETIC
  ================================================ */
  function initMagnetic() {
    if (REDUCED) return;
    function attach() {
      document.querySelectorAll('.btn-primary').forEach(btn => {
        if (btn.dataset.mag) return;
        btn.dataset.mag = '1';
        btn.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        btn.addEventListener('mousemove', e => {
          const r = btn.getBoundingClientRect();
          const x = (e.clientX - r.left - r.width  / 2) * 0.22;
          const y = (e.clientY - r.top  - r.height / 2) * 0.22;
          btn.style.transform = `translate(${x}px, ${y}px)`;
        });
        btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
      });
    }
    window.attachMagnetic = attach;
    attach();
  }

  /* ================================================
     HOOK — called by main.js after each render
  ================================================ */
  window.onTranslationsApplied = function () {
    window.attachCardTilt?.();
    window.attachStagger?.();
    window.attachMagnetic?.();
    window.triggerWordReveal?.();
  };

  /* ================================================
     BOOT
  ================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    initScrollProgress();
    initHeroCanvas();
    initWordReveal();
    initCounters();
    initCardTilt();
    initStagger();
    initProcessLine();
    initMagnetic();
  });

})();
