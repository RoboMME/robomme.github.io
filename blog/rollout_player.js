/* Rollout player (design B), shared by the blog figures and the design page.
     RolloutPlayer.mount(root, samples, {band, start}) -> renders one player for a list of samples (or a single one),
        with "‹ Sample i (failure) ›" under the video (band: subgoal style dark|white|card|label|outline;
        goal: task-goal placement corner|pill|strip|link|above|bar|overlay|quote|chip, omitted = no task goal;
        settings: {prev, next, go(d, i)} adds « » around the sample arrows to jump to the previous / next setting; i = the
        sample on show, so the figure re-mounts on the same Rollout i); sample = {video, poster, duration, status,
        phases: [{name: "demonstration"|"execution", start, end}], subgoal_kind, subgoals: [[t, text]],
        callouts: [[t, text]] (optional: the video pauses at t for CALLOUT_MS with the text over it; ticks on the timeline)}
     prefix: shown before "Rollout i (…)": model and / or setup (oracle examples read "Sample i (level)"). onShow(sample, i) is called whenever a sample is shown. nav: false hides the ‹ Sample i › row (the figure selects the sample itself).
     view: "strip" | "pip" for front|wrist recordings (both halves 2:1 under a Front | Wrist bar, or the front with a wrist inset).
     RolloutPlayer.speedControl()      -> a "Speed" button row; RolloutPlayer.speedSelect() -> a "Speed" dropdown.
     The speed is global (every player on the page); it starts at 2× on each page load. So is the "Subgoal prediction"
     checkbox next to it: the model's text band over the videos is hidden until it is ticked (off on each page load).
     Cycle (goal: corner): once the player scrolls into view the task goal drops down for INTRO_MS on the first frame, then
     the video plays; at the end the outcome ("✓ Success" / "✗ Failure") shows for END_MS, then the video replays.
     goalIntro: "always" (default) opens the goal before every play-through; "first" only before the first one (Figures 6, 7).
     goalBold: extra words to bold in the task goal (Figure 6: "white", "violet").
     endHold: ms the last frame stays before the outcome card; demoRate: fixed rate for the demonstration (Figure 6: 2000, 1). */
(function () {
  "use strict";
  const SPEEDS = [0.5, 1, 2, 4];
  let speed = 2;  // default 2× on every page load
  const CALLOUT_MS = 2200;  // how long a callout holds the video
  const INTRO_MS = 2000, END_MS = 2000;  // task goal before each play-through; outcome after it
  const players = new Set(), controls = new Set();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const lastAt = (track, t) => { let cur = null; for (const e of track || []) { if (e[0] <= t + 0.03) cur = e; else break; } return cur; };

  function setSpeed(s) {
    speed = s;
    players.forEach((p) => p.applySpeed()); controls.forEach((c) => c());
  }
  function speedControl() {
    const row = el("div", "tab-row"), tabs = el("div", "tabs");
    row.append(el("span", "tab-label", "Speed"), tabs);
    const btns = SPEEDS.map((s) => { const b = el("button", null, `${s}×`); b.type = "button"; b.addEventListener("click", () => setSpeed(s)); tabs.appendChild(b); return [s, b]; });
    const sync = () => btns.forEach(([s, b]) => b.setAttribute("aria-selected", String(s === speed)));
    controls.add(sync); sync();
    return row;
  }

  // page-wide view toggles, reset on each page load: the model's text band (VLM subgoal / Thought; off), the oracle
  // subgoal band of oracle rollouts (off) and the wrist-camera inset of front|wrist players (on)
  let showText = false, showOracle = false, showWrist = true;
  const html = document.documentElement;
  function setText(on) { showText = on; html.classList.toggle("rp-text-on", on); controls.forEach((c) => c()); }
  function setOracle(on) { showOracle = on; html.classList.toggle("rp-oracle-on", on); controls.forEach((c) => c()); }
  function setWrist(on) { showWrist = on; html.classList.toggle("rp-wrist-off", !on); controls.forEach((c) => c()); }

  // a figure's top-right corner: checkboxes and a "Speed" dropdown, all global (like speedControl).
  // opts: {subgoal: "Subgoal prediction" checkbox (default on), oracle: "Oracle subgoal", wrist: "Wrist camera",
  //        speed: the Speed dropdown (default on)}; several calls can split them over rows, all stay in sync
  function speedSelect(opts = {}) {
    const box = el("div", "rp-speed"), speedBox = el("label", "rp-speed-sel"), sel = el("select"), syncs = [];
    const check = (label, get, set) => {
      const lab = el("label", "rp-text-toggle"), cb = el("input");
      cb.type = "checkbox"; cb.addEventListener("change", () => set(cb.checked));
      lab.append(cb, el("span", null, label)); box.appendChild(lab);
      syncs.push(() => (cb.checked = get()));
    };
    if (opts.wrist) check("Wrist camera", () => showWrist, setWrist);
    if (opts.oracle) check("Oracle subgoal", () => showOracle, setOracle);
    if (opts.subgoal !== false) check("Subgoal prediction", () => showText, setText);
    speedBox.append(el("span", null, "Speed"), sel);
    if (opts.speed !== false) box.append(speedBox);
    SPEEDS.forEach((s) => { const o = el("option", null, `${s}×`); o.value = String(s); sel.appendChild(o); });
    sel.addEventListener("change", () => setSpeed(Number(sel.value)));
    const sync = () => { sel.value = String(speed); syncs.forEach((f) => f()); };
    controls.add(sync); sync();
    return box;
  }

  // full task goal, font shrinking with length: 15px down to 12.5px until it fits two lines; longer goals then take a third line
  function fitGoal(inner) {
    const MAX = 15, MIN = 12.5, LINES = 2, LH = 1.4;
    const fit = () => {
      if (!inner.isConnected || !inner.clientWidth) return;
      let size = MAX;
      inner.style.fontSize = `${size}px`;
      while (inner.scrollHeight > LINES * MAX * LH + 1 && size > MIN) { size -= 0.5; inner.style.fontSize = `${size}px`; }
    };
    requestAnimationFrame(fit);
    if (window.ResizeObserver) { let w = 0; new ResizeObserver(() => { if (Math.abs(inner.clientWidth - w) > 2) { w = inner.clientWidth; fit(); } }).observe(inner); }
  }

  // bold the words a goal hinges on: object colours (not "white": PickHighlight's highlight), counts ("six times", "twice") and
  // ordinals after "the" ("the fourth target")
  const KEY = /\b(red|green|blue|yellow|purple|orange|pink|black|brown|gr[ae]y)\b|\b(once|twice|thrice|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) times)\b|\b(the )(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\b/gi;
  // extra: more words to bold for one figure (opts.goalBold, e.g. Figure 6's "white" and "violet" target colours)
  function emphasize(text, extra) {
    const out = []; let last = 0, m;
    const key = extra && extra.length ? new RegExp(KEY.source.replace("gr[ae]y)", `gr[ae]y|${extra.join("|")})`), "gi") : KEY;
    key.lastIndex = 0;
    while ((m = key.exec(text))) {
      const word = m[1] || m[2] || m[4], start = m.index + (m[3] ? m[3].length : 0);
      out.push(text.slice(last, start), el("strong", null, word));
      last = start + word.length;
    }
    out.push(text.slice(last));
    return out;
  }

  // instead of looping: hold the last frame for 2 s, then replay (cancelled if the viewer pauses or seeks meanwhile)
  function replayAfter(v, ms = 2000, blocked = () => false) {
    v.loop = false;
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    v.addEventListener("ended", () => {
      cancel();
      timer = setTimeout(() => { timer = null; if (v.isConnected && !blocked()) { v.currentTime = 0; v.play().catch(() => {}); } }, ms);
    });
    v.addEventListener("seeking", () => { if (timer && !v.ended) cancel(); });
    v.addEventListener("play", cancel);
    return cancel;
  }

  // the last task goal shown in each player slot of a card: navigating (‹ › « », tabs) to a sample with the same goal skips
  // the goal at its start. Keyed by the card (it survives re-renders) and the slot (Figure 7 has two players).
  const GOAL_SEEN = new WeakMap();
  function goalMemo(root) {
    root.classList.add("rp-root");
    const scope = root.closest(".card, .rd-opt") || root.parentElement || root;
    if (!GOAL_SEEN.has(scope)) GOAL_SEEN.set(scope, new Map());
    const slot = Array.from(scope.querySelectorAll(".rp-root")).indexOf(root), seen = GOAL_SEEN.get(scope);
    return { any: () => seen.has(slot), last: () => seen.get(slot), set: (g) => seen.set(slot, g) };
  }

  const OUTCOME = (status) => (status === "success" ? "success" : status === "oracle" ? "oracle" : "failure");

  function mount(root, list, opts = {}) {
    const items = Array.isArray(list) ? list : [list];
    let idx = Math.max(0, Math.min(items.length - 1, opts.start || 0));
    // via: "mount" when the figure (re)mounts the player (bar, model button, « »), "sample" for ‹ ›
    const show = (i, via = "sample") => { idx = (i + items.length) % items.length; return mountOne(root, items, idx, opts, show, via); };
    return show(idx, "mount");
  }

  function mountOne(root, items, idx, opts, show, via = "mount") {
    const s = items[idx];
    if (opts.onShow) opts.onShow(s, idx);  // e.g. Figure 8: the setup line under the video follows the sample
    root.replaceChildren();
    const box = el("div", `rp band-${opts.band || "dark"}${opts.goal && s.goal ? ` goal-${opts.goal}` : ""}${opts.view ? ` view-${opts.view}` : ""}`), vbox = el("div", "rp-video");
    const v = el("video"); v.src = s.video; if (s.poster) v.poster = s.poster;
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.loop = false;
    // at the end: the outcome for END_MS, then replay from the start (without the task goal); a seek or play cancels it
    let endTimer = null, openGoal = null, introTimer = null;
    // the outcome card: "✗ Failure" and, when known, one line on what happened in the episode (sample.outcome)
    const end = el("div", `rp-end ${OUTCOME(s.status)}`), endHead = el("div", "rp-end-head");
    endHead.append(el("span", "ic", OUTCOME(s.status) === "failure" ? "✗" : "✓"),
      { success: "Success", failure: "Failure", oracle: "Oracle" }[OUTCOME(s.status)] + (s.status === "timeout" ? " · timeout" : ""));
    end.appendChild(endHead);
    if (s.outcome) end.appendChild(el("div", "rp-end-text", s.outcome));
    const cancelReplay = () => { clearTimeout(endTimer); endTimer = null; vbox.classList.remove("end-on"); };
    const memo = goalMemo(root);
    let firstPlay = true;
    // task goal on the first frame for INTRO_MS (goal: corner), then play. The first play in a slot always shows it; after that
    // goalIntro decides: {replay, mount, sample} with mount / sample = "always" | "same" (skip when the goal is unchanged) |
    // "never". Shorthands: "always" (default; every play-through) and "first" (only the very first play, then on request).
    const gi = typeof opts.goalIntro === "object" ? { replay: true, sample: "always", mount: "always", ...opts.goalIntro }
      : opts.goalIntro === "first" ? { replay: false, sample: "never", mount: "never" } : { replay: true, sample: "always", mount: "always" };
    const startIntro = () => {
      let skip;
      if (!firstPlay) skip = !gi.replay;                // a replay of the same video
      else if (!memo.any()) skip = false;               // the first video this slot shows
      else { const rule = via === "sample" ? gi.sample : gi.mount; skip = rule === "never" || (rule === "same" && memo.last() === s.goal); }
      firstPlay = false;
      if (openGoal && !skip) { memo.set(s.goal); openGoal(); } else v.play().catch(() => {});
    };
    // at the end: hold the last frame for opts.endHold ms (default 0), then the outcome card for END_MS, then replay
    v.addEventListener("ended", () => {
      cancelReplay();
      const replay = () => {
        endTimer = null; vbox.classList.remove("end-on");
        if (!v.isConnected || box.classList.contains("goal-open")) return;
        v.currentTime = 0; startIntro();  // replay: the task goal again (goalIntro "always")
      };
      const card = () => {
        if (OUTCOME(s.status) !== "oracle") vbox.classList.add("end-on");  // oracle rollouts: no outcome card
        endTimer = setTimeout(replay, END_MS);
      };
      if (opts.endHold > 0) endTimer = setTimeout(card, opts.endHold); else card();
    });
    v.addEventListener("seeking", () => { if (endTimer && !v.ended) cancelReplay(); });
    v.addEventListener("play", () => { if (endTimer) cancelReplay(); });
    let closeGoal = null;  // set when the task goal is a drop-down: a click on the video while it is open just closes it
    v.addEventListener("click", () => (closeGoal && box.classList.contains("goal-open") ? closeGoal() : v.paused ? v.play() : v.pause()));
    const phase = el("span", "rp-phase");
    const counter = s.counter ? el("span", "rp-counter") : null;  // e.g. StopCube: "Passes 2 / 4" (top-left, execution only)
    const band = el("div", `rp-band${/oracle/i.test(s.subgoal_kind || "") ? " oracle" : ""}`), goal = el("div", "rp-goal");  // oracle: its own toggle
    band.append(goal);
    vbox.append(v, phase, band, end);
    // front|wrist recordings (opts.view): "strip" shows both halves (2:1) under a Front | Wrist bar; "pip" shows the front
    // half and mirrors the wrist half into a corner inset (a canvas redrawn from the same video, so they never drift)
    let pip = null;
    if (opts.view === "strip") box.appendChild(Object.assign(el("div", "rp-cams"), { innerHTML: "<span>Front</span><span>Wrist</span>" }));
    if (opts.view === "pip") {
      const wrap = el("div", "rp-pip"), cv = el("canvas"); wrap.append(cv, el("span", "rp-pip-label", "Wrist"));
      vbox.appendChild(wrap);
      pip = () => {
        if (!v.videoWidth || v.readyState < 2) return;
        const w = v.videoWidth / 2, h = v.videoHeight;
        if (cv.width !== w) { cv.width = w; cv.height = h; }
        cv.getContext("2d").drawImage(v, w, 0, w, h, 0, 0, w, h);
      };
      v.addEventListener("loadeddata", pip); v.addEventListener("seeked", pip);
    }
    if (counter) vbox.appendChild(counter);
    if (s.tag) vbox.appendChild(el("span", "rp-counter rp-tag", s.tag));  // a fixed label top-left, e.g. the model name
    // task goal: a line / title bar above the video, a card or a chip on the video, or a centred quote
    let goalEl = null;
    if (opts.goal && s.goal) {
      const text = s.goal.charAt(0).toUpperCase() + s.goal.slice(1);
      const body = el("span", "rp-goal-text"); body.append(...emphasize(text, opts.goalBold));
      goalEl = el("div", "rp-task", null); goalEl.title = text;
      const inner = el("div", "rp-task-inner");  // full sentence; font size fitted to the length (fitGoal)
      if (opts.goal !== "quote") inner.appendChild(el("b", null, "Task"));
      inner.appendChild(body); goalEl.appendChild(inner);
      if (opts.goal === "overlay") vbox.appendChild(goalEl);
      if (opts.goal === "chip") {
        const chip = el("button", "rp-task-chip", "Task"); chip.type = "button";
        chip.addEventListener("click", (e) => { e.stopPropagation(); vbox.classList.toggle("show-task"); });
        vbox.append(chip, goalEl);
      }
    }

    // timeline: coloured phases + a draggable playhead
    const tl = el("div", "rp-timeline"), head = el("span", "head");
    const dur = s.duration || 1;
    s.phases.forEach((p) => {
      const seg = el("span", `seg ${p.name === "demonstration" ? "demo" : "exec"}${s.phases.length === 1 ? " only" : ""}`);
      seg.style.left = `${(p.start / dur) * 100}%`; seg.style.width = `${((p.end - p.start) / dur) * 100}%`; tl.appendChild(seg);
    });
    // callouts: a tick on the timeline and a caption that holds the video when playback reaches it
    const calls = (s.callouts || []).map(([t, text]) => ({ t, text, done: false }));
    const callout = el("div", "rp-callout");
    let holding = null, holdTimer = null;
    const release = () => { clearTimeout(holdTimer); holding = null; vbox.classList.remove("callout-on"); };
    if (calls.length) {
      vbox.appendChild(callout);
      calls.forEach((c) => { const m = el("span", "mark"); m.style.left = `${(c.t / dur) * 100}%`; m.title = c.text; tl.appendChild(m); });
      v.addEventListener("seeking", () => { if (!holding) calls.forEach((c) => (c.done = c.t < v.currentTime - 0.05)); });  // a seek skips earlier callouts, re-arms later ones
      v.addEventListener("play", () => { if (holding) release(); });  // clicking the video skips the hold
    }
    tl.appendChild(head);
    let dragging = false, wasPlaying = false;
    const seek = (e) => { const r = tl.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
    tl.addEventListener("pointerdown", (e) => { cancelReplay(); dragging = true; wasPlaying = !v.paused; v.pause(); tl.classList.add("drag"); tl.setPointerCapture(e.pointerId); seek(e); });
    tl.addEventListener("pointermove", (e) => { if (dragging) seek(e); });
    const endDrag = () => { if (!dragging) return; dragging = false; tl.classList.remove("drag"); if (wasPlaying) v.play().catch(() => {}); };
    tl.addEventListener("pointerup", endDrag); tl.addEventListener("pointercancel", endDrag);

    // under the video: ‹ Sample i (outcome) ›
    const nav = el("div", "rp-nav"), label = el("span", "rp-label");
    const oc = OUTCOME(s.status);
    // oracle rollouts with a difficulty read "Sample 1 (easy)"; otherwise the outcome
    if (oc === "oracle" && (s.level || s.difficulty)) label.append(`Sample ${idx + 1} (`, el("span", "rp-outcome level", s.level || s.difficulty), ")");
    else if (oc === "oracle") label.append(`Sample ${idx + 1}`);  // oracle without tiers (e.g. InsertPeg in RoboMME-Plus)
    else label.append(`Rollout ${idx + 1} (`, el("span", `rp-outcome ${oc}`, oc), ")");  // a model's rollout: "Rollout 1 (failure)"
    // what is playing, before "Rollout i (…)": the model ("PonderPounce"), the setup ("N=6"), or both ("SimpleMemVLA · N=6")
    if (opts.prefix) label.prepend(el("b", "rp-model", opts.prefix), " ");
    const arrow = (txt, d, name) => { const b = el("button", "rp-arrow", txt); b.type = "button"; b.setAttribute("aria-label", name); b.disabled = items.length < 2; b.addEventListener("click", () => show(idx + d)); return b; };
    nav.append(arrow("‹", -1, "previous sample"), label, arrow("›", 1, "next sample"));
    if (opts.settings) {  // « » jump to the previous / next setting (the figure re-mounts the player)
      const jump = (txt, d, name, ok) => { const b = el("button", "rp-arrow set", txt); b.type = "button"; b.title = name; b.setAttribute("aria-label", name); b.disabled = !ok; b.addEventListener("click", () => opts.settings.go(d, idx)); return b; };
      nav.classList.add("has-set");  // with « » the model name takes its own line above "Sample i (…)"
      nav.prepend(jump("«", -1, "previous setting", opts.settings.prev));
      nav.append(jump("»", 1, "next setting", opts.settings.next));
    }
    if (goalEl && ["above", "bar", "quote"].includes(opts.goal)) box.append(goalEl);
    if (goalEl && ["button", "pill", "strip", "link", "corner"].includes(opts.goal)) {
      // a button above the video; clicking drops down the full goal (fixed size) and pauses (and dims) the video
      const mode = opts.goal === "button" ? "pill" : opts.goal;
      const FLAG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 1.5a.75.75 0 0 1 .75.75v.4c1.6-.9 3.3-.6 4.9.1 1.4.6 2.7.8 4.1.1a.5.5 0 0 1 .75.43v6.5a.5.5 0 0 1-.3.46c-1.8.8-3.5.5-5.1-.2-1.5-.6-2.9-.8-4.35.2v4.5a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 3 1.5Z"/></svg>';
      const btn = el("button", `rp-goal-btn ${mode}`); btn.type = "button"; btn.setAttribute("aria-expanded", "false");
      const label = el("span", "lbl"), state = el("span", "state");
      if (mode === "pill") { const ic = el("span", "ic"); ic.innerHTML = FLAG; btn.append(ic, label, el("span", "caret", "▾")); label.textContent = "Task goal"; }
      if (mode === "strip") { const ic = el("span", "ic"); ic.innerHTML = FLAG; btn.append(ic, label, state); label.textContent = "What is the robot asked to do?"; }
      if (mode === "link") { btn.append(el("span", "ic", "ⓘ"), label, el("span", "caret", "▾")); label.textContent = "Task goal"; }
      if (mode === "corner") { const ic = el("span", "ic"); ic.innerHTML = FLAG; btn.append(ic, label, el("span", "caret", "▾")); label.textContent = "Task goal"; }
      const setState = (open) => { state.textContent = open ? "Hide ▴" : "Show ▾"; };
      setState(false);
      // drop-down card: heading, the full goal, and a hint that the video is paused
      goalEl.classList.add("rp-goal-drop", mode);
      const head = el("div", "drop-head", "Task goal"), hint = el("div", "drop-hint", "Video paused · click to resume");
      goalEl.querySelector("b") && goalEl.querySelector("b").remove();
      goalEl.prepend(head); goalEl.appendChild(hint);
      let resume = false;
      const toggle = (open) => {
        clearTimeout(introTimer); box.classList.remove("goal-auto");
        box.classList.toggle("goal-open", open); btn.setAttribute("aria-expanded", String(open)); setState(open);
        if (open) { resume = !v.paused; v.pause(); } else if (resume) v.play().catch(() => {});
      };
      // auto-open before each play-through; closing it (timer or a click) starts the video
      closeGoal = () => toggle(false);
      if (mode === "corner") openGoal = () => { toggle(true); resume = true; box.classList.add("goal-auto"); introTimer = setTimeout(() => toggle(false), INTRO_MS); };
      btn.addEventListener("click", () => toggle(!box.classList.contains("goal-open")));
      goalEl.addEventListener("click", () => toggle(false));
      box.classList.add("goal-button", `goal-${mode}`);
      if (mode === "corner") vbox.append(btn, goalEl);  // pinned on the video, top-right corner
      else box.append(btn, goalEl);
    } else if (goalEl && opts.goal !== "bar") fitGoal(goalEl.querySelector(".rp-task-inner"));  // the bar keeps one size
    box.append(vbox, tl);
    if (opts.nav !== false) box.append(nav);  // nav: false when the figure picks the sample itself
    root.appendChild(box);

    // opts.demoRate: a fixed rate while the demonstration plays (Figure 6: 1×); the global speed otherwise
    const inDemo = () => s.phases.some((ph) => ph.name === "demonstration" && v.currentTime >= ph.start - 1e-3 && v.currentTime < ph.end);
    const player = { applySpeed: () => (v.playbackRate = opts.demoRate && inDemo() ? opts.demoRate : speed) };
    players.add(player); player.applySpeed();
    v.addEventListener("loadedmetadata", player.applySpeed);
    let last = "";
    const tick = () => {
      if (!root.isConnected || !box.isConnected) { players.delete(player); return; }
      const t = v.currentTime || 0;
      const due = !v.paused && !holding && !dragging ? calls.find((c) => !c.done && t >= c.t) : null;
      if (due) {
        due.done = true; holding = due; v.pause();
        callout.textContent = due.text; vbox.classList.add("callout-on");
        holdTimer = setTimeout(() => { release(); if (box.isConnected && !box.classList.contains("goal-open")) v.play().catch(() => {}); }, CALLOUT_MS);
      }
      const ph = s.phases.find((p) => t >= p.start - 1e-3 && t < p.end) || s.phases[s.phases.length - 1];
      const demo = ph.name === "demonstration";
      const sg = demo ? null : lastAt(s.subgoals, t);
      head.style.left = `${(t / dur) * 100}%`;
      if (pip && !v.paused) pip();
      const cv = counter ? lastAt(s.counter.track, t) : null;
      const key = `${ph.name}|${sg && sg[1]}|${cv && cv[1]}`;
      if (key !== last) {
        last = key;
        if (opts.demoRate) player.applySpeed();  // entering / leaving the demonstration
        vbox.classList.toggle("demo", demo);
        phase.textContent = demo ? `Demonstration${(s.demo_speed || 1) > 1 ? ` · ${s.demo_speed}×` : ""}` : "Execution";  // demo shown sped up in the clip
        // during the demonstration the band is hidden (CSS); afterwards: the subgoal, or "none" for models without one
        const gText = s.subgoal_kind ? (sg ? sg[1] : "…") : "none";
        // Embodied Astra's text is its reasoning for each waypoint ("thought"); the VLAs predict subgoals
        const gLabel = /waypoint|thought|description/i.test(s.subgoal_kind || "") ? "Thought" : /oracle/i.test(s.subgoal_kind || "") ? "Subgoal" : "VLM subgoal";
        goal.replaceChildren(el("b", null, gLabel), el("span", s.subgoal_kind ? null : "none", gText));
        goal.title = gText;  // full text on hover when it is cut to five lines
        if (counter) counter.replaceChildren(el("b", null, s.counter.label), ` ${cv ? cv[1] : 0} / ${s.counter.of}`);
      }
      requestAnimationFrame(tick);
    };
    // start the cycle once the player is on screen (not on page load, when it may be far below)
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); if (box.isConnected) startIntro(); } }, { threshold: 0.5 });
      io.observe(vbox);
    } else startIntro();
    requestAnimationFrame(tick);
    return v;
  }

  window.RolloutPlayer = { mount, speedControl, speedSelect, setSpeed, setText, setOracle, setWrist, replayAfter, get speed() { return speed; } };
})();
