// Draws the 1080×1920 story card for a decision and returns it as a PNG
// data URL. Layout follows the "Shareable story card" mockup at 3× scale.
(function () {
  const W = 1080, H = 1920, PAD = 84;
  const INK = "#1d1a16", CREAM = "#f1ece4", SOFT = "#d9d1c5", MUTED = "#a89f92", LINE = "#4a423a", ORANGE = "#f07350";
  const DISPLAY = "Fraunces, Georgia, serif", BODY = "Inter, sans-serif";

  // Splits text into lines that fit maxWidth, at most maxLines (the last one gets "…").
  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + "…";
    }
    // A single word longer than the line still has to fit.
    return lines.map((l) => {
      while (l.length > 1 && ctx.measureText(l).width > maxWidth) l = l.slice(0, -2) + "…";
      return l;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function draw(d) {
    await Promise.all([
      document.fonts.load("800 100px Fraunces"),
      document.fonts.load("700 40px Inter"),
      document.fonts.load("600 40px Inter"),
    ]).catch(() => {});
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const inner = W - PAD * 2;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";

    let y = 150;
    ctx.fillStyle = ORANGE;
    ctx.font = "700 39px " + BODY;
    ctx.letterSpacing = "4px";
    ctx.fillText("I LET BADDECISIONS DECIDE", PAD, y);
    ctx.letterSpacing = "0px";
    y += 96;

    ctx.fillStyle = CREAM;
    ctx.font = "800 104px " + DISPLAY;
    for (const l of wrap(ctx, d.question || "Which one should I pick?", inner, 3)) {
      ctx.fillText(l, PAD, y);
      y += 112;
    }
    y += 50;

    // The option that lost, crossed out.
    ctx.font = "600 50px " + BODY;
    const lost = wrap(ctx, d.other, inner - 96, 2);
    let h = 48 + lost.length * 62 + 30;
    roundRect(ctx, PAD, y, inner, h, 54);
    ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = MUTED;
    let ty = y + 46;
    for (const l of lost) {
      ctx.fillText(l, PAD + 48, ty);
      const w = ctx.measureText(l).width;
      ctx.fillRect(PAD + 48, ty + 30, w, 4);
      ty += 62;
    }
    y += h + 30;

    // The pick, highlighted with a tick.
    ctx.font = "700 50px " + BODY;
    const won = wrap(ctx, d.choice, inner - 190, 3);
    h = 48 + won.length * 62 + 30;
    roundRect(ctx, PAD, y, inner, h, 54);
    ctx.fillStyle = ORANGE; ctx.fill();
    ctx.fillStyle = INK;
    ty = y + 46;
    for (const l of won) { ctx.fillText(l, PAD + 48, ty); ty += 62; }
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const cx = PAD + inner - 96, cy = y + h / 2;
    ctx.beginPath(); ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 6, cy + 18); ctx.lineTo(cx + 26, cy - 18); ctx.stroke();
    y += h + 80;

    if (typeof d.probability === "number") {
      const pct = Math.round(d.probability * 100) + "%";
      ctx.fillStyle = ORANGE;
      ctx.font = "800 192px " + DISPLAY;
      ctx.fillText(pct, PAD, y);
      const pw = ctx.measureText(pct).width;
      ctx.fillStyle = CREAM;
      ctx.font = "600 48px " + BODY;
      ctx.fillText("sure", PAD + pw + 30, y + 112);
      y += 230;
    }

    if (d.reasons && d.reasons.length) {
      ctx.fillStyle = SOFT;
      ctx.font = "500 45px " + BODY;
      for (const l of wrap(ctx, "“" + d.reasons[0] + ".”", inner, 3)) { ctx.fillText(l, PAD, y); y += 66; }
    }

    // Footer
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD, H - 210, inner, 3);
    ctx.font = "800 54px " + DISPLAY;
    ctx.fillStyle = CREAM;
    ctx.fillText("Bad", PAD, H - 160);
    const bw = ctx.measureText("Bad").width;
    ctx.fillStyle = ORANGE;
    ctx.fillText("Decisions", PAD + bw, H - 160);
    ctx.font = "600 39px " + BODY;
    ctx.textAlign = "right";
    ctx.fillText("Can't decide? Try it →", W - PAD, H - 150);
    ctx.textAlign = "left";

    return c.toDataURL("image/png");
  }

  window.drawStoryCard = draw;
})();
