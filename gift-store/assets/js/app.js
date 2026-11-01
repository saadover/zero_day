/* Hdiya storefront: quick-buy pop-up, gift finder, small animations. No dependencies. */
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
  try { localStorage.removeItem("hdiya_cart"); } catch (e) { /* old cart from the previous version */ }
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

  /* ---------- Quick buy pop-up ---------- */
  // "Acheter" opens a small form (name, phone, city) and places the order
  // straight away: no cart, no checkout page.
  var modal = $("#quickbuy"), scrim = $(".modal-scrim"), qbForm = $("[data-qb-form]"), qbDone = $("[data-qb-done]");
  var qbItem = null, qbQty = 1, qbBusy = false, lastFocus = null;
  var saved = store.get("hdiya_buyer", {}) || {};

  function qbTotals() {
    var sub = qbItem.price * qbQty;
    var fee = S.freeFrom > 0 && sub >= S.freeFrom ? 0 : S.deliveryFee;
    $("[data-qb-qty]").textContent = qbQty;
    $("[data-qb-price]").textContent = money(sub);
    $("[data-qb-delivery]").textContent = fee ? money(fee) : T.free;
    $("[data-qb-total]").textContent = money(sub + fee);
  }
  function qbErr(field, msg) {
    var el = $("[data-err=" + field + "]", qbForm), input = qbForm.elements[field];
    el.textContent = msg || ""; el.hidden = !msg;
    input.closest(".field").classList.toggle("bad", !!msg);
  }
  function openBuy(item, qty) {
    if (!modal) return;
    qbItem = item; qbQty = Math.max(1, Math.min(item.max || 10, qty || 1));
    lastFocus = document.activeElement;
    $("[data-qb-img]").src = item.image;
    $("[data-qb-name]").textContent = item.name;
    ["name", "phone", "city"].forEach(function (f) { qbErr(f, ""); if (saved[f] && !qbForm.elements[f].value) qbForm.elements[f].value = saved[f]; });
    $("[data-qb-error]").hidden = true;
    qbForm.hidden = false; qbDone.hidden = true;
    qbTotals();
    scrim.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(function () { scrim.classList.add("show"); modal.classList.add("open"); });
    document.body.style.overflow = "hidden";
    setTimeout(function () { (qbForm.elements.name.value ? qbForm.elements.phone.value ? qbForm.elements.city : qbForm.elements.phone : qbForm.elements.name).focus({ preventScroll: true }); }, 350);
  }
  function closeBuy() {
    if (!modal || !modal.classList.contains("open")) return;
    scrim.classList.remove("show"); modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(function () { scrim.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.openBuy = openBuy;

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-buy-now]");
    if (b) { e.preventDefault(); openBuy(JSON.parse(b.getAttribute("data-buy-now")), 1); return; }
    if (e.target.closest("[data-qb-close]")) { closeBuy(); return; }
    var st = e.target.closest("[data-qb-step]");
    if (st && qbItem) { qbQty = Math.max(1, Math.min(qbItem.max || 10, qbQty + +st.getAttribute("data-qb-step"))); qbTotals(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeBuy(); });

  if (qbForm) {
    var phone = qbForm.elements.phone;
    // Digits only, 10 at most, as people type or paste (+212 6… becomes 06…).
    phone.addEventListener("input", function () {
      var d = phone.value.replace(/\D/g, "");
      if (d.indexOf("00212") === 0) d = "0" + d.slice(5);
      else if (d.indexOf("212") === 0 && d.length > 10) d = "0" + d.slice(3);
      if (d.length === 9 && /^[5-7]/.test(d)) d = "0" + d; // typed without the leading 0
      phone.value = d.slice(0, 10);
      if (phone.closest(".field").classList.contains("bad") && /^0[5-7]\d{8}$/.test(phone.value)) qbErr("phone", "");
    });
    qbForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (qbBusy || !qbItem) return;
      var f = qbForm.elements, ok = true;
      var vals = { name: f.name.value.trim(), phone: f.phone.value.trim(), city: f.city.value };
      if (vals.name.length < 2) { qbErr("name", T.errName); ok = false; } else qbErr("name", "");
      if (!/^0[5-7]\d{8}$/.test(vals.phone)) { qbErr("phone", T.errPhone); ok = false; } else qbErr("phone", "");
      if (!vals.city) { qbErr("city", T.errCity); ok = false; } else qbErr("city", "");
      if (!ok) { var bad = $(".field.bad input, .field.bad select", qbForm); if (bad) bad.focus(); return; }
      qbBusy = true;
      var btn = $("button[type=submit]", qbForm);
      btn.classList.add("loading");
      fetch(S.base + "api/order.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": S.csrf },
        body: JSON.stringify({ id: qbItem.id, qty: qbQty, name: vals.name, phone: vals.phone, city: vals.city, website: f.website.value })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.j.errors) { Object.keys(res.j.errors).forEach(function (k) { if (f[k]) qbErr(k, res.j.errors[k]); else { var g = $("[data-qb-error]"); g.textContent = res.j.errors[k]; g.hidden = false; } }); return; }
          if (!res.ok) throw new Error(res.j.error || T.error);
          saved = vals; store.set("hdiya_buyer", saved);
          $("[data-qb-ref]").textContent = res.j.ref;
          $("[data-qb-done-text]").textContent = res.j.message || "";
          qbForm.hidden = true; qbDone.hidden = false;
          $("[data-qb-close]", qbDone).focus({ preventScroll: true });
        })
        .catch(function (err) { var g = $("[data-qb-error]"); g.textContent = err.message || T.error; g.hidden = false; })
        .then(function () { qbBusy = false; btn.classList.remove("loading"); });
    });
  }

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
          $("[data-top]", body).innerHTML = ""; $("[data-more-wrap]", body).hidden = true; $("[data-close-wrap]", body).hidden = true; $("[data-close-note]", body).hidden = true; $("[data-understood]", body).hidden = true;
          var none = $("[data-none]", body); none.hidden = false; none.textContent = e.message || T.error;
        })
        .then(function () { busy = false; btn.classList.remove("loading"); });
    }

    function buyBtn(p, cls) {
      var item = { id: p.id, name: p.name, price: p.price, image: p.image };
      return '<button class="' + cls + '" type="button" data-buy-now=\'' + esc(JSON.stringify(item)) + '\'>' + esc(T.buy) + "</button>";
    }
    function gapsHtml(p) {
      return p.gaps && p.gaps.length ? '<ul class="gaps">' + p.gaps.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul>" : "";
    }
    function pickHtml(p, i) {
      var first = i === 0 && !p.close;
      return '<article class="pick' + (first ? " first" : "") + (p.close ? " is-close" : "") + '" style="--d:' + (i * 120) + 'ms">' +
        (first ? '<span class="best-label">' + esc(T.best) + "</span>" : "") +
        '<a class="pick-media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy"><span class="pick-rank">N°' + (i + 1) + "</span></a>" +
        '<div class="pick-body"><span class="card-cat">' + esc(p.category) + "</span><h3><a href=\"" + esc(p.url) + '">' + esc(p.name) + "</a></h3>" +
        (p.close ? gapsHtml(p) : '<ul class="reasons">' + p.reasons.map(function (r) { return "<li>" + ICON.check + "<span>" + esc(r) + "</span></li>"; }).join("") + "</ul>") +
        '<div class="pick-foot"><div class="price"><strong>' + esc(p.price_label) + "</strong>" + (p.compare_label ? " <s>" + esc(p.compare_label) + "</s>" : "") + "</div>" +
        (window.__src === "jev" && !p.close ? '<span class="match"><span class="match-ring" style="--p:' + p.match + '"></span>' + p.match + "%</span>" : "") +
        "</div>" + buyBtn(p, "buy-btn") + "</div></article>";
    }
    function cardHtml(p) {
      var off = p.compare && p.compare > p.price ? Math.round(100 - p.price * 100 / p.compare) : 0;
      return '<article class="card reveal' + (p.close ? " is-close" : "") + '"><a class="card-media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' +
        (off ? '<span class="pill sale">-' + off + "%</span>" : "") + "</a>" +
        '<div class="card-body"><span class="card-cat">' + esc(p.category) + "</span><h3><a href=\"" + esc(p.url) + '">' + esc(p.name) + "</a></h3>" + gapsHtml(p) +
        '<div class="card-foot"><div class="price"><strong>' + esc(p.price_label) + "</strong>" + (p.compare_label ? " <s>" + esc(p.compare_label) + "</s>" : "") + "</div></div>" +
        buyBtn(p, "buy-btn") + "</div></article>";
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
      var close = $("[data-close]", body);
      close.innerHTML = (data.close || []).map(cardHtml).join("");
      $("[data-close-wrap]", body).hidden = !(data.close || []).length;
      var none = $("[data-none]", body);
      none.hidden = !!data.top.length;
      none.textContent = noneText;
      // Nothing matched every rule: say so, then show the closest gifts.
      $("[data-close-note]", body).hidden = !(data.exact === 0 && data.top.length);
      observe(more); observe(close);
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
      b.addEventListener("click", function () { qty.value = Math.max(1, Math.min(item.max || 10, (+qty.value || 1) + +b.getAttribute("data-step"))); });
    });
    $$("[data-buy-main]").forEach(function (b) {
      b.addEventListener("click", function () { openBuy(item, +qty.value || 1); });
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

})();
