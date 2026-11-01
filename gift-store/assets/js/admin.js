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
