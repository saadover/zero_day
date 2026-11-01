/* Hdiya storefront: cart, gift finder, small animations. No dependencies. */
(function () {
  "use strict";
  var S = window.STORE || { t: {} };
  var T = S.t;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var money = function (n) { return Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ") + " " + S.currency; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var ICON = {
    check: '<svg class="i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    plus: '<svg class="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg class="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14"/></svg>'
  };

  /* ---------- Toast ---------- */
  var toastEl = $("[data-toast]"), toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.innerHTML = ICON.check + " " + esc(msg);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ---------- Cart ---------- */
  var CART_KEY = "hdiya_cart";
  var cart = store.get(CART_KEY, []);
  if (!Array.isArray(cart)) cart = [];

  function saveCart() { store.set(CART_KEY, cart); renderCart(); }
  function cartCount() { return cart.reduce(function (n, l) { return n + l.qty; }, 0); }
  function cartSubtotal() { return cart.reduce(function (n, l) { return n + l.qty * l.price; }, 0); }

  function addToCart(item, qty) {
    qty = Math.max(1, Math.min(20, qty || 1));
    var line = cart.find(function (l) { return l.id === item.id; });
    if (line) line.qty = Math.min(20, line.qty + qty);
    else cart.push({ id: item.id, name: item.name, price: item.price, image: item.image, url: item.url, qty: qty });
    saveCart();
    $$("[data-cart-count]").forEach(function (b) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); });
    toast(item.name + " · " + T.added.replace("✓", "").trim());
  }

  function renderCart() {
    var count = cartCount(), sub = cartSubtotal();
    $$("[data-cart-count]").forEach(function (b) { b.textContent = count; b.hidden = !count; });
    var list = $("[data-cart-items]");
    if (!list) return;
    $("[data-cart-empty]").hidden = !!count;
    $("[data-cart-foot]").hidden = !count;
    list.hidden = !count;
    list.innerHTML = cart.map(function (l) {
      return '<div class="line" data-id="' + l.id + '">' +
        '<a href="' + esc(l.url) + '"><img src="' + esc(l.image) + '" alt="" loading="lazy"></a>' +
        '<div><a class="line-name" href="' + esc(l.url) + '">' + esc(l.name) + '</a><div class="line-price">' + money(l.price) + '</div>' +
        '<div class="stepper"><button type="button" data-q="-1" aria-label="-">' + ICON.minus + '</button><span>' + l.qty + '</span><button type="button" data-q="1" aria-label="+">' + ICON.plus + '</button></div></div>' +
        '<div class="line-total">' + money(l.qty * l.price) + '<button type="button" class="line-remove" data-remove>' + esc(T.remove) + '</button></div></div>';
    }).join("");
    $("[data-cart-subtotal]").textContent = money(sub);
    var meter = $("[data-free-meter]");
    if (meter) {
      meter.hidden = !count || !S.freeFrom;
      var pct = S.freeFrom ? Math.min(100, sub * 100 / S.freeFrom) : 100;
      $("i", meter).style.width = pct + "%";
      $("p", meter).textContent = sub >= S.freeFrom ? T.freeOk : T.freeLeft.replace("{x}", money(S.freeFrom - sub));
    }
  }

  var drawer = $("#cart"), scrim = $(".drawer-scrim");
  function openCart() {
    if (!drawer) return;
    scrim.hidden = false;
    requestAnimationFrame(function () { scrim.classList.add("show"); drawer.classList.add("open"); });
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeCart() {
    if (!drawer) return;
    scrim.classList.remove("show");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(function () { scrim.hidden = true; }, 350);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var add = t.closest("[data-add]");
    if (add) {
      e.preventDefault();
      addToCart(JSON.parse(add.getAttribute("data-add")), 1);
      add.classList.add("done");
      add.innerHTML = ICON.check;
      setTimeout(function () { add.classList.remove("done"); add.innerHTML = ICON.plus; }, 1400);
      return;
    }
    if (t.closest("[data-cart-open]")) { e.preventDefault(); openCart(); return; }
    if (t.closest("[data-cart-close]")) { closeCart(); return; }
    var line = t.closest(".line");
    if (line) {
      var id = +line.getAttribute("data-id");
      var l = cart.find(function (x) { return x.id === id; });
      if (!l) return;
      if (t.closest("[data-remove]")) cart = cart.filter(function (x) { return x.id !== id; });
      var q = t.closest("[data-q]");
      if (q) { l.qty += +q.getAttribute("data-q"); if (l.qty < 1) cart = cart.filter(function (x) { return x.id !== id; }); l.qty = Math.min(20, l.qty); }
      saveCart();
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });
  renderCart();

  /* ---------- Header ---------- */
  var topbar = $("#topbar");
  var onScroll = function () { if (topbar) topbar.classList.toggle("scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var st = $("[data-search-toggle]");
  if (st) st.addEventListener("click", function () {
    topbar.classList.add("search-open");
    var input = $(".search input", topbar);
    input.focus();
    input.addEventListener("blur", function () { setTimeout(function () { topbar.classList.remove("search-open"); }, 150); }, { once: true });
  });

  /* ---------- Reveal on scroll ---------- */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -40px 0px", threshold: 0.05 }) : null;
  function observe(root) {
    $$(".reveal:not(.in)", root).forEach(function (el, i) {
      if (!el.style.getPropertyValue("--d") && el.classList.contains("card")) el.style.setProperty("--d", (i % 4) * 70 + "ms");
      if (io) io.observe(el); else el.classList.add("in");
    });
  }
  observe(document);

  /* ---------- Gift finder ---------- */
  var finder = $("[data-finder]");
  if (finder) initFinder(finder);

  function initFinder(form) {
    var rel = $("[data-relations]", form);
    var ageIn = $("[data-age]", form), ageOut = $("[data-age-out]", form), ageFill = $("[data-age-fill]", form);
    var bWrap = $("[data-budget]", form), lo = $("[data-budget-lo]", form), hi = $("[data-budget-hi]", form);
    var bOut = $("[data-budget-out]", form), bFill = $("[data-budget-fill]", form);
    var note = $("textarea", form), err = $("[data-finder-error]", form);
    var rtl = document.documentElement.dir === "rtl";

    // Budget stops: fine steps for small budgets, bigger steps after.
    var bmin = +bWrap.getAttribute("data-min"), bmax = +bWrap.getAttribute("data-max");
    var stops = [];
    for (var v = bmin; v <= bmax; ) {
      stops.push(v);
      v += v < 300 ? 25 : v < 1000 ? 50 : v < 2000 ? 100 : v < 5000 ? 250 : 500;
    }
    if (stops[stops.length - 1] !== bmax) stops.push(bmax);
    lo.max = hi.max = stops.length - 1;

    function nearest(val) { var i = 0; while (i < stops.length - 1 && stops[i] < val) i++; return i; }
    var saved = store.get("hdiya_finder", null);
    lo.value = nearest(saved && saved.min || 150);
    hi.value = nearest(saved && saved.max || 600);

    function fill(el, a, b) {
      el.style[rtl ? "right" : "left"] = a + "%";
      el.style.width = (b - a) + "%";
    }
    function stage(a) { var x = T.ages; return a < 2 ? x[0] : a < 12 ? x[1] : a < 18 ? x[2] : a < 26 ? x[3] : a < 60 ? x[4] : x[5]; }
    function updAge() {
      var a = +ageIn.value;
      ageOut.innerHTML = "<b>" + (a >= 90 ? "90+" : a) + "</b> " + esc(T.years) + " <small>" + esc(stage(a)) + "</small>";
      fill(ageFill, 0, a / 90 * 100);
    }
    function updBudget(e) {
      var a = +lo.value, b = +hi.value;
      if (a > b - 1) { if (e && e.target === lo) lo.value = a = Math.max(0, b - 1); else hi.value = b = Math.min(stops.length - 1, a + 1); }
      var max = stops.length - 1;
      fill(bFill, a / max * 100, b / max * 100);
      bOut.textContent = money(stops[a]) + " – " + money(stops[b]) + (b === max ? "+" : "");
      // Keep the active thumb on top so the two can always be pulled apart.
      lo.style.zIndex = a > max - 2 ? 3 : 1;
    }
    function relabel() {
      var g = (form.querySelector("[name=gender]:checked") || {}).value;
      rel.classList.remove("swap"); void rel.offsetWidth; rel.classList.add("swap");
      $$("span[data-m]", rel).forEach(function (s) { s.textContent = s.getAttribute(g === "female" ? "data-f" : "data-m"); });
    }

    if (saved) {
      var g = form.querySelector("[name=gender][value=" + saved.gender + "]"); if (g) g.checked = true;
      var r = form.querySelector("[name=relation][value=" + saved.relation + "]"); if (r) r.checked = true;
      if (saved.age != null) ageIn.value = saved.age;
      if (saved.gender) relabel();
    }
    ageIn.addEventListener("input", updAge);
    lo.addEventListener("input", updBudget);
    hi.addEventListener("input", updBudget);
    $$("[name=gender]", form).forEach(function (r) { r.addEventListener("change", relabel); });
    updAge(); updBudget();

    // Rotating example placeholders in three languages.
    var ex = JSON.parse(note.getAttribute("data-examples") || "[]"), exI = 0;
    if (ex.length > 1) setInterval(function () {
      if (note.value || document.activeElement === note) return;
      note.classList.add("ph-fade");
      setTimeout(function () { exI = (exI + 1) % ex.length; note.placeholder = ex[exI]; note.classList.remove("ph-fade"); }, 300);
    }, 3200);

    var results = $("#results"), thinking = $("[data-thinking]", results), body = $("[data-results-body]", results);
    var thinkText = $("[data-thinking-text]", results), busy = false;
    var noneText = $("[data-none]", results).textContent;
    $("[data-finder-edit]", results).addEventListener("click", function () { document.getElementById("finder").scrollIntoView({ behavior: "smooth" }); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var gender = (form.querySelector("[name=gender]:checked") || {}).value;
      var relation = (form.querySelector("[name=relation]:checked") || {}).value;
      err.hidden = true;
      if (!gender || !relation) {
        var target = !gender ? $(".gender", form) : rel;
        err.textContent = !gender ? T.pickGender : T.pickRelation;
        err.hidden = false;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (target.animate) target.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 350 });
        return;
      }
      var max = stops.length - 1;
      var payload = {
        gender: gender, relation: relation, age: +ageIn.value,
        min: stops[+lo.value], max: +hi.value === max ? 1e9 : stops[+hi.value],
        note: note.value.trim()
      };
      store.set("hdiya_finder", { gender: gender, relation: relation, age: payload.age, min: payload.min, max: stops[+hi.value] });
      run(payload);
    });

    function run(payload) {
      busy = true;
      var btn = $("button[type=submit]", form);
      btn.classList.add("loading");
      results.hidden = false; thinking.hidden = false; body.hidden = true;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
      var step = 0;
      thinkText.textContent = T.thinking[0];
      var tick = setInterval(function () {
        step = Math.min(step + 1, T.thinking.length - 1);
        thinkText.style.animation = "none"; void thinkText.offsetWidth; thinkText.style.animation = "";
        thinkText.textContent = T.thinking[step];
      }, 1400);
      var started = Date.now();
      fetch(S.base + "api/recommend.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": S.csrf },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || T.error); return j; }); })
        .then(function (data) {
          setTimeout(function () { clearInterval(tick); show(data); }, Math.max(0, 1100 - (Date.now() - started)));
        })
        .catch(function (e) {
          clearInterval(tick);
          thinking.hidden = true; body.hidden = false;
          $("[data-top]", body).innerHTML = ""; $("[data-more-wrap]", body).hidden = true; $("[data-understood]", body).hidden = true;
          var none = $("[data-none]", body); none.hidden = false; none.textContent = e.message || T.error;
        })
        .then(function () { busy = false; btn.classList.remove("loading"); });
    }

    function pickHtml(p, i) {
      var item = { id: p.id, name: p.name, price: p.price, image: p.image, url: p.url };
      return '<article class="pick' + (i === 0 ? " first" : "") + '" style="--d:' + (i * 120) + 'ms">' +
        (i === 0 ? '<span class="best-label">' + esc(T.best) + "</span>" : "") +
        '<a class="pick-media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy"><span class="pick-rank">N°' + (i + 1) + "</span></a>" +
        '<div class="pick-body"><span class="card-cat">' + esc(p.category) + "</span><h3><a href=\"" + esc(p.url) + '">' + esc(p.name) + "</a></h3>" +
        '<ul class="reasons">' + p.reasons.map(function (r) { return "<li>" + ICON.check + "<span>" + esc(r) + "</span></li>"; }).join("") + "</ul>" +
        '<div class="pick-foot"><div class="price"><strong>' + esc(p.price_label) + "</strong>" + (p.compare_label ? " <s>" + esc(p.compare_label) + "</s>" : "") + "</div>" +
        (window.__src === "jev" ? '<span class="match"><span class="match-ring" style="--p:' + p.match + '"></span>' + p.match + "%</span>" : "") +
        '<button class="add-btn" type="button" aria-label="' + esc(T.add) + "\" data-add='" + esc(JSON.stringify(item)) + "'>" + ICON.plus + "</button></div></div></article>";
    }
    function cardHtml(p) {
      var item = { id: p.id, name: p.name, price: p.price, image: p.image, url: p.url };
      var off = p.compare && p.compare > p.price ? Math.round(100 - p.price * 100 / p.compare) : 0;
      return '<article class="card reveal"><a class="card-media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' +
        (off ? '<span class="pill sale">-' + off + "%</span>" : "") + "</a>" +
        '<div class="card-body"><span class="card-cat">' + esc(p.category) + "</span><h3><a href=\"" + esc(p.url) + '">' + esc(p.name) + "</a></h3>" +
        '<div class="card-foot"><div class="price"><strong>' + esc(p.price_label) + "</strong>" + (p.compare_label ? " <s>" + esc(p.compare_label) + "</s>" : "") + "</div>" +
        '<button class="add-btn" type="button" aria-label="' + esc(T.add) + "\" data-add='" + esc(JSON.stringify(item)) + "'>" + ICON.plus + "</button></div></div></article>";
    }

    function show(data) {
      window.__src = data.source;
      thinking.hidden = true; body.hidden = false;
      var src = $("[data-source-label]", body);
      src.textContent = src.getAttribute(data.source === "jev" ? "data-jev" : "data-local");
      var u = $("[data-understood]", body);
      $$(".u-chip", u).forEach(function (c) { c.remove(); });
      (data.understood || []).forEach(function (x, i) {
        var s = document.createElement("span");
        s.className = "u-chip " + x.type; s.style.animationDelay = i * 60 + "ms"; s.textContent = x.label;
        u.appendChild(s);
      });
      u.hidden = !(data.understood || []).length;
      $("[data-top]", body).innerHTML = data.top.map(pickHtml).join("");
      var more = $("[data-more]", body);
      more.innerHTML = data.more.map(cardHtml).join("");
      $("[data-more-wrap]", body).hidden = !data.more.length;
      $("[data-none]", body).hidden = !!data.top.length;
      $("[data-none]", body).textContent = noneText;
      observe(more);
    }
  }

  // Bottom-bar "Find" button: scroll on the home page instead of reloading.
  $$("[data-finder-link]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var f = document.getElementById("finder");
      if (f) { e.preventDefault(); f.scrollIntoView({ behavior: "smooth" }); }
    });
  });

  /* ---------- Product page ---------- */
  var buy = $("[data-buy]");
  if (buy) {
    var item = JSON.parse(buy.getAttribute("data-buy")), qty = $("[data-qty]", buy);
    $$("[data-step]", buy).forEach(function (b) {
      b.addEventListener("click", function () { qty.value = Math.max(1, Math.min(20, (+qty.value || 1) + +b.getAttribute("data-step"))); });
    });
    $$("[data-buy-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        addToCart(item, +qty.value || 1);
        var label = b.querySelector("span");
        if (label) { label.textContent = T.added; setTimeout(function () { label.textContent = T.add; }, 1500); }
      });
    });
    var sticky = $("[data-sticky-buy]");
    if (sticky && io) {
      new IntersectionObserver(function (en) { sticky.classList.toggle("show", !en[0].isIntersecting && en[0].boundingClientRect.top < 0); }).observe(buy);
    }
  }
  var gal = $("[data-gallery]");
  if (gal) {
    var main = $(".gallery-main", gal), dots = $$(".gallery-dots button", gal);
    dots.forEach(function (d, i) { d.addEventListener("click", function () { main.scrollTo({ left: main.clientWidth * i * (document.documentElement.dir === "rtl" ? -1 : 1), behavior: "smooth" }); }); });
    main.addEventListener("scroll", function () {
      var i = Math.round(Math.abs(main.scrollLeft) / main.clientWidth);
      dots.forEach(function (d, j) { d.classList.toggle("on", i === j); });
    }, { passive: true });
  }

  /* ---------- Checkout ---------- */
  var co = $("[data-checkout]");
  if (co) {
    var field = $("[data-cart-field]", co), wrapBox = $("[data-wrap]", co), wrapFee = +co.getAttribute("data-wrap-fee");
    var fresh = null;
    function totals() {
      if (!fresh) return;
      var w = wrapBox.checked ? wrapFee : 0;
      $("[data-co-subtotal]").textContent = money(fresh.subtotal);
      $("[data-co-delivery]").textContent = fresh.delivery ? money(fresh.delivery) : T.free;
      $("[data-co-wrap-row]").hidden = !w;
      $("[data-co-total]").textContent = money(fresh.subtotal + fresh.delivery + w);
      $("[data-message]").hidden = !wrapBox.checked;
    }
    wrapBox.addEventListener("change", totals);
    var items = cart.map(function (l) { return { id: l.id, qty: l.qty }; });
    field.value = JSON.stringify(items);
    fetch(S.base + "api/cart.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: field.value })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        fresh = d;
        // Sync the browser cart with current prices and availability.
        cart = d.lines.map(function (l) { return { id: l.id, name: l.name, price: l.price, image: l.image, url: l.url, qty: l.qty }; });
        saveCart();
        field.value = JSON.stringify(cart.map(function (l) { return { id: l.id, qty: l.qty }; }));
        $("[data-co-lines]").innerHTML = d.lines.length ? d.lines.map(function (l) {
          return '<div class="co-line"><img src="' + esc(l.image) + '" alt=""><div>' + esc(l.name) + '<div class="q">× ' + l.qty + "</div></div><strong>" + money(l.line) + "</strong></div>";
        }).join("") : '<p class="muted">' + esc(T.empty) + "</p>";
        $("[data-co-submit]").disabled = !d.lines.length;
        totals();
      });
    co.addEventListener("submit", function () { $("[data-co-submit]").classList.add("loading"); });
  }
  if ($("[data-order-done]")) { cart = []; saveCart(); }
})();
