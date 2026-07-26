/* ==========================================================================
   site.js — navigation, catalogue rendering, cart, filters, forms, motion
   Front-end only. Nothing here talks to a server; the cart lives in
   localStorage and "checkout" opens a demo dialog.
   ========================================================================== */
(function () {
  'use strict';

  var INR = function (n) { return '₹' + n.toLocaleString('en-IN'); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ------------------------------------------------------------------ *
   * Catalogue — demo stock list
   * ------------------------------------------------------------------ */
  var PRODUCTS = [
    { id: 'or-01', name: 'Sakura Red Oranda', variety: 'oranda', group: 'oranda',
      price: 6800, size: '4 in', origin: 'Bangkok, Thailand', tag: 'New arrival', rating: 5, stock: 4, featured: true },
    { id: 'rc-01', name: 'Red Cap Oranda — Show Grade', variety: 'redcap', group: 'oranda',
      price: 9400, was: 10800, size: '4.5 in', origin: 'Bangkok, Thailand', tag: 'Show grade', rating: 5, stock: 2, featured: true },
    { id: 'ry-01', name: 'Japanese Ryukin — Deep Body', variety: 'ryukin', group: 'ryukin',
      price: 12500, size: '5 in', origin: 'Nagoya, Japan', tag: 'Import', rating: 5, stock: 1, featured: true },
    { id: 'ra-01', name: 'Ranchu — Champion Bloodline', variety: 'ranchu', group: 'ranchu',
      price: 18500, size: '4 in', origin: 'Osaka, Japan', tag: 'Collector', rating: 5, stock: 1, featured: true },
    { id: 'li-01', name: 'Jumbo Lionhead', variety: 'lionhead', group: 'ranchu',
      price: 7900, size: '5 in', origin: 'Guangzhou, China', tag: 'Jumbo', rating: 4, stock: 3 },
    { id: 'bm-01', name: 'Velvet Black Moor', variety: 'blackmoor', group: 'fancyeye',
      price: 2400, size: '3 in', origin: 'Guangzhou, China', tag: 'Beginner friendly', rating: 5, stock: 8, featured: true },
    { id: 'te-01', name: 'Red Dragon-Eye Telescope', variety: 'telescope', group: 'fancyeye',
      price: 3600, size: '3.5 in', origin: 'Bangkok, Thailand', tag: null, rating: 4, stock: 5 },
    { id: 'ca-01', name: 'Calico Shubunkin', variety: 'calico', group: 'single',
      price: 1450, size: '4 in', origin: 'Kolkata, India', tag: 'Hardy', rating: 4, stock: 12, featured: true },
    { id: 'pa-01', name: 'Panda Oranda', variety: 'panda', group: 'oranda',
      price: 8200, size: '4 in', origin: 'Bangkok, Thailand', tag: 'Rare', rating: 5, stock: 2 },
    { id: 'pe-01', name: 'Golf Ball Pearlscale', variety: 'pearlscale', group: 'ranchu',
      price: 5600, size: '3 in', origin: 'Bangkok, Thailand', tag: null, rating: 4, stock: 6 },
    { id: 'bu-01', name: 'Chocolate Bubble Eye', variety: 'bubbleeye', group: 'fancyeye',
      price: 4300, size: '3.5 in', origin: 'Guangzhou, China', tag: 'Specialist', rating: 4, stock: 3 },
    { id: 'co-01', name: 'Sarasa Comet — Pond Grade', variety: 'comet', group: 'single',
      price: 950, size: '5 in', origin: 'Mumbai, India', tag: 'Pond', rating: 4, stock: 24 },
    { id: 'or-02', name: 'Tri-colour Oranda', variety: 'oranda', group: 'oranda',
      price: 11200, size: '4.5 in', origin: 'Bangkok, Thailand', tag: 'Show grade', rating: 5, stock: 2 },
    { id: 'ry-02', name: 'Calico Ryukin', variety: 'ryukin', group: 'ryukin',
      price: 8900, was: 9800, size: '4 in', origin: 'Nagoya, Japan', tag: null, rating: 5, stock: 3 },
    { id: 'bm-02', name: 'Butterfly Tail Moor', variety: 'blackmoor', group: 'fancyeye',
      price: 5200, size: '3.5 in', origin: 'Bangkok, Thailand', tag: 'New arrival', rating: 5, stock: 4 },
    { id: 'ra-02', name: 'Sakura Ranchu — Juvenile', variety: 'ranchu', group: 'ranchu',
      price: 4600, size: '2.5 in', origin: 'Osaka, Japan', tag: null, rating: 4, stock: 7 }
  ];

  var BY_ID = {};
  PRODUCTS.forEach(function (p, i) { p.seed = (i + 1) * 977; BY_ID[p.id] = p; });

  /* ------------------------------------------------------------------ *
   * Small view helpers
   * ------------------------------------------------------------------ */
  function starsMarkup(n) {
    var star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
    return '<span class="stars" aria-label="' + n + ' out of 5">' + new Array(n + 1).join(star) + '</span>';
  }

  function stockLine(p) {
    if (p.stock === 0) return '<span style="color:var(--muted-2)">Sold out</span>';
    if (p.stock <= 2) return '<span style="color:var(--coral);font-weight:700">Only ' + p.stock + ' left</span>';
    return '<span>' + p.stock + ' available</span>';
  }

  function cardMarkup(p) {
    var tag = p.tag
      ? '<span class="fish-card__tag' + (p.tag === 'Show grade' || p.tag === 'Collector' ? ' fish-card__tag--gold' : '') + '">' + p.tag + '</span>'
      : '';
    if (p.stock === 0) tag = '<span class="fish-card__tag fish-card__tag--sold">Sold out</span>';
    return '' +
      '<article class="fish-card" data-id="' + p.id + '" data-reveal>' +
        '<div class="fish-card__media">' +
          '<canvas data-fish="' + p.variety + '" data-seed="' + p.seed + '" aria-hidden="true"></canvas>' +
          tag +
          '<button class="fish-card__fav" type="button" aria-label="Save ' + p.name + '">' +
            '<svg viewBox="0 0 24 24"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4l8.8 8.8 8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fish-card__body">' +
          '<div class="fish-card__title">' + p.name + '</div>' +
          '<div class="fish-card__meta">' +
            '<span>◈ ' + p.size + '</span>' +
            '<span>✈ ' + p.origin + '</span>' +
          '</div>' +
          '<div class="fish-card__meta">' + starsMarkup(p.rating) + stockLine(p) + '</div>' +
          '<div class="fish-card__foot">' +
            '<div class="price">' + INR(p.price) +
              (p.was ? '<s>' + INR(p.was) + '</s>' : '') +
              '<br><small>incl. bagging &amp; oxygen</small>' +
            '</div>' +
            '<button class="btn btn--primary btn--sm" type="button" data-add="' + p.id + '"' +
              (p.stock === 0 ? ' disabled style="opacity:.45;cursor:not-allowed"' : '') + '>' +
              (p.stock === 0 ? 'Notify me' : 'Reserve') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  // Canvases added after page load still need a fish swimming in them.
  function mountNewCanvases(root) {
    if (!window.Aquarium) return;
    $$('[data-fish]', root).forEach(function (c) {
      if (c.getAttribute('data-mounted')) return;
      c.setAttribute('data-mounted', '1');
      window.Aquarium.mountPortrait(
        c,
        c.getAttribute('data-fish'),
        parseInt(c.getAttribute('data-seed'), 10) || 11
      );
    });
  }

  function renderGrid(el, list) {
    if (!list.length) {
      el.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/></svg>' +
        '<h3 style="margin-bottom:.4rem">Nothing in this tank yet</h3>' +
        '<p>Try another variety, or clear the filters to see everything we have in stock.</p></div>';
      return;
    }
    el.innerHTML = list.map(cardMarkup).join('');
    mountNewCanvases(el);
    observeReveals(el);
  }

  /* ------------------------------------------------------------------ *
   * Cart
   * ------------------------------------------------------------------ */
  var CART_KEY = 'gfh_demo_cart';
  var cart = [];

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      cart = raw.filter(function (l) { return BY_ID[l.id] && l.qty > 0; })
                .map(function (l) { return { id: l.id, qty: Math.min(l.qty, 9) }; });
    } catch (e) { cart = []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ }
  }
  function cartCount() {
    return cart.reduce(function (n, l) { return n + l.qty; }, 0);
  }
  function cartTotal() {
    return cart.reduce(function (n, l) { return n + BY_ID[l.id].price * l.qty; }, 0);
  }
  function addToCart(id) {
    var line = cart.filter(function (l) { return l.id === id; })[0];
    if (line) { line.qty = Math.min(line.qty + 1, 9); }
    else { cart.push({ id: id, qty: 1 }); }
    saveCart(); paintCart();
    toast(BY_ID[id].name + ' reserved');
  }
  function setQty(id, delta) {
    var line = cart.filter(function (l) { return l.id === id; })[0];
    if (!line) return;
    line.qty += delta;
    if (line.qty < 1) cart = cart.filter(function (l) { return l.id !== id; });
    saveCart(); paintCart();
  }
  function removeLine(id) {
    cart = cart.filter(function (l) { return l.id !== id; });
    saveCart(); paintCart();
  }

  function paintCart() {
    var badge = $('[data-cart-count]');
    if (badge) {
      var n = cartCount();
      badge.textContent = n;
      badge.classList.toggle('is-on', n > 0);
    }
    var body = $('[data-cart-body]');
    if (!body) return;

    if (!cart.length) {
      body.innerHTML = '<div class="empty-state">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/></svg>' +
        '<h3 style="margin-bottom:.35rem">Your tank is empty</h3>' +
        '<p class="small">Reserve a fish and it will wait here for you.</p></div>';
    } else {
      body.innerHTML = cart.map(function (l) {
        var p = BY_ID[l.id];
        return '<div class="cart-line">' +
          '<div class="cart-line__thumb"><canvas data-fish="' + p.variety + '" data-seed="' + p.seed + '" aria-hidden="true"></canvas></div>' +
          '<div class="cart-line__info">' +
            '<b>' + p.name + '</b><span>' + p.size + ' · ' + p.origin + '</span>' +
            '<div class="qty">' +
              '<button type="button" data-qty="-1" data-id="' + p.id + '" aria-label="Decrease quantity">−</button>' +
              '<span>' + l.qty + '</span>' +
              '<button type="button" data-qty="1" data-id="' + p.id + '" aria-label="Increase quantity">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="cart-line__price">' + INR(p.price * l.qty) +
            '<button class="cart-line__remove" type="button" data-remove="' + p.id + '">Remove</button>' +
          '</div>' +
        '</div>';
      }).join('');
      mountNewCanvases(body);
    }

    var total = $('[data-cart-total]');
    if (total) total.textContent = INR(cartTotal());
    var checkout = $('[data-checkout]');
    if (checkout) checkout.disabled = !cart.length;
  }

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  function toast(msg) {
    var stack = $('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg><span></span>';
    el.lastChild.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 320);
    }, 2400);
  }

  /* ------------------------------------------------------------------ *
   * Scroll reveals
   * ------------------------------------------------------------------ */
  var revealObserver = null;
  function observeReveals(root) {
    var items = $$('[data-reveal]', root || document);
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e, i) {
          if (!e.isIntersecting) return;
          var el = e.target;
          setTimeout(function () { el.classList.add('is-visible'); }, Math.min(i, 6) * 70);
          revealObserver.unobserve(el);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    items.forEach(function (el) {
      if (!el.classList.contains('is-visible')) revealObserver.observe(el);
    });
  }

  /* ------------------------------------------------------------------ *
   * Counting stats
   * ------------------------------------------------------------------ */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var decimals = (String(target).split('.')[1] || '').length;
    var t0 = null, dur = 1400;
    function step(now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function init() {
    /* ---- header + mobile nav ---- */
    var header = $('.site-header');
    if (header) {
      var onScroll = function () {
        header.classList.toggle('is-stuck', window.scrollY > 12);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    var toggle = $('.nav__toggle'), links = $('.nav__links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('is-open');
        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          links.classList.remove('is-open');
          toggle.classList.remove('is-open');
        }
      });
    }

    /* ---- demo ribbon ---- */
    var bar = $('.demo-bar');
    if (bar) {
      if (sessionStorage.getItem('gfh_bar_closed')) bar.remove();
      var close = $('.demo-bar__close', bar);
      if (close) close.addEventListener('click', function () {
        bar.remove();
        try { sessionStorage.setItem('gfh_bar_closed', '1'); } catch (e) {}
      });
    }

    /* ---- catalogue grids ---- */
    var featured = $('[data-grid="featured"]');
    if (featured) {
      renderGrid(featured, PRODUCTS.filter(function (p) { return p.featured; }).slice(0, 6));
    }

    var shop = $('[data-grid="shop"]');
    if (shop) {
      var state = { group: 'all', sort: 'featured' };
      var count = $('[data-result-count]');

      var apply = function () {
        var list = PRODUCTS.filter(function (p) {
          return state.group === 'all' || p.group === state.group;
        });
        if (state.sort === 'low') list.sort(function (a, b) { return a.price - b.price; });
        else if (state.sort === 'high') list.sort(function (a, b) { return b.price - a.price; });
        else if (state.sort === 'new') list.sort(function (a, b) {
          return (b.tag === 'New arrival') - (a.tag === 'New arrival');
        });
        renderGrid(shop, list);
        if (count) {
          count.textContent = list.length + (list.length === 1 ? ' fish' : ' fish') + ' in stock';
        }
      };

      $$('[data-filter]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          $$('[data-filter]').forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          state.group = btn.getAttribute('data-filter');
          apply();
        });
      });
      var sortSel = $('[data-sort]');
      if (sortSel) sortSel.addEventListener('change', function () {
        state.sort = sortSel.value; apply();
      });
      apply();
    }

    /* ---- cart ---- */
    loadCart();
    paintCart();

    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      if (add && !add.disabled) { addToCart(add.getAttribute('data-add')); return; }

      var fav = e.target.closest('.fish-card__fav');
      if (fav) {
        var on = fav.classList.toggle('is-on');
        toast(on ? 'Saved to your list' : 'Removed from your list');
        return;
      }

      var qty = e.target.closest('[data-qty]');
      if (qty) { setQty(qty.getAttribute('data-id'), parseInt(qty.getAttribute('data-qty'), 10)); return; }

      var rm = e.target.closest('[data-remove]');
      if (rm) { removeLine(rm.getAttribute('data-remove')); return; }
    });

    var drawer = $('.drawer'), backdrop = $('.drawer-backdrop');
    var openCart = function () {
      if (!drawer) return;
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    var closeCart = function () {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    $$('[data-open-cart]').forEach(function (b) { b.addEventListener('click', openCart); });
    $$('[data-close-cart]').forEach(function (b) { b.addEventListener('click', closeCart); });
    if (backdrop) backdrop.addEventListener('click', closeCart);

    /* ---- modal ---- */
    var modal = $('.modal-backdrop');
    var openModal = function () { if (modal) modal.classList.add('is-open'); };
    var closeModal = function () { if (modal) modal.classList.remove('is-open'); };
    $$('[data-close-modal]').forEach(function (b) { b.addEventListener('click', closeModal); });
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    var checkoutBtn = $('[data-checkout]');
    if (checkoutBtn) checkoutBtn.addEventListener('click', function () {
      closeCart(); openModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeCart(); closeModal(); }
    });

    /* ---- accordions ---- */
    $$('.acc__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var acc = btn.closest('.acc');
        var panel = $('.acc__panel', acc);
        var open = acc.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0px';
      });
    });

    /* ---- contact form (validated client-side, then a success state) ---- */
    var form = $('[data-contact-form]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = true;
        $$('.field', form).forEach(function (field) {
          var input = $('input, textarea, select', field);
          if (!input || !input.required) return;
          var val = (input.value || '').trim();
          var bad = !val;
          if (!bad && input.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
          if (!bad && input.type === 'tel') bad = val.replace(/\D/g, '').length < 8;
          field.classList.toggle('has-error', bad);
          if (bad) ok = false;
        });
        if (!ok) { toast('Please check the highlighted fields'); return; }
        form.style.display = 'none';
        var done = $('[data-form-success]');
        if (done) {
          done.classList.add('is-on');
          done.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      $$('input, textarea, select', form).forEach(function (input) {
        input.addEventListener('input', function () {
          var f = input.closest('.field');
          if (f) f.classList.remove('has-error');
        });
      });
      var resetBtn = $('[data-form-reset]');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        form.reset();
        form.style.display = '';
        $('[data-form-success]').classList.remove('is-on');
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    /* ---- newsletter ---- */
    $$('[data-subscribe]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input', f);
        if (!input.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) {
          toast('Enter a valid email address'); return;
        }
        input.value = '';
        toast('You are on the list — new stock lands every Thursday');
      });
    });

    /* ---- button ripples ---- */
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('.btn');
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var span = document.createElement('span');
      span.className = 'btn__ripple';
      var size = Math.max(r.width, r.height) * 2.2;
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - r.left) + 'px';
      span.style.top = (e.clientY - r.top) + 'px';
      btn.appendChild(span);
      setTimeout(function () { span.remove(); }, 620);
    });

    /* ---- counters + reveals ---- */
    var counters = $$('[data-count]');
    if (counters.length && 'IntersectionObserver' in window) {
      var co = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          countUp(en.target);
          co.unobserve(en.target);
        });
      }, { threshold: 0.4 });
      counters.forEach(function (c) { co.observe(c); });
    } else {
      counters.forEach(countUp);
    }
    observeReveals(document);

    /* ---- footer year ---- */
    $$('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
