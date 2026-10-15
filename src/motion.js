// ================= Trackit motion layer =================
// Crisp, purposeful motion: transform/opacity only, < 300ms for UI, little motion on frequent actions.
(function(){
  const mq = q => window.matchMedia && matchMedia(q).matches;
  const calm = mq("(prefers-reduced-motion: reduce)");
  const finePointer = mq("(hover: hover) and (pointer: fine)");

  // ambient background (decorative, very slow)
  const amb = document.createElement("div"); amb.className = "ambient"; amb.setAttribute("aria-hidden", "true");
  amb.innerHTML = "<i></i><i></i><i></i>"; document.body.prepend(amb);

  // toast: CSS transitions so a new toast can interrupt the old one smoothly
  let toastTimer = null;
  window.toast = function(msg){
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); t.offsetWidth; }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => { if (!t.classList.contains("show")) t.remove(); }, 320); }, 2400);
  };

  // loading skeleton while data arrives
  const skeleton = () => `<div style="height:34px;width:220px;margin-bottom:8px" class="skel"></div><div style="height:16px;width:320px;margin-bottom:24px" class="skel"></div>
    <div class="kpis k5">${"<div class='skel' style='height:112px'></div>".repeat(5)}</div><div class="skel" style="height:300px"></div>`;
  const origLoadAll = window.loadAll;
  window.loadAll = async function(){
    const m = document.getElementById("main");
    if (m && !S.emps.length && !m.children.length) m.innerHTML = skeleton();
    return origLoadAll.apply(this, arguments);
  };

  // sliding indicator using FLIP (transform only): size it to the new item, then animate from the old box
  const last = {};
  function slide(container, key, activeSel){
    if (!container) return;
    const active = container.querySelector(activeSel);
    let ind = container.querySelector(":scope > .ind");
    if (!active) { if (ind) ind.style.opacity = 0; return; }
    if (!ind) { ind = document.createElement("span"); ind.className = "ind"; container.prepend(ind); }
    const box = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
    const prev = last[key];
    ind.classList.toggle("done", active.classList.contains("done"));
    ind.classList.remove("go");
    Object.assign(ind.style, { opacity: 1, width: box.w + "px", height: box.h + "px" });
    if (prev && !calm && (prev.x !== box.x || prev.y !== box.y)) {
      ind.style.transform = `translate(${prev.x}px,${prev.y}px) scale(${prev.w / box.w},${prev.h / box.h})`;
      ind.offsetWidth; ind.classList.add("go");
    }
    ind.style.transform = `translate(${box.x}px,${box.y}px)`;
    last[key] = box;
  }
  function indicators(){
    slide(document.getElementById("nav"), "nav", "button.on");
    document.querySelectorAll("#main .tabs").forEach((t, i) => slide(t, "tabs" + i, "button.on"));
    document.querySelectorAll(".seg").forEach((t, i) => slide(t, "seg" + (t.dataset.name || i), "button.on"));
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".seg button");
    if (b) requestAnimationFrame(() => slide(b.parentElement, "seg" + (b.parentElement.dataset.name || "x"), "button.on"));
  });

  // count-up: only the first time the dashboard is shown in a visit (a rare, first-time moment)
  let counted = false;
  function countUp(el){
    const target = parseInt(String(el.textContent).replace(/[^\d]/g, ""), 10);
    if (!target) return;
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = "0"; requestAnimationFrame(step);
  }

  // reveal lower sections as they scroll into view
  const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -6% 0px" }) : null;

  const ARROW = /^(See all alerts|Go to dashboard|Update|Save|Create login|Add employee|\+ Add employee|Upload another file|Download template|Download current list)$/;
  const seen = new Set();
  let lastView = null, alarmShown = false;
  function after(fromLive){
    indicators();
    const main = document.getElementById("main"); if (!main) return;
    document.querySelectorAll(".btn").forEach(b => { if (ARROW.test(b.textContent.trim())) b.classList.add("arrow"); });
    const impState = String(!!S.imp) + String(!!(S.imp && S.imp.result));
    const entering = S.view !== lastView || (S.view === "import" && !fromLive && main.dataset.imp !== impState);
    main.dataset.imp = impState; lastView = S.view;
    if (!entering || fromLive) return;
    const first = !seen.has(S.view); seen.add(S.view);
    // short, staggered entrance (fade-only for reduced motion via CSS)
    main.classList.remove("enter", "first"); void main.offsetWidth;
    main.classList.add("enter"); if (first) main.classList.add("first");
    [...main.children].forEach((c, i) => {
      if (i < 4) c.style.setProperty("--i", i);
      else if (io && first) { c.classList.add("reveal"); io.observe(c); }
    });
    if (first) main.querySelectorAll("tbody").forEach(tb => [...tb.children].slice(0, 8).forEach((r, i) => r.style.setProperty("--r", i)));
    // Expired card glows a few times on the first dashboard view only
    if (S.view === "dashboard" && !alarmShown) {
      main.querySelectorAll(".kpi").forEach(k => { if (/quick\('exp'\)/.test(k.getAttribute("onclick") || "") && parseInt(k.querySelector(".v").textContent.replace(/\D/g, ""), 10) > 0) { k.classList.add("alarm"); alarmShown = true; } });
    }
    if (S.view === "dashboard" && !counted && !calm) { counted = true; main.querySelectorAll(".kpi .v").forEach(countUp); }
    setTimeout(() => main.classList.remove("enter", "first"), 900);
  }
  const origRender = window.render;
  window.render = function(fromLive){ const r = origRender.apply(this, arguments); after(fromLive); return r; };
  window.addEventListener("resize", () => { for (const k in last) delete last[k]; indicators(); });

  // water-drop ripple: a soft splash plus an expanding ring from the exact click point
  document.addEventListener("pointerdown", e => {
    if (calm) return;
    const el = e.target.closest(".btn, nav button, .bottom-nav button, .tabs button, .seg button, .kpi, .chips button");
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), size = Math.min(Math.max(r.width, r.height) * 1.6, 260);
    const dark = el.matches(".btn:not(.ghost):not(.tan), nav button, .bottom-nav button");
    const color = dark ? "rgba(245,237,227,.55)" : "rgba(169,135,95,.32)";
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    ["", "ring"].forEach(kind => {
      const s = document.createElement("span"); s.className = "ripple" + (kind ? " " + kind : "");
      Object.assign(s.style, { width: size + "px", height: size + "px", left: (e.clientX - r.left - size / 2) + "px", top: (e.clientY - r.top - size / 2) + "px" });
      s.style.setProperty("--rc", color);
      el.appendChild(s); s.offsetWidth; s.classList.add("go"); setTimeout(() => s.remove(), 750);
    });
  });

  // soft spotlight following the mouse on KPI cards (mouse users only)
  if (finePointer && !calm) document.addEventListener("pointermove", e => {
    const k = e.target.closest && e.target.closest(".kpi"); if (!k) return;
    const r = k.getBoundingClientRect();
    k.style.setProperty("--mx", (e.clientX - r.left) + "px"); k.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  // filter bar turns to glass once it sticks while scrolling
  window.addEventListener("scroll", () => {
    const f = document.querySelector("#main .filters"); if (!f) return;
    f.classList.toggle("stuck", f.getBoundingClientRect().top <= (innerWidth <= 900 ? 67 : 11) && scrollY > 80);
  }, { passive: true });
})();
