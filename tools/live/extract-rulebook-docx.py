import sys, zipfile
from lxml import etree
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
z=zipfile.ZipFile(sys.argv[1]); out=open(sys.argv[2],'w')
with z.open('word/document.xml') as f:
    for ev,el in etree.iterparse(f, events=('end',), tag=(W+'p',W+'tc',W+'tr')):
        if el.tag==W+'p':
            parent=el.getparent()
            if parent is not None and parent.tag==W+'tc': continue
            t=''.join(x.text or '' for x in el.iter(W+'t','{%s}tab'%W[1:-1]) if True)
            sty=el.find(f'{W}pPr/{W}pStyle'); s=sty.get(W+'val') if sty is not None else ''
            if t.strip(): out.write((f'[{s}] ' if s and s.lower().startswith('heading') else '')+t+'\n')
            el.clear()
        elif el.tag==W+'tr':
            cells=[]
            for tc in el.findall(W+'tc'):
                cells.append(' '.join(''.join(x.text or '' for x in p.iter(W+'t')) for p in tc.findall(W+'p')).strip())
            out.write('| '+' | '.join(cells)+' |\n'); el.clear()
            while el.getprevious() is not None: del el.getparent()[0]
out.close()
