from flask import Flask,request,jsonify,send_from_directory,session
from pathlib import Path
import os,re,yaml,secrets,requests
from bs4 import BeautifulSoup
app=Flask(__name__); app.secret_key=os.getenv('SECRET_KEY','dev-secret')
NOTES=Path(os.getenv('NOTES_DIR','/data/notes')); UP=Path(os.getenv('UPLOADS_DIR','/data/uploads')); NOTES.mkdir(parents=True,exist_ok=True); UP.mkdir(parents=True,exist_ok=True)

def safe(rel):
 p=(NOTES/rel).resolve()
 if NOTES.resolve() not in p.parents and p!=NOTES.resolve(): raise ValueError('bad path')
 return p

def parse(p):
 raw=p.read_text('utf8'); meta={}; body=raw
 if raw.startswith('---\n'):
  parts=raw.split('---\n',2)
  if len(parts)==3: meta=yaml.safe_load(parts[1]) or {}; body=parts[2]
 return meta,body

def tree(path=NOTES, public=False):
 out=[]
 for p in sorted(path.iterdir(),key=lambda x:(x.is_file(),x.name.lower())):
  if p.name.startswith('.'): continue
  rel=str(p.relative_to(NOTES)).replace('\\','/')
  if p.is_dir():
   children=tree(p,public)
   if children or not public: out.append({'type':'folder','name':p.name,'path':rel,'children':children})
  elif p.suffix.lower()=='.md':
   m,_=parse(p)
   if not public or m.get('published',False): out.append({'type':'note','name':m.get('title') or p.stem,'path':rel,'emoji':m.get('emoji','📄')})
 return out

def auth(): return bool(session.get('admin'))

def write_note(p, meta, body):
 meta['title']=meta.get('title') or p.stem
 p.write_text('---\n'+yaml.safe_dump(meta,allow_unicode=True,sort_keys=False)+'---\n'+body,'utf8')

def clear_other_start_pages(current):
 for other in NOTES.rglob('*.md'):
  if other.resolve()==current.resolve(): continue
  meta,body=parse(other)
  if meta.get('start_page'):
   meta['start_page']=False
   write_note(other,meta,body)
@app.get('/api/tree')
def get_tree(): return jsonify(tree(public=not auth()))
@app.get('/api/start')
def get_start():
 for p in NOTES.rglob('*.md'):
  try: m,_=parse(p)
  except Exception: continue
  if m.get('start_page') and (auth() or m.get('published',False)):
   return jsonify(path=str(p.relative_to(NOTES)).replace('\\','/'))
 return jsonify(path=None)

@app.get('/api/note')
def get_note():
 try:p=safe(request.args['path']); m,b=parse(p)
 except Exception:return jsonify(error='Not found'),404
 if not auth() and not m.get('published'): return jsonify(error='Not found'),404
 return jsonify(path=request.args['path'],meta=m,content=b)
@app.post('/api/login')
def login():
 if secrets.compare_digest(str(request.json.get('password','')),os.getenv('NOTES_ADMIN_PASSWORD','change-me')): session['admin']=True; return jsonify(ok=True)
 return jsonify(error='Wrong password'),401
@app.post('/api/logout')
def logout(): session.clear(); return jsonify(ok=True)
@app.get('/api/me')
def me(): return jsonify(admin=auth())
@app.put('/api/note')
def save_note():
 if not auth(): return jsonify(error='Unauthorized'),401
 d=request.json; p=safe(d['path']); p.parent.mkdir(parents=True,exist_ok=True)
 meta=d.get('meta',{})
 if meta.get('start_page'): clear_other_start_pages(p)
 write_note(p,meta,d.get('content','')); return jsonify(ok=True)
@app.post('/api/note')
def create_note():
 if not auth(): return jsonify(error='Unauthorized'),401
 d=request.json; folder=d.get('folder','').strip('/'); title=d.get('title','Untitled'); slug=re.sub(r'[^\w\- ]','',title,flags=re.U).strip().replace(' ','-') or 'untitled'; rel=(folder+'/' if folder else '')+slug+'.md'; p=safe(rel); i=2
 while p.exists(): p=safe((folder+'/' if folder else '')+slug+f'-{i}.md'); i+=1
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(f'---\ntitle: {title}\nemoji: 📝\npublished: false\n---\n','utf8'); return jsonify(path=str(p.relative_to(NOTES)).replace('\\','/'))
@app.post('/api/folder')
def folder():
 if not auth(): return jsonify(error='Unauthorized'),401
 safe(request.json['path']).mkdir(parents=True,exist_ok=True); return jsonify(ok=True)
@app.post('/api/upload')
def upload():
 if not auth(): return jsonify(error='Unauthorized'),401
 f=request.files['file']; name=secrets.token_hex(6)+'-'+re.sub(r'[^\w.\-]','_',f.filename); f.save(UP/name); return jsonify(url='/uploads/'+name)
@app.get('/uploads/<path:name>')
def uploads(name): return send_from_directory(UP,name)
@app.get('/api/link-preview')
def preview():
 url=request.args.get('url','')
 try:
  r=requests.get(url,timeout=4,headers={'User-Agent':'Mozilla/5.0'},allow_redirects=True); s=BeautifulSoup(r.text[:500000],'html.parser')
  def prop(p,n):
   x=s.find('meta',attrs={'property':p}) or s.find('meta',attrs={'name':p}); return x.get('content','') if x else ''
  return jsonify(url=url,title=prop('og:title') or (s.title.string.strip() if s.title and s.title.string else url),description=prop('og:description') or prop('description'),image=prop('og:image'))
 except Exception:return jsonify(url=url,title=url,description='',image='')
@app.get('/api/health')
def health(): return jsonify(ok=True)
app.run(host='0.0.0.0',port=5000)
