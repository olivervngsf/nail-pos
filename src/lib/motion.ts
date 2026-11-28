"use client";
// Motion (Nov 26). Step 2 = leave gently; step 3 = sliding switch pill; step 4 = rows flow in/out + money settles (further down).
// Screens close pop-ups by removing them (React unmounts them). That made every drawer, sheet, toast and
// pop-up vanish in one frame. One watcher fixes all of them at once: when an overlay leaves the page, a
// silent copy (aria-hidden, inert, no ids/test ids, no clicks) takes its place and plays a short exit
// (kit.css `.lv-*`), then removes itself. Nothing waits for it: the real one is already gone, so taps,
// tests and saves are never slowed down. Off with reduced motion.
// New overlay class? Add it to LEAVERS. In-flow things (banners) close themselves: see `collapseOut`.

export type LeaveKind = "fade" | "right" | "down" | "pop";
type Leaver = { sel: string; kind: LeaveKind; /** sits inside its parent (absolute): skip when the parent left too */ local?: boolean };

export const LEAVERS: Leaver[] = [
  { sel: ".scrim", kind: "fade" },
  { sel: ".set-scrim", kind: "fade" },
  { sel: ".pm-scrim", kind: "fade" },
  { sel: ".drawer-scrim", kind: "fade" },
  { sel: ".drawer", kind: "right" },
  { sel: ".sheet", kind: "down" },
  { sel: ".pm-sheet", kind: "down" },
  { sel: ".toast", kind: "down" },
  { sel: ".set-win", kind: "pop" },
  { sel: ".faces-pin", kind: "pop" },
  { sel: ".rail-pop", kind: "pop" },
  { sel: ".dp-pop", kind: "pop" },
  { sel: ".cal-menu", kind: "pop" },
  { sel: ".cal-alp", kind: "pop", local: true },
  { sel: ".sr-pop", kind: "pop", local: true },
];
const ALL = LEAVERS.map((l) => l.sel).join(",");

/* Settings page → page (Oliver, Nov 27: "Claude motion didn't look like that"). Each Settings page mounts its own
   window, so a page switch removes the old window a moment before the new one mounts. That is a swap, not a close:
   the window, scrim and menu must stay still and only the page side changes. A tap on a link inside the window that
   stays in Settings (or browser back/forward landing in Settings) marks a swap for a short moment. */
const IN_SETTINGS = /^\/(settings|me)(\/|$|\?)/;
const SWAP_SEL = new Set([".set-win", ".set-scrim"]);
let setSwapAt = 0;
const settingsSwap = () => Date.now() - setSwapAt < 1500;
function markSwap(e: Event) {
  const a = (e.target as Element | null)?.closest?.(".set-win a[href]") as HTMLAnchorElement | null;
  let stay = false;
  try { stay = !!a && IN_SETTINGS.test(new URL(a.href, location.href).pathname); } catch { /* */ }
  setSwapAt = stay ? Date.now() : 0; // any other tap (X, Sign out, a link out) = a real close: let it fade
}
const clearSwap = (e: KeyboardEvent) => { if (e.key === "Escape") setSwapAt = 0; };
const markPop = () => { if (IN_SETTINGS.test(location.pathname)) setSwapAt = Date.now(); };
const MAX_MS = 700; // safety: a copy never stays longer than this

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Last scroll position of anything that scrolled, so a closing drawer leaves where it was (a removed node forgets it). */
const scrolls = new WeakMap<Element, [number, number]>();

function ghostOf(node: HTMLElement, kind: LeaveKind) {
  const g = node.cloneNode(true) as HTMLElement;
  const from = [node, ...Array.from(node.querySelectorAll("*"))];
  const to = [g, ...Array.from(g.querySelectorAll("*"))] as HTMLElement[];
  const scrolled: [HTMLElement, number, number][] = [];
  to.forEach((el, i) => {
    el.removeAttribute("id"); el.removeAttribute("data-testid"); el.removeAttribute("name"); el.removeAttribute("autofocus");
    const s = scrolls.get(from[i]);
    if (s) scrolled.push([el, s[0], s[1]]);
    const src = from[i] as HTMLInputElement;
    if ("value" in src && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.value = src.value;
  });
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  g.classList.add("lv", `lv-${kind}`);
  g.dataset.leaving = kind;
  return { g, scrolled };
}

function play(g: HTMLElement, scrolled: [HTMLElement, number, number][]) {
  for (const [el, top, left] of scrolled) { el.scrollTop = top; el.scrollLeft = left; }
  const done = () => g.remove();
  g.addEventListener("animationend", (e) => { if (e.target === g) done(); });
  setTimeout(done, MAX_MS);
}

function leaversIn(n: Node): { el: HTMLElement; l: Leaver; top: boolean }[] {
  if (!(n instanceof HTMLElement) || n.classList.contains("lv")) return [];
  if (!n.matches(ALL) && !n.querySelector(ALL)) return []; // most removals (list rows, text) stop here
  const own = LEAVERS.find((l) => n.matches(l.sel));
  if (own) return [{ el: n, l: own, top: true }]; // inner overlays leave with it
  return Array.from(n.querySelectorAll<HTMLElement>(ALL)).filter((el) => !el.closest(".lv"))
    .map((el) => ({ el, l: LEAVERS.find((l) => el.matches(l.sel))!, top: false }));
}

/* ---------- Sliding pill (step 3) ----------
   Every switch (`.seg`: Day/Week/Month, filters, roles…) gets one white pill that slides to the picked
   option instead of jumping. Works on any `.seg` with no wiring: the watcher finds them. The pill copies the
   picked option's own look (background, shadow, corner), so custom switches keep their style. */
const segOff = new WeakMap<HTMLElement, () => void>();

function pickedIn(seg: HTMLElement) {
  return Array.from(seg.children).find((c) => c.classList.contains("on") && !c.classList.contains("seg-pill")) as HTMLElement | undefined;
}

export function slideSeg(seg: HTMLElement) {
  if (segOff.has(seg) || typeof ResizeObserver === "undefined" || seg.closest(".lv")) return; // never inside a leaving copy
  const pill = document.createElement("i");
  pill.className = "seg-pill";
  pill.setAttribute("aria-hidden", "true");
  let styled = false;
  const place = () => {
    const b = pickedIn(seg);
    if (!b) { pill.style.opacity = "0"; return; }
    if (!styled) { // copy the picked option's look once, before the pill takes it over
      const cs = getComputedStyle(b);
      pill.style.background = cs.backgroundColor; pill.style.boxShadow = cs.boxShadow; pill.style.borderRadius = cs.borderRadius;
      styled = true;
      seg.classList.add("pilled");
    }
    pill.style.opacity = "1";
    pill.style.width = `${b.offsetWidth}px`; pill.style.height = `${b.offsetHeight}px`;
    pill.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  };
  seg.appendChild(pill);
  place();
  requestAnimationFrame(() => seg.classList.add("pill-ready")); // first spot without sliding in from 0
  const mo = new MutationObserver((recs) => { if (recs.some((r) => r.target !== pill)) place(); });
  mo.observe(seg, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
  const ro = new ResizeObserver(place);
  ro.observe(seg);
  segOff.set(seg, () => { mo.disconnect(); ro.disconnect(); });
}
function segsIn(n: Node, fn: (el: HTMLElement) => void) {
  if (!(n instanceof HTMLElement)) return;
  if (n.matches(".seg")) fn(n);
  n.querySelectorAll<HTMLElement>(".seg").forEach(fn);
}
const unSeg = (el: HTMLElement) => { segOff.get(el)?.(); segOff.delete(el); };

/* ---------- Lists + money (step 4) ----------
   Rows marked `.flow` (ticket lines, checkout rows/cards, waitlist) grow in when added to a list already on
   screen and fold away when removed (a silent copy folds, the real row is already gone). A whole list
   arriving (page load, filter) doesn't animate; a row moving (re-sort) doesn't either. `data-flow="card"` =
   fade + grow a touch instead of height. Money marked `data-roll` (and KPI tiles `.stat .v`) settles in
   with a short lift when its value changes. */
const EASE = "cubic-bezier(.2,.8,.2,1)", EASE_OUT = "cubic-bezier(.4,0,.9,.5)";
const ROLL = "[data-roll], .stat .v";

function sanitize(g: HTMLElement) {
  for (const el of [g, ...Array.from(g.querySelectorAll<HTMLElement>("*"))]) { el.removeAttribute("id"); el.removeAttribute("data-testid"); el.removeAttribute("name"); }
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  g.classList.add("lv");
}
function flowIn(el: HTMLElement) {
  if (el.dataset.flow === "card") { el.animate([{ opacity: 0, scale: ".97" }, { opacity: 1, scale: "1" }], { duration: 280, easing: EASE }); return; }
  const h = el.offsetHeight, cs = getComputedStyle(el);
  el.style.overflow = "hidden";
  const a = el.animate([
    { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 },
    { height: `${h}px`, minHeight: "0px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
  ], { duration: 280, easing: EASE });
  a.onfinish = a.oncancel = () => { el.style.overflow = ""; };
}
function flowOut(el: HTMLElement, parent: Node, next: Node | null) {
  const g = el.cloneNode(true) as HTMLElement;
  sanitize(g);
  g.style.pointerEvents = "none";
  parent.insertBefore(g, next && next.parentNode === parent ? next : null);
  const card = el.dataset.flow === "card";
  const h = g.offsetHeight, cs = getComputedStyle(g);
  g.style.overflow = "hidden";
  const a = card
    ? g.animate([{ opacity: 1, scale: "1" }, { opacity: 0, scale: ".97" }], { duration: 200, easing: EASE_OUT, fill: "forwards" })
    : g.animate([
      { height: `${h}px`, minHeight: "0px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
      { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 },
    ], { duration: 240, easing: EASE_OUT, fill: "forwards" });
  const done = () => g.remove();
  a.onfinish = done;
  setTimeout(done, MAX_MS);
}
function roll(el: HTMLElement) {
  el.getAnimations().forEach((x) => { if (x.id === "roll") x.cancel(); });
  const a = el.animate([{ opacity: 0.3, translate: "0 6px", filter: "blur(1.5px)" }, { opacity: 1, translate: "0 0", filter: "blur(0)" }], { duration: 300, easing: EASE });
  a.id = "roll";
}

/** Start once (AppProviders). Returns stop. */
export function startLeaveWatch(): () => void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const onScroll = (e: Event) => { const t = e.target; if (t instanceof Element) scrolls.set(t, [t.scrollTop, t.scrollLeft]); };
  document.addEventListener("scroll", onScroll, true);
  document.addEventListener("click", markSwap, true);
  window.addEventListener("popstate", markPop);
  document.addEventListener("keydown", clearSwap, true);
  document.querySelectorAll<HTMLElement>(".seg").forEach(slideSeg);
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      r.addedNodes.forEach((n) => segsIn(n, slideSeg));
      r.removedNodes.forEach((n) => segsIn(n, (el) => { if (!el.isConnected) unSeg(el); }));
    }
    if (reducedMotion()) return;
    // lists + money (step 4)
    const removed = new Set<Node>(), added = new Set<Node>(), rolls = new Set<HTMLElement>();
    const isFlow = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.classList.contains("flow") && !n.classList.contains("lv");
    const perList = new Map<Node, number>(); // a bulk change (filter, new day, page) doesn't animate: only 1–2 rows at a time do
    for (const r of recs) {
      r.removedNodes.forEach((n) => { removed.add(n); if (isFlow(n)) perList.set(r.target, (perList.get(r.target) ?? 0) + 1); });
      r.addedNodes.forEach((n) => { added.add(n); if (isFlow(n)) perList.set(r.target, (perList.get(r.target) ?? 0) + 1); });
    }
    for (const r of recs) {
      const t = r.target instanceof HTMLElement ? r.target : r.target.parentElement;
      const money = t?.closest<HTMLElement>(ROLL);
      if (money && !money.closest(".lv") && (r.type === "characterData" || r.type === "childList")) rolls.add(money);
      if (r.type !== "childList" || !r.target.isConnected || (r.target as Element).closest?.(".lv")) continue;
      if ((perList.get(r.target) ?? 0) > 2) continue;
      r.addedNodes.forEach((n) => { if (isFlow(n) && !removed.has(n) && n.isConnected) flowIn(n); });
      r.removedNodes.forEach((n) => { if (isFlow(n) && !added.has(n) && !n.isConnected) flowOut(n, r.target, r.nextSibling); });
    }
    rolls.forEach(roll);
    for (const r of recs) {
      r.removedNodes.forEach((n) => {
        for (const { el, l, top } of leaversIn(n)) {
          if (el.isConnected) continue; // moved, not removed
          // a swap (one drawer for another, Settings page to page) is not a close
          if (Array.from(document.querySelectorAll(l.sel)).some((x) => !x.closest(".lv"))) continue;
          if (SWAP_SEL.has(l.sel) && settingsSwap()) continue;
          const parent = r.target as HTMLElement;
          const home = top && parent.isConnected ? parent : l.local ? null : document.body;
          if (!home) continue;
          const { g, scrolled } = ghostOf(el, l.kind);
          const next = top && r.nextSibling && r.nextSibling.parentNode === home ? r.nextSibling : null;
          home.insertBefore(g, next);
          play(g, scrolled);
        }
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => { mo.disconnect(); document.removeEventListener("scroll", onScroll, true); document.removeEventListener("click", markSwap, true); window.removeEventListener("popstate", markPop); document.removeEventListener("keydown", clearSwap, true); document.querySelectorAll<HTMLElement>(".seg").forEach(unSeg); };
}

/** In-flow things (banners): fold the real one away, then call done (which removes it). Instant with reduced motion. */
export function collapseOut(el: HTMLElement | null, done: () => void) {
  if (!el || reducedMotion() || typeof el.animate !== "function") return done();
  const h = el.offsetHeight;
  const cs = getComputedStyle(el);
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  const a = el.animate([
    { height: `${h}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" },
  ], { duration: 220, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
  let called = false;
  const fin = () => { if (!called) { called = true; done(); } };
  a.onfinish = fin;
  setTimeout(fin, 400);
}
