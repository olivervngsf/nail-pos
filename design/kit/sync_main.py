"""Copy the latest flow screens into the Main Screens board so it stays the up-to-date sample.
Run after ANY change to a flow board: python3 design/kit/sync_main.py <scratchpad root>
<root>/<board>/project holds each board's files (checkout, booking, main, ...)."""
import re, sys, shutil
R = sys.argv[1]
exec(open(__file__.replace('sync_main.py', 'rail.py')).read().split('# board, file')[0])
L = {'Today': 'Main.dc.html', 'Calendar': 'Cal.dc.html', 'Checkout': 'Checkout.dc.html',
     'Clients': 'Clients.dc.html', 'Close day': 'CloseDay.dc.html', 'Me': 'Me.dc.html'}
# (from board, file, name in main, active menu item, extra rail style)
COPY = [('checkout', 'Main', 'Checkout', 'Checkout', ''), ('checkout', 'Pay', 'Pay', 'Checkout', ''),
        ('checkout', 'Reader', 'Reader', 'Checkout', ''), ('checkout', 'Cash', 'Cash', 'Checkout', ''),
        ('checkout', 'Done', 'Done', 'Checkout', ''), ('checkout', 'Profile', 'Profile', None, ''),
        ('checkout', 'PhoneQR', 'PhoneQR', None, ''), ('checkout', 'PhoneClientPay', 'PhoneClientPay', None, ''),
        ('checkout', 'PhoneClientReceipt', 'PhoneClientReceipt', None, ''),
        ('booking', 'StaffBook', 'StaffBook', None, ''),
        ('booking', 'Cal', 'Cal', 'Calendar', 'position:absolute;left:0;top:0;bottom:0;box-sizing:border-box')]
M = f'{R}/main/project/'
for b, f, n, act, st in COPY:
    s = open(f'{R}/{b}/project/{f}.dc.html').read()
    if b == 'checkout': s = s.replace('href="Main.dc.html"', 'href="Checkout.dc.html"')
    if act: s = re.sub(r'<nav class="rail2?" aria-label="Menu"[^>]*>.*?</nav>', lambda m: rail(act, L, st), s, count=1, flags=re.S)
    open(M + n + '.dc.html', 'w').write(s); print('synced', b, f, '->', n)
for c in ['pos.css', 'annot.css']: shutil.copy(f'{R}/checkout/project/{c}' if c == 'pos.css' else f'{R}/booking/project/{c}', M + c)
