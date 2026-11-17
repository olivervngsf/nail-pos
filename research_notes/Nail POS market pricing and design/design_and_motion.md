# Design and motion playbook: Apple-like, simple, lifelike POS for senior Vietnamese salon staff

Research notes, 2026-11-16. Scope: visual style, motion rules, examples for a web app (desktop front desk, shared iPad, phones).
Note on method: developer.apple.com HIG pages render with JavaScript and returned no body text when fetched; nngroup.com could not be fetched from this session (host not allowed). Findings from those sites below come from search-result excerpts and secondary coverage, and are flagged where that matters.

## 1. Apple HIG: motion, materials, typography, depth, Liquid Glass, springs

### Takeaway
Apple's own spring model is two numbers, duration and bounce. Default to bounce 0, use about 0.15 for a light "alive" feel, and treat 0.3+ as clearly bouncy. Liquid Glass (2025) is a translucent layer for controls and navigation that floats over content. It drew wide legibility criticism, and Apple added a more opaque "Tinted" option in iOS 26.1. For a POS used by senior staff, borrow Apple's springs, hierarchy and restraint, but not the see-through glass behind text.

### Cited Findings
- WWDC23 "Animate with springs" (session 10158) sets up springs with two parameters, **duration** and **bounce**. Bounce ranges from -1.0 to 1.0, and the session's example is `.spring(duration: 0.6, bounce: 0.2)`. — [Apple WWDC23 10158](https://developer.apple.com/videos/play/wwdc2023/10158?time=1117); [WWDC Notes](https://wwdcnotes.com/notes/wwdc23/10158)
- SwiftUI ships three presets, smooth, snappy and bouncy, which can be tuned (for example `.snappy(duration: 0.4)`). Apple's advice when unsure is bounce 0, which is also the default. — [WWDC Notes 10158](https://wwdcnotes.com/documentation/wwdc23-10158-animate-with-springs/)
- In the session's demos, about 15% bounce "doesn't feel very bouncy," while about 30% bounce gives "noticeable bounciness." Community notes add that values above about 0.4 can feel exaggerated for UI. That warning comes from the community notes, not from Apple. — [WWDC Notes 10158](https://wwdcnotes.com/notes/wwdc23/10158)
- The same duration and bounce model exists in UIKit/Core Animation: `UIView.animate(duration: 0.6, bounce: 0.2)` and `CASpringAnimation(perceptualDuration:bounce:)`. — [WWDC Notes 10158](https://wwdcnotes.com/notes/wwdc23/10158)
- iOS 26 Liquid Glass drew wide legibility complaints from beta through launch (Sept 2025). Translucent notifications, Control Center and tab bars "blend a bit too well with the background," and critics compared it to Windows Vista. — [MacRumors](https://www.macrumors.com/2025/09/17/ios-26-liquid-glass-critiques/); [Beebom](https://gadgets.beebom.com/news/users-slam-ios-26-liquid-glass-design-over-readability-concerns); [Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/)
- NN/g (Raluca Budiu, Oct 2025), "Liquid Glass Is Cracked, and Usability Suffers in iOS 26": the look is "light, airy — and often invisible." It says anything placed on top of something else gets harder to see, that the visual language "obscures content instead of letting it take the spotlight," and that the old guideline of at least 0.4 cm between targets "seems to have been dropped." I read this only as excerpts. — [NN/g](https://nngroup.com/articles/liquid-glass); [OSNews summary](https://www.osnews.com/story/143522/liquid-glass-is-cracked-and-usability-suffers-in-ios-26/)
- Infinum's main accessibility criticism is low contrast. Users fell back on the Reduce Transparency setting. — [Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/)
- iOS 26.1 added Settings > Display & Brightness > Liquid Glass with two options. "Clear" is the original look. "Tinted" "increases opacity of the material" and adds contrast. The setting also exists on iPad and Mac, though one tester saw little effect on macOS beta. — [TechCrunch](https://techcrunch.com/2025/10/20/apple-will-let-users-roll-back-the-liquid-glass-look-with-new-tinted-option); [Daring Fireball](https://daringfireball.net/linked/2025/10/21/ios-26-1-beta-4-liquid-glass-tinted-option); [Tom's Guide](https://www.tomsguide.com/phones/iphones/ios-26-1-lets-you-adjust-liquid-glass-transparency-on-your-iphone-heres-how-to-do-it)
- Apple's minimum tappable area is 44×44 pt for all controls, with invisible padding when the visual is smaller. Material's is 48×48 dp. These figures come from secondary sources that quote the HIG. — [TetraLogical](https://tetralogical.com/blog/2022/12/20/foundations-target-size/); [Design Systems Collective](https://www.designsystemscollective.com/a-designers-field-guide-to-wcag-ios-and-android-rules-31ba5d01d46a)

### Inferences
- **What to borrow from Apple:** spring motion with bounce 0 to 0.15, a strong type hierarchy (one big number per screen), lots of whitespace, soft layered surfaces (cards with a subtle shadow), and motion that follows the finger.
- **What to skip:** real Liquid Glass (backdrop-filter blur with see-through text). It costs contrast, and on low-end iPads and Android `backdrop-filter` is expensive (see section 2). If we want a "glass" hint, keep it to non-text chrome (a top bar, a sheet edge) at 90%+ opacity, which is close to Apple's own "Tinted" fallback.
- Mapping to the web: an Apple spring with duration 0.4 s and bounce 0.1 works as a CSS `linear()` curve over about 400 ms.

### Gaps
- Exact current HIG wording on motion, materials and typography (Dynamic Type sizes, SF Pro tracking) could not be fetched, because the pages render with JS. Check developer.apple.com/design/human-interface-guidelines/motion and /materials directly.
- I found no Apple numbers for when Liquid Glass "regular" vs "clear" should be used beyond press summaries.
- The WWDC25 Liquid Glass sessions ("Meet Liquid Glass," "Get to know the new design system") were not reviewed.

## 2. Motion on the web: View Transitions, linear() springs, Motion library, low-end devices, reduced motion

### Takeaway
The building blocks are now Baseline: same-document View Transitions (Chrome, Safari 18.x, Firefox 144) and CSS `linear()` for real spring curves. Animate only transform and opacity so motion runs on the GPU, off the main thread, which matters on cheap shared iPads and Android phones. Always respect `prefers-reduced-motion`, swapping slides for fades rather than removing all feedback.

### Cited Findings
- Firefox 144 (Oct 2025) shipped same-document view transitions (`document.startViewTransition()`, `view-transition-name`). That made them "Baseline Newly available." — [web.dev, Oct 2025](https://web.dev/blog/web-platform-10-2025); [web.dev Baseline post](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available?authuser=17&hl=de)
- Cross-document (multi-page) view transitions are supported in Chrome 126+. Firefox status was not confirmed, and sources disagree on whether Safari's first same-document version was 18.0 or 18.2. — [Chrome docs](https://developer.chrome.com/docs/web-platform/view-transitions); [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/view-transitions); [caniuse](https://caniuse.com/cross-document-view-transitions)
- CSS `linear()` interpolates between many points, so it can draw bounce and spring curves that `cubic-bezier()` cannot. It does not set a duration, so you still choose one. About 50 to 100 points is enough for a good spring. Feature-detect it with `CSS.supports('animation-timing-function','linear(0, 1)')` and fall back to a JS library (Motion, GSAP) where it's missing. — [Chrome for Developers: linear()](https://developer.chrome.com/docs/css-ui/css-linear-easing-function); [Chrome physics-based easing](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/physics-based-easing); [Josh Comeau](https://joshwcomeau.com/animation/linear-timing-function); [PQINA](https://pqina.nl/blog/css-spring-animation-with-linear-easing-function/)
- Motion (formerly Framer Motion) can run opacity, transform, filter and clipPath as hardware-accelerated animations on WAAPI, off the main JS thread, so they "stay smooth no matter how busy the main JS thread gets." Caveats: Motion's independent transforms use CSS variables and are not accelerated, so animate `transform` directly when it matters. Percentage transforms like `translateX(100%)` were historically not accelerated in Chrome. — [Motion: performance](https://motion.dev/docs/performance); [Motion: feature comparison](https://motion.dev/docs/feature-comparison); [Motion perf tier list 2025](https://motion.dev/blog/web-animation-performance-tier-list-2025)
- Animating layout properties (width, height, top, left) is the slow path, and x, y, scale, rotate and opacity are the cheap ones. This is from a secondary guide. — [Mintlify Motion guide](https://www.mintlify.com/motiondivision/motion/guides/performance)
- WCAG 2.3.3 Animation from Interactions (AAA): "Users are not harmed or distracted by motion." People with vestibular disorders can get dizziness, headaches or nausea. Technique C39 is the CSS `prefers-reduced-motion` query. Motion that is "essential to the functionality or the information" is exempt. — [W3C Understanding 2.3.3](https://w3.org/WAI/WCAG21/Understanding/animation-from-interactions); [W3C C39](https://w3.org/WAI/WCAG22/Techniques/css/C39)
- JS-driven motion (Motion, GSAP, Lottie) must also check `window.matchMedia('(prefers-reduced-motion: reduce)')`. "Reduce" does not have to mean "remove," so swap movement for opacity fades. — [TestParty guide](https://testparty.ai/blog/wcag-animation-interactions-guide); [Val Head, Making Motion Inclusive](https://noti.st/valhead/xICaMq/present)

### Inferences
- **Recommended stack:** use CSS transitions with a few `linear()` spring tokens for 90% of motion, View Transitions for screen-to-screen moves and the turn-list reorder, and Motion's `layout` animations only where the CSS route falls short (drag to reorder). Motion's mini `animate()` is small enough to load lazily.
- Fallback rule: without `startViewTransition`, just swap the DOM instantly. The action must never wait on an animation.
- **Offline-first fit:** motion must never block input. Make animations interruptible, so a second tap cancels the first animation and acts at once.
- **Budget for low-end devices:** no `backdrop-filter` blur on large areas, no animated box-shadows (fade a pseudo-element's opacity instead), and no more than about 2 to 3 elements animating at once on shared iPads.
- **Reduced-motion mode:** replace slides and scales with a 150 ms opacity fade, keep color and check-mark feedback, and set number count-ups to show the final value at once.

### Gaps
- I found no benchmark numbers (fps) for View Transitions or `backdrop-filter` on specific low-end iPads (for example the 9th-gen iPad) or budget Android. Test on the pilot devices.
- Firefox and Safari cross-document view transition support was not confirmed.

## 3. Elegant POS / commerce / booking apps: what makes them feel premium

### Takeaway
Little verifiable design analysis is public. Square's own write-ups stress decluttering, configurable navigation and "modes" per industry, but its 2025 redesign also drew strong user pushback over extra taps. Salon tools (GlossGenius, Boulevard) are praised as "sleek" and "elegant" mostly in user reviews. The lesson is that premium feel comes from fewer taps and calm hierarchy. A redesign that adds taps gets punished even if it looks nicer.

### Cited Findings
- Square (Block) launched a next-generation unified Square POS app in April 2025, with industry "modes": "The power and ease of Square Point of Sale resides in its modes." — [Block, Apr 24 2025](https://block.xyz/inside/introducing-the-next-generation-square-point-of-sale-app)
- Square's redesign moved Keypad, Item Library and Favorites into tabs with a customizable navigation bar, aiming to declutter the POS for busy hours and adapt to each business. — [Square: POS redesign](https://squareup.com/us/en/the-bottom-line/inside-square/square-pos-redesign); [Square Seller Community](https://www.sellercommunity.com/t5/Product-Updates/Square-Point-of-Sale-has-a-new-look/ba-p/279454)
- Pushback: a Square community thread titled "New Square POS App interface is awful" says added taps made it less efficient, that useful features were removed, and that choices felt disconnected from real retail use. — [Square Community](https://community.squareup.com/t5/Hardware-Setup-Troubleshooting/New-Square-POS-App-interface-is-awful/td-p/663234)
- For Square Handheld (2025), designers visited small businesses, spoke with staff across roles, and 3D-printed prototypes so the device would not feel bulky. — [Square: Handheld design](https://squareup.com/au/en/the-bottom-line/inside-square/square-handheld-pos)
- GlossGenius is described as having a "sleek, beauty-focused design and mobile-first approach" and as "elegant, user-friendly," with limited customization. Boulevard reviewers praise its "sleek design" and "quality, design, and exceptional client experience." These are review and affiliate sites, not design judges. — [The Salon Business](https://thesalonbusiness.com/glossgenius-vs-boulevard/); [Capterra](https://www.capterra.com/compare/174830-180087/GlossGenius-vs-Boulevard)
- GlossGenius was named a Fast Company Most Innovative Company in 2024. — [Fast Company](https://www.fastcompany.com/91039860/glossgenius-most-innovative-companies-2024)

### Inferences (from widely known product patterns, not sourced here; verify with Mobbin screenshots)
- Stripe Dashboard / Checkout: a calm neutral palette, one accent color, tabular numbers, and quick inline success states.
- Linear: speed as the feature. Instant optimistic updates, short transitions (roughly 100 to 200 ms), and no spinners for local actions.
- Cash App / Revolut: one huge number in the center, a big keypad, and a full-screen success moment with a check mark.
- Apple Store app: big product imagery, generous whitespace, and bottom sheets.
- The shared pattern behind "premium" is: (1) one dominant number or action per screen, (2) a restrained palette with one accent, (3) instant feedback with optimistic UI, (4) consistent spring timing everywhere.

### Gaps
- I found no first-party design case studies from Toast, GlossGenius, Boulevard, Cash App or Revolut about their motion specs. The Mobbin connector is available in this workspace, and a follow-up could pull real screens (search "checkout success," "payment complete," "tip screen").

## 4. Designing for older adults and low digital literacy

### Takeaway
Targets should be well above platform minimums. Studies of adults 55+ favor around 32 px for pointing and 64 px for drag or "steering" tasks, and older users make more "slip" errors. Text should be at least 16 px and user-scalable. Pair this with reduced motion, explicit confirmation of money actions, and easy undo.

### Cited Findings
- WCAG 2.2 SC 2.5.8 (AA) requires a minimum target of 24×24 CSS px. SC 2.5.5 (AAA) asks for 44×44 CSS px. — [specification.website](https://specification.website/spec/accessibility/touch-target-size.md); [EZUD](https://ezud.com/touch-target-sizes-mobile-accessibility/)
- In a study of adults aged 55 to 89, 32 px targets best supported pointing, while 64 px targets helped with steering tasks (drag or swipe). — [MDSOAR / UMBC study](https://mdsoar.org/handle/11603/19868)
- Older adults (65 to 84) had low accuracy on small targets and improved noticeably when targets grew from 16 to 24 px. — [Hourcade & Berkel 2006](https://course.ccs.neu.edu/csg170/ssl/hourcade06.pdf)
- Older adults had longer selection times, higher error rates, and more "slip" errors, where the finger moves off the target before release. — [McGill thesis](https://escholarship.mcgill.ca/downloads/6108vh322)
- Adults 60+ were better than younger adults at picking their own optimal target size. Younger adults underestimated the smallest size they could reliably hit by almost 6 mm, so young designers tend to make targets too small. — [Univ. of Washington, ASSETS '19](https://faculty.washington.edu/wobbrock/pubs/assets-19.06.pdf)
- NN/g (2013, since superseded) recommended at least 12-point fonts by default for senior-targeted sites, and that all sites let users enlarge text. The 2019 update (Kane) says apps designed by and for young people are often inaccessible to older users. The commonly quoted "16 pt or larger" comes from secondary sources citing NN/g, not NN/g itself. — [NN/g, seniors](https://www.nngroup.com/articles/usability-seniors-improvements/); [secondary deck](https://docs.google.com/presentation/d/1vjCppR0dLi58cSZ_4vncU1SV7Ex7G9x4/htmlpresent)
- A 2022 systematic review found older adults prefer larger fonts, but past a critical size readability declines. Bigger is not always better. — [Frontiers in Psychology 2022](https://frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.931646/text)
- NN/g's Liquid Glass critique notes a lost guideline of at least 0.4 cm (about 4 mm) spacing between targets. — [NN/g excerpt via OSNews](https://www.osnews.com/story/143522/liquid-glass-is-cracked-and-usability-suffers-in-ios-26/)

### Inferences (proposed spec for Nail POS)
- **Touch targets:** primary actions at least 64 px tall on iPad and phone (for example "Charge," "Next client," PIN keys) and 48 px minimum for anything tappable. Keep at least 8 px (about 4 mm at typical densities) between targets. PIN keypad keys should be about 72 to 80 px square.
- **Slip tolerance:** trigger on pointer-up inside an enlarged hit area, with no actions on tap-down. Avoid swipe-only gestures. Every swipe needs a button version (64 px steering finding).
- **Type:** body text 18 px minimum on iPad and phone, 16 px minimum on desktop. Money totals 40 to 64 px. Labels never under 14 px. Respect browser zoom and text scaling, so no fixed-height text boxes.
- **Contrast:** at least WCAG AA 4.5:1 for text, aiming for 7:1 on money and PIN screens. No text on blurred or transparent backgrounds.
- **Confirmation:** confirm only irreversible money actions (refund, void, payout) with a full-screen confirm that names the amount and person ("Refund $45 to Lan?"). For everything else, act at once and show a 5 to 8 s "Undo" toast, which is faster than confirm dialogs.
- **Error recovery:** plain-language errors in Vietnamese and English, never error codes. Keep the user's input, and offer one clear next step.
- **Motion sensitivity:** default motion is subtle (no parallax, no zooms over 1.05 scale), with full reduced-motion support.

### Gaps
- The full NN/g 2019 "Usability for Seniors: Challenges and Changes" figures (target size, font size) could not be fetched.
- I found no research specific to Vietnamese-speaking older adults or nail salon workers' digital literacy. Pilot usability tests are needed.

## 5. Vietnamese typography

### Takeaway
Be Vietnam Pro, made by Vietnamese designers, is built for Vietnamese diacritics and is the strongest default. Inter also supports Vietnamese, but the `vietnamese` subset must be loaded on purpose. Vietnamese needs more line-height than Latin (about 120% is enough for Latin alone), so plan for about 1.4 to 1.5 for body text and test stacked marks.

### Cited Findings
- Be Vietnam Pro (by Lâm Bảo, Tony Le, ViệtAnh Nguyễn) is a Neo Grotesk with "refined Vietnamese letterforms with diacritics adaptive forms … engineered for the best readability." It comes in 9 weights and is free on Google Fonts and Fontsource. — [RightFont](https://rightfontapp.com/family/be+vietnam+pro); [Fontsource](https://fontsource.org/fonts/be-vietnam-pro/about); [GitHub mirror](https://gitee.com/chenyondong/BeVietnamPro)
- Inter supports Vietnamese, but as a separate subset. Some tools (for example Bricks Builder local fonts) drop it, so Vietnamese glyphs fall back to another font and render wrong. When self-hosting, include the `vietnamese` subset and `unicode-range`. — [Bricks forum](https://forum.bricksbuilder.io/t/duplicate-local-fonts-missing-vietnamese-glyphs-due-to-ignored-google-fonts-language-subsets/37575); [Fontsource discussion](https://github-redirect.dependabot.com/fontsource/fontsource/discussions/674); [Next.js forum](https://nextjs-forum-web.vercel.app/post/1347046618179960872)
- Mixed-font fallback is a known Vietnamese failure, where custom fonts render diacritics in a different font. — [Articulate community](https://community.articulate.com/discussions/rise-360/custom-font-errors-diacritic-marks-vietnamese-not-showing-up-in-the-correct-font)
- Type designers note that Vietnamese needs more generous line spacing than Latin (about 120% may suffice for Latin), and that fonts supporting it often need larger ascender metrics for stacked diacritics. — [TypeDrawers](https://typedrawers.com/discussion/comment/32690); [TypeDrawers](https://typedrawers.com/discussion/comment/67954)
- Vietnamese typography interview with Donny Truong (background reading). — [Type Thursday](https://medium.com/type-thursday/d7769476ae75)

### Inferences
- **Font stack:** `"Be Vietnam Pro", -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif`. Self-host it (offline-first, PWA cache) with the Vietnamese subset preloaded, so nothing depends on Google Fonts at runtime. SF Pro is a good system fallback on Apple devices, though its Vietnamese quality was not verified here.
- **Line-height:** body 1.5, headings 1.25 to 1.3, big money numbers 1.1. Those numbers have no diacritics, but nearby labels do, so give them padding. Never clip text boxes with `overflow:hidden` and a tight height. Test with strings like "Ăn được ngủ được là tiên," "Nguyễn Thị Hằng," "Bột đắp."
- **Numbers:** use `font-variant-numeric: tabular-nums` so money and turn counts do not jiggle while counting up.
- **Length:** Vietnamese labels often run longer than English, so design buttons for about 30% extra width and allow two-line labels.

### Gaps
- I found no official Be Vietnam Pro vertical metrics or recommended line-height, and no verified source on SF Pro's or Inter's Vietnamese quality compared with Be Vietnam Pro.

## 6. Motion that carries meaning in a POS (concrete examples with durations)

### Takeaway
Most UI motion should take 100 to 500 ms: about 100 ms for simple feedback, 200 to 300 ms for larger changes like a modal, and 400 ms only for big moves across large screens. Too long is the usual mistake. For a POS, every animation should confirm a fact (paid, sent, saved, moved) and never delay the next tap.

### Cited Findings
- NN/g: most animations should be 100 to 500 ms depending on complexity and distance. Simple feedback (toggle, checkbox) about 100 ms, large changes (modal) 200 to 300 ms, and up to 400 ms for big moves on large screens. Use the shortest duration that doesn't feel jarring, since animations are usually too long rather than too short. — [NN/g: Animation duration](https://nngroup.com/articles/animation-duration)
- Material 3 duration tokens run from Short1 (50 ms) to ExtraLong4 (1000 ms). The emphasized-accelerate curve is `cubic-bezier(0.3, 0, 0.8, 0.15)`. Sources conflict on the emphasized and decelerate value: (0.05, 0.7, 0.1, 1.0) vs (0.2, 0, 0, 1). The M3 Expressive update moves to semantic spring tokens. — [Android Compose atom](https://skill-wiki.github.io/atom/android-compose/rule-motion-easing-tokens); [Flutter motion template](https://flutter.googlesource.com/mirrors/flutter/+/HEAD/dev/tools/gen_defaults/lib/motion_template.dart); [Besthub on M3 Expressive](https://www.besthub.dev/articles/why-google-s-material-3-update-turns-motion-into-a-theme-it-s-not-about-the-bounce-9436fce4a345)
- Apple spring reference values: bounce 0 by default, about 0.15 for a subtle "alive" feel, and about 0.3 for noticeable bounce. — [WWDC Notes 10158](https://wwdcnotes.com/notes/wwdc23/10158)
- Atlassian's design system publishes applied motion guidance (enter, exit, feedback) as a reference for token structure. — [Atlassian: Applying motion](https://atlassian.design/foundations/motion/applying-motion)

### Inferences: proposed motion tokens and POS moments
These values are our proposals, derived from the cited ranges, and need testing in the pilot.

**Tokens**
- `--dur-instant: 100ms` (press states, toggles), `--dur-quick: 200ms` (small moves, toasts), `--dur-base: 300ms` (sheets, cards, reorder), `--dur-slow: 450ms` (full-screen success only)
- `--ease-out: cubic-bezier(0.2, 0, 0, 1)` for entering. `--ease-in: cubic-bezier(0.3, 0, 0.8, 0.15)` for exiting (exits about 20 to 30% shorter than entries).
- `--spring-snappy`: a `linear()` curve generated for about bounce 0.1 over 300 ms (default for moves). `--spring-gentle`: about bounce 0.15 over 450 ms (success moments only). No bounce above 0.2 anywhere.

**Moments**
| Moment | What it shows | Motion | Duration |
|---|---|---|---|
| Button press | "I heard you" | scale 1 to 0.97 on press, release with spring; color darken | 100 ms down, 200 ms up |
| PIN digit entered | progress | dot fills plus a tiny scale pop 1 to 1.15 to 1 | 150 ms |
| Wrong PIN | error, try again | horizontal shake about 3 cycles, ±8 px, plus red dots, then clear (reduced motion: red flash only) | 300 to 400 ms |
| Payment success | money is in | green circle draws, check mark strokes in, amount stays big; hold 1.5 s and then auto-advance, or tap to skip | 450 ms animation, 1.2 to 1.5 s hold |
| Ticket sent / receipt texted | it went out | button morphs into a check mark plus a "Sent" label; no modal | 300 ms |
| Saved offline | safe, will sync | small cloud icon with a dot slides in a calm amber, label "Đã lưu — sẽ đồng bộ" / "Saved, will sync" | 200 ms in; stays until synced |
| Synced | all caught up | amber to green check, fades after 2 s | 200 ms + 2 s |
| Offline banner | no internet, still working | slim top bar slides down; never covers buttons; no pulsing | 250 ms |
| Turn list reorder | who's next changed | View Transition / FLIP: rows slide to new spots, the moved row gets a 1 s highlight tint | 300 ms move |
| New walk-in added | list grew | row fades and expands from 0 height (or uses a View Transition) | 250 ms |
| Money count-up (payout, dashboard) | the total | number counts from the previous value (not 0) with ease-out, tabular numbers; skipped if reduced motion or change < $1 | 400 to 600 ms (max 800 ms) |
| Sheet / drawer | detail without losing place | slide up 300 ms ease-out; exit 200 ms | 300 / 200 ms |
| Screen to screen | where am I | crossfade plus a 16 to 24 px slide, or a shared-element View Transition | 250 to 300 ms |

**Rules**
1. Motion never blocks the next tap. The action takes effect at once (optimistic) and the animation plays alongside it.
2. Movement at most 24 px for transitions. Scale range 0.97 to 1.05.
3. One animated focal point at a time.
4. Same action, same motion, everywhere (consistency principle).
5. Status uses color, icon and words, never motion alone, so it stays readable with motion off.
6. Sound or haptics on payment success are optional. Web Vibration API works on Android only, not iOS Safari. That is from general knowledge and not verified here.

### Gaps
- I found no published durations from Square, Stripe or Cash App for their payment-success animations. The table above is a proposal, not observed data.

## 7. Pitfalls: motion that slows staff, glass that hurts readability

### Takeaway
The two biggest risks are decorative motion that adds wait time on every ticket, and see-through surfaces that cut contrast. Both have public precedents: Square's tap-heavy redesign backlash and iOS 26 Liquid Glass.

### Cited Findings
- Animations are usually too long rather than too short, so use the shortest duration that doesn't feel jarring. — [NN/g: Animation duration](https://nngroup.com/articles/animation-duration)
- Square users rejected a redesign that added taps, even though it was meant to declutter. — [Square Community](https://community.squareup.com/t5/Hardware-Setup-Troubleshooting/New-Square-POS-App-interface-is-awful/td-p/663234)
- Translucent Liquid Glass cut legibility. Apple responded with a more opaque "Tinted" option, and users turned on Reduce Transparency. — [NN/g](https://nngroup.com/articles/liquid-glass); [TechCrunch](https://techcrunch.com/2025/10/20/apple-will-let-users-roll-back-the-liquid-glass-look-with-new-tinted-option); [Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/)
- Interaction-triggered motion can cause dizziness and nausea for people with vestibular disorders. — [W3C 2.3.3](https://w3.org/WAI/WCAG21/Understanding/animation-from-interactions)
- Non-accelerated properties (layout, CSS-variable transforms) can stutter when the main thread is busy, for example while syncing offline data. — [Motion: performance](https://motion.dev/docs/performance)
- Older adults make more slip errors, so drag and swipe gestures and small, tight targets hurt them most. — [McGill thesis](https://escholarship.mcgill.ca/downloads/6108vh322); [MDSOAR study](https://mdsoar.org/handle/11603/19868)

### Inferences (checklist)
- No splash or intro animations, no loading skeletons that shimmer longer than the data takes to arrive, and no animated route changes over 300 ms.
- No forced "success" screens that must be dismissed. Auto-advance, and allow tap to skip.
- No blur or transparency behind text, prices, names or PINs.
- No motion during a background sync that competes with input (use `requestIdleCallback` / low priority).
- No swipe-only actions (swipe to delete, swipe to check in) without a visible button.
- Test with motion off and at 200% text size, on the cheapest pilot iPad.

### Gaps
- I found no studies measuring time cost or error rates of animation in POS or retail checkout specifically. Measure in the pilot (taps and seconds per checkout).
