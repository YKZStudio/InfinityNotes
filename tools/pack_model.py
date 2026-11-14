"""Convert an official Vosk model ZIP to vosk-browser's model/ TAR.GZ layout."""
import argparse
import hashlib
import io
import tarfile
import zipfile
from pathlib import Path,PurePosixPath
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path);a=p.parse_args()
if a.destination.exists():p.error('输出文件已存在，拒绝覆盖')
with zipfile.ZipFile(a.source) as z:
    entries=[i for i in z.infolist() if not i.is_dir()]
    if sum(i.file_size for i in entries)>400*1024*1024:p.error('仅接受解压后 400 MB 内的轻量模型')
    roots={i.filename.split('/')[0] for i in entries}
    if len(roots)!=1:p.error('模型需要只有一个顶层目录')
    names=set()
    for i in entries:
        parts=i.filename.split('/')[1:]
        if len(parts)<1 or any(v in ('','.','..') or '\\' in v or ':' in v for v in parts) or i.filename.startswith('/') or (i.external_attr>>16)&0o170000==0o120000:p.error('不安全的 ZIP 条目')
        name='model/'+'/'.join(parts)
        if name in names:p.error('重复条目')
        names.add(name)
    if 'model/am/final.mdl' not in names or 'model/conf/model.conf' not in names:p.error('未识别的 Vosk 模型结构')
    with tarfile.open(a.destination,'w:gz') as t:
        for i in entries:
            raw=z.read(i);name='model/'+'/'.join(i.filename.split('/')[1:]);info=tarfile.TarInfo(name);info.size=len(raw);info.mode=0o644;t.addfile(info,io.BytesIO(raw))
print('模型转换完成，SHA-256：'+hashlib.sha256(a.destination.read_bytes()).hexdigest())
