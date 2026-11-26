"use client";
// Motion · leave gently (Nov 26, motion plan step 2).
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

/** Start once (AppProviders). Returns stop. */
export function startLeaveWatch(): () => void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const onScroll = (e: Event) => { const t = e.target; if (t instanceof Element) scrolls.set(t, [t.scrollTop, t.scrollLeft]); };
  document.addEventListener("scroll", onScroll, true);
  const mo = new MutationObserver((recs) => {
    if (reducedMotion()) return;
    for (const r of recs) {
      r.removedNodes.forEach((n) => {
        for (const { el, l, top } of leaversIn(n)) {
          if (el.isConnected) continue; // moved, not removed
          // a swap (one drawer for another, Settings page to page) is not a close
          if (Array.from(document.querySelectorAll(l.sel)).some((x) => !x.closest(".lv"))) continue;
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
  mo.observe(document.body, { childList: true, subtree: true });
  return () => { mo.disconnect(); document.removeEventListener("scroll", onScroll, true); };
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
