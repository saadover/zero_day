// Admin helpers: clickable rows, age presets, "everyone" toggle, photo previews.
document.addEventListener("click", function (e) {
  var row = e.target.closest("tr[data-href]");
  if (row && !e.target.closest("a, button")) location.href = row.getAttribute("data-href");
  var preset = e.target.closest("[data-age-preset]");
  if (preset) {
    var v = preset.getAttribute("data-age-preset").split(",");
    document.querySelector("[data-age-min]").value = v[0];
    document.querySelector("[data-age-max]").value = v[1];
  }
});
var everyone = document.querySelector("[data-everyone]");
if (everyone) {
  var set = document.querySelector("[data-relations-set]");
  var sync = function () {
    if (everyone.checked) { set.setAttribute("data-disabled", ""); set.querySelectorAll("input").forEach(function (i) { i.checked = false; }); }
    else set.removeAttribute("data-disabled");
  };
  everyone.addEventListener("change", sync);
  set.addEventListener("change", function () { if (set.querySelector("input:checked")) everyone.checked = false; });
}
var pf = document.querySelector("[data-preview]");
if (pf) pf.addEventListener("change", function () {
  var out = document.querySelector("[data-preview-out]");
  out.innerHTML = "";
  Array.prototype.forEach.call(pf.files, function (f) {
    var d = document.createElement("div"); d.className = "thumb";
    var img = document.createElement("img"); img.src = URL.createObjectURL(f);
    d.appendChild(img); out.appendChild(d);
  });
});

// ---------- Age range slider (product form) ----------
var arange = document.querySelector("[data-arange]");
function ageSync(e) {
  if (!arange) return;
  var lo = document.querySelector("[data-age-min]"), hi = document.querySelector("[data-age-max]");
  var a = +lo.value, b = +hi.value;
  if (a > b) { if (e && e.target === lo) lo.value = a = b; else hi.value = b = a; }
  var fill = document.querySelector("[data-arange-fill]");
  fill.style.left = (a / 99 * 100) + "%";
  fill.style.width = ((b - a) / 99 * 100) + "%";
  lo.style.zIndex = a > 90 ? 3 : 1;
  document.querySelector("[data-age-out]").textContent = a + " – " + (b >= 99 ? "99+" : b) + " ans";
}
if (arange) {
  arange.addEventListener("input", ageSync);
  document.addEventListener("click", function (e) { if (e.target.closest("[data-age-preset]")) setTimeout(ageSync, 0); });
  ageSync();
}

// ---------- Automatic tagging (product form) ----------
(function () {
var tagging = document.querySelector("[data-tagging]");
if (!tagging) return;
{
  var form = tagging.closest("form"), btn = tagging.querySelector("[data-suggest]"), statusEl = tagging.querySelector("[data-suggest-status]");
  var autoDone = tagging.getAttribute("data-new") !== "1";
  var setChecks = function (name, values) {
    form.querySelectorAll("input[name='" + name + "[]']").forEach(function (i) { i.checked = values.indexOf(i.value) !== -1; });
  };
  var flash = function () {
    tagging.querySelectorAll(".tag-block").forEach(function (b) { b.classList.remove("suggested"); void b.offsetWidth; b.classList.add("suggested"); });
  };
  var apply = function (s) {
    var g = form.querySelector("input[name=gender][value=" + s.gender + "]"); if (g) g.checked = true;
    form.querySelector("[data-age-min]").value = s.age_min;
    form.querySelector("[data-age-max]").value = s.age_max;
    ageSync();
    var every = form.querySelector("[data-everyone]");
    every.checked = !s.relations.length;
    every.dispatchEvent(new Event("change"));
    setChecks("relations", s.relations);
    setChecks("interests", s.interests);
    setChecks("occasions", s.occasions);
    flash();
  };
  var run = function () {
    var name = form.querySelector("[name=name]").value.trim();
    if (name.length < 3) { statusEl.textContent = "Écrivez d'abord le nom du produit."; return; }
    var fd = new FormData();
    ["csrf", "name", "description", "category_id", "tags"].forEach(function (k) { var el = form.querySelector("[name=" + k + "]"); if (el) fd.append(k, el.value); });
    btn.disabled = true;
    tagging.classList.add("thinking");
    statusEl.textContent = "Analyse du produit…";
    fetch(tagging.getAttribute("data-suggest-url"), { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.error && !s.gender) throw new Error(s.error);
        apply(s);
        statusEl.textContent = (s.source === "jev" ? "Rempli par Jev" : "Rempli par les règles automatiques (ajoutez la clé Jev pour plus de précision)") + " — vérifiez et corrigez si besoin, puis enregistrez.";
      })
      .catch(function (e) { statusEl.textContent = "Impossible : " + e.message; })
      .then(function () { btn.disabled = false; tagging.classList.remove("thinking"); });
  };
  btn.addEventListener("click", run);
  // New product: fill once by itself when the name and description are written.
  var desc = form.querySelector("[name=description]");
  desc.addEventListener("blur", function () {
    if (autoDone || form.querySelector("[name=name]").value.trim().length < 3 || desc.value.trim().length < 15) return;
    autoDone = true;
    run();
  });
}
})();
