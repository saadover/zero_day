// BadDecisions: the whole app runs in this one page. The server only makes
// the pick; answers and history live in this phone's storage.
(function () {
  const CFG = window.BD_CONFIG;
  const PROFILE_KEY = "bd.profile";
  const HISTORY_KEY = "bd.history";
  const STEPS = ["age", "religion", "priorities", "budget", "risk"];
  const DAY = 24 * 60 * 60 * 1000;
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const $ = (id) => document.getElementById(id);

  const CATEGORIES = {
    life: { q: "Which job should I take?", a: "Stay in my current job", b: "Move abroad for the new offer" },
    food: { q: "What should I eat tonight?", a: "Pizza", b: "Home-cooked couscous" },
    outfit: { q: "What should I wear today?", a: "The black jacket", b: "The beige coat" },
    text: { q: "Should I text them?", a: "Text them first", b: "Wait for them to text", fill: true },
    buy: { q: "Should I buy it?", a: "Buy it now", b: "Save the money", fill: true },
  };
  const THINKING = ["Weighing your options…", "Checking what matters to you…", "Imagining you in five years…", "Almost there…"];

  // ---------- storage ----------
  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  let profile = Object.assign({ done: false, age: "", religion: "", priorities: [], budget: "", risk: "" }, load(PROFILE_KEY, {}));
  let history = load(HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];

  // ---------- navigation ----------
  const stack = [];
  function show(id, { replace = false } = {}) {
    if (replace) stack.pop();
    stack.push(id);
    render(id);
  }
  function render(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
    window.scrollTo(0, 0);
    if (id === "home") renderHome();
    if (id === "history") renderHistory();
    if (id === "settings") renderSettings();
  }
  function back() {
    const at = stack[stack.length - 1];
    if (at === "thinking") return true; // wait for the answer
    if (at === "step" && stepIndex > 0) { showStep(stepIndex - 1); return true; }
    if (stack.length <= 1) return false;
    stack.pop();
    render(stack[stack.length - 1]);
    return true;
  }
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", back));
  if (native && plugins.App) {
    plugins.App.addListener("backButton", () => { if (!back()) plugins.App.exitApp(); });
  }

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const TICK = '<svg style="color: var(--good)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

  // ---------- home ----------
  function optionsReady() { return $("optA").value.trim() && $("optB").value.trim(); }
  function syncDecide() { $("decideBtn").disabled = !optionsReady(); }
  ["optA", "optB"].forEach((id) => $(id).addEventListener("input", syncDecide));

  function profileSummary() {
    const bits = [profile.age ? profile.age : null, profile.religion && profile.religion !== "Prefer not to say" ? profile.religion : null]
      .concat(profile.priorities.slice(0, 2).map((p) => "values " + p.toLowerCase()));
    return bits.filter(Boolean).join(", ");
  }
  function renderHome() {
    const summary = profile.done ? profileSummary() : "";
    $("known").hidden = !summary;
    $("knownText").textContent = "It already knows you: " + summary;
    $("historyDot").hidden = !pendingFollowup();
    syncDecide();
  }

  document.querySelectorAll("#cats .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cat = CATEGORIES[chip.dataset.cat];
      const on = chip.getAttribute("aria-pressed") !== "true";
      document.querySelectorAll("#cats .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", String(on));
      const defaults = Object.values(CATEGORIES).map((c) => c.q);
      const q = $("question");
      if (!q.value.trim() || defaults.includes(q.value)) q.value = on ? cat.q : "";
      $("optA").placeholder = "e.g. " + (on ? cat.a : CATEGORIES.life.a);
      $("optB").placeholder = "e.g. " + (on ? cat.b : CATEGORIES.life.b);
      if (on && cat.fill) {
        const fills = Object.values(CATEGORIES).flatMap((c) => (c.fill ? [c.a, c.b] : []));
        if (!$("optA").value.trim() || fills.includes($("optA").value)) $("optA").value = cat.a;
        if (!$("optB").value.trim() || fills.includes($("optB").value)) $("optB").value = cat.b;
      }
      syncDecide();
    });
  });

  $("addNotes").addEventListener("click", () => {
    $("addNotes").hidden = true;
    $("notesField").hidden = false;
    $("notes").focus();
  });

  $("decideBtn").addEventListener("click", () => {
    if (!optionsReady()) return;
    if (!profile.done) startSteps("decide");
    else decide();
  });
  $("toHistory").addEventListener("click", () => show("history"));
  $("toSettings").addEventListener("click", () => show("settings"));

  // ---------- about-you steps ----------
  let stepIndex = 0;
  let stepMode = "decide";
  function startSteps(mode) {
    stepMode = mode;
    show("step");
    showStep(0);
  }
  function showStep(i) {
    stepIndex = i;
    const name = STEPS[i];
    document.querySelectorAll("[data-q]").forEach((q) => { q.hidden = q.dataset.q !== name; });
    $("stepBar").style.width = ((i + 1) / STEPS.length) * 100 + "%";
    $("stepSkip").hidden = name === "religion" || name === "priorities";
    $("stepNext").textContent = i === STEPS.length - 1 ? (stepMode === "decide" ? "Decide for me" : "Save") : "Next";
    syncChips();
    window.scrollTo(0, 0);
  }
  function nextStep() {
    const name = STEPS[stepIndex];
    if (name === "age") {
      const age = Math.round(Number($("age").value));
      profile.age = age >= 13 && age <= 120 ? String(age) : "";
    }
    if (name === "religion" && !profile.religion) profile.religion = "Prefer not to say";
    if (stepIndex < STEPS.length - 1) { showStep(stepIndex + 1); return; }
    profile.done = true;
    save(PROFILE_KEY, profile);
    if (stepMode === "decide") decide({ replace: true });
    else { back(); toast("Saved"); }
  }
  $("stepNext").addEventListener("click", nextStep);
  $("stepSkip").addEventListener("click", () => {
    const name = STEPS[stepIndex];
    if (name === "age") $("age").value = "";
    else profile[name] = "";
    nextStep();
  });

  document.querySelectorAll("[data-single]").forEach((group) => {
    const field = group.dataset.single;
    group.querySelectorAll(".chip").forEach((chip) => {
      const value = chip.dataset.value || chip.textContent.trim();
      chip.addEventListener("click", () => {
        profile[field] = value;
        syncChips();
        setTimeout(nextStep, 180);
      });
    });
  });
  document.querySelectorAll("[data-multi]").forEach((group) => {
    const field = group.dataset.multi;
    const max = Number(group.dataset.max) || 99;
    group.querySelectorAll(".chip").forEach((chip) => {
      const value = chip.textContent.trim();
      chip.addEventListener("click", () => {
        const list = profile[field];
        const i = list.indexOf(value);
        if (i >= 0) list.splice(i, 1);
        else if (list.length < max) list.push(value);
        else toast("That's three. Tap one to swap it.");
        syncChips();
      });
    });
  });
  function syncChips() {
    document.querySelectorAll("[data-single]").forEach((group) => {
      group.querySelectorAll(".chip").forEach((chip) => {
        const value = chip.dataset.value || chip.textContent.trim();
        chip.setAttribute("aria-pressed", String(profile[group.dataset.single] === value));
      });
    });
    document.querySelectorAll("[data-multi]").forEach((group) => {
      group.querySelectorAll(".chip").forEach((chip) => {
        chip.setAttribute("aria-pressed", String(profile[group.dataset.multi].includes(chip.textContent.trim())));
      });
    });
    $("age").value = profile.age;
  }

  // ---------- deciding ----------
  let current = null; // the decision shown on the result screen
  let lastRequest = null;

  async function decide({ replace = false, request } = {}) {
    lastRequest = request || {
      decision: { question: $("question").value, option_a: $("optA").value, option_b: $("optB").value },
      person: {
        age: profile.age, religion: profile.religion, priorities: profile.priorities,
        budget: profile.budget, risk: profile.risk, notes: $("notes").value,
      },
    };
    show("thinking", { replace });
    let line = 0;
    $("thinkingText").textContent = THINKING[0];
    const ticker = setInterval(() => { line = Math.min(line + 1, THINKING.length - 1); $("thinkingText").textContent = THINKING[line]; }, 1600);

    let data;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 70000);
      const res = await fetch(CFG.apiBase.replace(/\/$/, "") + "/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastRequest),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      data = await res.json().catch(() => ({}));
      if (res.status >= 500 || (!res.ok && !data.error)) data = { error: "Something went wrong on our side. Try again in a minute." };
    } catch (e) {
      data = { error: e.name === "AbortError" ? "That took too long. Try again." : "Couldn't reach the server. Check your internet connection and try again." };
    }
    clearInterval(ticker);

    if (data.error) {
      current = null;
      renderError(data.error);
    } else {
      current = {
        id: Date.now().toString(36),
        at: Date.now(),
        question: lastRequest.decision.question.trim(),
        choice: data.choice,
        other: data.other,
        probability: typeof data.probability === "number" ? data.probability : null,
        reasons: data.reasons || [],
        tradeoffs: data.tradeoffs || [],
        verdict: null,
      };
      history.unshift(current);
      history = history.slice(0, 200);
      save(HISTORY_KEY, history);
      renderResult(current);
      clearForm();
    }
    show("result", { replace: true });
  }
  $("retry").addEventListener("click", () => {
    if (lastRequest) decide({ replace: true, request: lastRequest });
  });

  function clearForm() {
    ["question", "optA", "optB", "notes"].forEach((id) => { $(id).value = ""; });
    $("notesField").hidden = true;
    $("addNotes").hidden = false;
    document.querySelectorAll("#cats .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  }

  function renderError(message) {
    const box = $("resultBody");
    box.replaceChildren(el("h1", "small", "Couldn't decide this time"), el("div", "error", message));
    $("resultActions").hidden = true;
    $("retry").hidden = false;
    $("retry").textContent = "Try again";
  }

  function renderResult(d) {
    const box = $("resultBody");
    box.replaceChildren();
    $("resultActions").hidden = false;
    $("retry").hidden = !lastRequest || d !== current;
    $("retry").textContent = "Ask again";
    if (d.question) box.appendChild(el("div", "question", d.question));

    const card = el("div", "verdict");
    if (d.probability != null) {
      const pct = Math.round(d.probability * 100);
      const ring = el("div", "ring");
      ring.setAttribute("role", "img");
      ring.setAttribute("aria-label", pct + " percent sure");
      ring.style.background = "conic-gradient(var(--accent) 0 " + pct + "%, var(--track) 0)";
      const inner = el("div");
      inner.append(el("b", null, pct + "%"), el("span", null, "sure"));
      ring.appendChild(inner);
      card.appendChild(ring);
    }
    const words = el("div");
    words.append(el("div", "label", "BADDECISIONS PICKS"), el("div", "pick", d.choice), el("div", "over", "over " + d.other));
    card.appendChild(words);
    box.appendChild(card);

    const why = el("div", "box why");
    why.appendChild(el("h2", null, "Why"));
    if (d.reasons.length) {
      const ul = el("ul");
      d.reasons.forEach((r) => { const li = el("li"); li.innerHTML = TICK; li.appendChild(el("span", null, r)); ul.appendChild(li); });
      why.appendChild(ul);
    } else {
      why.appendChild(el("p", null, "The two were close on every point. The overall judgement tipped it."));
    }
    box.appendChild(why);

    if (d.tradeoffs.length) {
      const give = el("div", "box give");
      give.appendChild(el("h2", null, "What “" + d.other + "” had going for it"));
      const ul = el("ul");
      d.tradeoffs.forEach((t) => ul.appendChild(el("li", null, t)));
      give.appendChild(ul);
      box.appendChild(give);
    }
  }

  // ---------- sharing ----------
  async function shareText(text, title) {
    if (native && plugins.Share) {
      try { await plugins.Share.share({ title, text, dialogTitle: title }); } catch (e) { /* closed */ }
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ title, text }); } catch (e) { /* closed */ }
      return;
    }
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it anywhere."); } catch (e) { toast(text); }
  }

  $("shareStory").addEventListener("click", async () => {
    if (!current) return;
    const btn = $("shareStory");
    btn.disabled = true;
    try {
      const url = await window.drawStoryCard(current);
      const text = "I let BadDecisions decide. " + CFG.playLink;
      if (native && plugins.Filesystem && plugins.Share) {
        const file = await plugins.Filesystem.writeFile({
          path: "baddecisions-" + current.id + ".png",
          data: url.split(",")[1],
          directory: "CACHE",
        });
        await plugins.Share.share({ title: "My BadDecision", text, files: [file.uri], dialogTitle: "Share your decision" }).catch(() => {});
      } else {
        const blob = await (await fetch(url)).blob();
        const f = new File([blob], "baddecisions.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], text }).catch(() => {});
        } else {
          const a = el("a");
          a.href = url;
          a.download = "baddecisions.png";
          a.click();
        }
      }
    } catch (e) {
      toast("Couldn't make the picture. Try again.");
    }
    btn.disabled = false;
  });

  $("askFriends").addEventListener("click", () => {
    if (!current) return;
    const pct = current.probability != null ? " (" + Math.round(current.probability * 100) + "% sure)" : "";
    const q = current.question ? current.question + "\n" : "I can't decide:\n";
    const text = q + "1. " + current.other + "\n2. " + current.choice + "\n\nBadDecisions says " + current.choice + pct +
      ". Do you agree?\n\nTry it: " + CFG.playLink;
    shareText(text, "Help me decide");
  });
  $("shareApp").addEventListener("click", () => {
    shareText("Can't decide? BadDecisions picks for you and tells you why: " + CFG.playLink, "BadDecisions");
  });

  // ---------- history ----------
  function pendingFollowup() {
    return history.find((h) => h.verdict == null && Date.now() - h.at >= DAY) || null;
  }
  function dayKey(t) {
    const d = new Date(t);
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }
  function streak() {
    const days = new Set(history.map((h) => dayKey(h.at)));
    let t = Date.now();
    if (!days.has(dayKey(t))) t -= DAY;
    let n = 0;
    while (days.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  function ago(t) {
    const days = Math.floor((Date.now() - t) / DAY);
    if (days < 1) return "TODAY";
    if (days === 1) return "YESTERDAY";
    if (days < 14) return days + " DAYS AGO";
    return Math.floor(days / 7) + " WEEKS AGO";
  }
  function setVerdict(item, verdict) {
    item.verdict = verdict;
    save(HISTORY_KEY, history);
    renderHistory();
    toast(verdict === "good" ? "Nice. Noted as a good call." : "Noted. Can't win them all.");
  }
  function renderHistory() {
    $("statCount").textContent = history.length;
    $("statGood").textContent = history.filter((h) => h.verdict === "good").length;
    $("statStreak").textContent = streak();

    const fu = pendingFollowup();
    $("followup").hidden = !fu;
    if (fu) {
      $("fuWhen").textContent = ago(fu.at);
      $("fuQ").textContent = "You went with “" + fu.choice + "” over “" + fu.other + "”. Good decision?";
      $("fuYes").onclick = () => setVerdict(fu, "good");
      $("fuNo").onclick = () => setVerdict(fu, "bad");
    }

    const list = $("list");
    list.replaceChildren();
    if (!history.length) {
      list.appendChild(el("p", "empty", "Nothing yet. Your decisions will show up here."));
      return;
    }
    history.slice(0, 50).forEach((h) => {
      const row = el("button", "item");
      row.type = "button";
      const words = el("div");
      const pct = h.probability != null ? " · " + Math.round(h.probability * 100) + "% sure" : "";
      words.append(el("b", null, h.choice), el("small", null, "over " + h.other + pct));
      const tag = h.verdict === "good" ? el("span", "tag good", "Good call") : h.verdict === "bad" ? el("span", "tag bad", "Bad call") : el("span", "tag wait", "Waiting");
      row.append(words, tag);
      row.style.textAlign = "left";
      row.style.font = "inherit";
      row.style.color = "inherit";
      row.addEventListener("click", () => { current = h; renderResult(h); show("result"); });
      list.appendChild(row);
    });
  }

  // ---------- settings ----------
  function renderSettings() {
    const rows = $("profileRows");
    rows.replaceChildren();
    const items = [
      ["Age", profile.age],
      ["Religion", profile.religion],
      ["Matters most", profile.priorities.join(", ")],
      ["Money", profile.budget],
      ["Risk", profile.risk],
    ];
    items.forEach(([k, v]) => {
      const r = el("div");
      r.append(el("span", null, k), el("small", null, v || "Not answered"));
      rows.appendChild(r);
    });
    $("privacyLink").href = CFG.privacyLink;
    $("privacyLink").target = "_blank";
    $("privacyLink").rel = "noopener";
  }
  $("editProfile").addEventListener("click", () => startSteps("edit"));
  $("wipe").addEventListener("click", () => {
    if (!window.confirm("Delete your answers and all your past decisions from this phone?")) return;
    try { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
    profile = { done: false, age: "", religion: "", priorities: [], budget: "", risk: "" };
    history = [];
    renderSettings();
    toast("Deleted");
  });

  show("home");
})();
