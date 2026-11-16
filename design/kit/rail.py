import re, sys
ICON = {
 'Today': '<path d="M3 11l9-7 9 7v9H3z"/>',
 'Calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 'Checkout': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
 'Clients': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 010 7"/>',
 'Close day': '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'}
def rail(active, links, extra_style=''):
    items=[]
    for name in ['Today','Calendar','Checkout','Clients','Close day']:
        on=' class="on"' if name==active else ''
        items.append(f'    <a{on} href="{links.get(name,"#")}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>{name}</a>')
    me_on=' class="on"' if active=='Me' else ''
    st=f' style="{extra_style}"' if extra_style else ''
    return ('<nav class="rail" aria-label="Menu"'+st+'>\n    <div class="logo">MN</div>\n'+'\n'.join(items)+
      f'\n    <div style="flex:1"></div>\n    <a{me_on} href="{links.get("Me","#")}" aria-label="My profile"><span class="av" style="width:32px;height:32px">M</span></a>\n  </nav>')
# board, file, active, links, extra style
jobs = [
 ('checkout','Main','Checkout',{}, ''), ('checkout','Pay','Checkout',{}, ''), ('checkout','Reader','Checkout',{}, ''), ('checkout','Cash','Checkout',{}, ''), ('checkout','Done','Checkout',{}, ''),
 ('booking','Main','Calendar',{}, ''), ('booking','Cal','Calendar',{}, 'position:absolute;left:0;top:0;bottom:0;box-sizing:border-box'), ('booking','PageSettings','Me',{}, ''),
 ('main','Main','Today',{'Clients':'Clients.dc.html','Close day':'CloseDay.dc.html','Me':'Me.dc.html'}, ''),
 ('main','Clients','Clients',{'Today':'Main.dc.html','Close day':'CloseDay.dc.html','Me':'Me.dc.html'}, ''),
 ('main','CloseDay','Close day',{'Today':'Main.dc.html','Clients':'Clients.dc.html','Me':'Me.dc.html'}, ''),
 ('main','Me','Me',{'Today':'Main.dc.html','Clients':'Clients.dc.html','Close day':'CloseDay.dc.html'}, ''),
]
base=sys.argv[1]
for b,f,act,links,st in jobs:
    p=f'{base}/{b}/project/{f}.dc.html'; s=open(p).read()
    s2,n=re.subn(r'<nav class="rail2?" aria-label="Menu">.*?</nav>', lambda m: rail(act,links,st), s, count=1, flags=re.S)
    assert n==1, p
    open(p,'w').write(s2); print('ok',b,f)
