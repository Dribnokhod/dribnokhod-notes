#!/usr/bin/env python3
from pathlib import Path
import argparse,shutil,re,yaml
p=argparse.ArgumentParser();p.add_argument('vault');p.add_argument('--out',default='./data/notes');a=p.parse_args();src=Path(a.vault);dst=Path(a.out);dst.mkdir(parents=True,exist_ok=True)
count=0
for f in src.rglob('*.md'):
 rel=f.relative_to(src); target=dst/rel; target.parent.mkdir(parents=True,exist_ok=True); raw=f.read_text('utf8',errors='replace')
 # Keep existing YAML frontmatter; otherwise add our publication metadata.
 if not raw.startswith('---\n'): raw='---\ntitle: '+f.stem+'\nemoji: 📄\npublished: false\n---\n'+raw
 # Obsidian embeds ![[image.png]] -> normal markdown, preserving relative attachment lookup as much as possible.
 raw=re.sub(r'!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]',lambda m:'![]('+m.group(1).replace(' ','%20')+')',raw)
 raw=re.sub(r'(?<!!)\[\[([^\]|]+)\|([^\]]+)\]\]',r'[\2](\1)',raw); raw=re.sub(r'(?<!!)\[\[([^\]]+)\]\]',r'[\1](\1)',raw)
 target.write_text(raw,'utf8');count+=1
# Copy common attachment types into public uploads.
uploads=dst.parent/'uploads';uploads.mkdir(exist_ok=True)
for f in src.rglob('*'):
 if f.is_file() and f.suffix.lower() in {'.png','.jpg','.jpeg','.gif','.webp','.svg'}:
  try: shutil.copy2(f,uploads/f.name)
  except: pass
print(f'Imported {count} markdown files into {dst}')
