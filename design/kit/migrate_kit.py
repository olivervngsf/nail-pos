"""One-time move of every board onto design/kit/kit.css: removes hand-made copies of shared pieces."""
import re, sys
R = sys.argv[1]
DROP = {  # file -> selectors whose rules are removed (kit has them)
 'checkout/Cash': ['.key', '.key:active'],
 'checkout/Main': ['.scrim', '.drawer', '.opt', '.opt:last-child', '.opt:hover', '.chip', '.chip.on'],
 'checkout/Profile': ['.opt', '.opt:last-child', '.scrim', '.toast'],
 'onboarding/Services': ['.pick'],
 'onboarding/Staff': ['.toast', '.toast button'],
 'booking/BookPhone': ['.opt', '.opt:last-child', '.opt:hover', '.opt.on', '.inp'],
 'booking/BookWeb': ['.inp'],
 'booking/Cal': ['.banner', '.chip', '.chip.on', '.chip.sug', '.toast', '.toast button'],
 'booking/Main': ['.scrim', '.drawer', '.opt', '.opt:last-child', '.opt:hover', '.toast', '.toast button'],
 'booking/PageSettings': ['.scrim', '.sheet'],
 'main/Me': ['.opt', '.opt:last-child', '.opt:hover', '.sw', '.sw::after', '.sw.on', '.sw.on::after'],
}
ADD = {  # layout-only overrides kept per screen
 'onboarding/Staff': '.toast{bottom:96px}',
 'booking/Cal': '.banner{position:absolute;left:76px;right:0;top:56px}',
 'booking/PageSettings': '.drawer{padding:22px;box-sizing:border-box;gap:12px}',
}
REN = {  # different components that only shared a name
 'checkout/Profile': [('.sheet{', '.acts{'), ('class="sheet"', 'class="acts"')],
 'onboarding/StaffInvite': [('.sheet{', '.panel{'), ('class="sheet fade"', 'class="panel fade"')],
 'onboarding/Clients': [('.opt.on{', '.pick.on{'), ('.opt{', '.pick{'), ("'opt on'", "'pick on'"), ("'opt'", "'pick'")],
 'booking/PageSettings': [('class="sheet"', 'class="drawer"')],
}
for f in sorted(set(DROP) | set(ADD) | set(REN)):
    b, n = f.split('/'); p = f'{R}/{b}/project/{n}.dc.html'; s = open(p).read()
    for a, c in REN.get(f, []):
        assert a in s, (f, a); s = s.replace(a, c)
    for sel in DROP.get(f, []):
        pat = r'(^|\n)' + re.escape(sel) + r'\{[^}]*\}'
        s, k = re.subn(pat, r'\1', s, count=1)
        assert k == 1, (f, sel)
    if f in ADD: s = s.replace('</style>', ADD[f] + '\n</style>', 1)
    open(p, 'w').write(s); print('ok', f)
