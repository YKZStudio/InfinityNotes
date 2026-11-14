"""签名业务资源包工具；尚未接入客户端自动激活。pip install cryptography"""
import argparse
import base64
import hashlib
import json
import os
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

MAX_SIZE=64*1024*1024
ALLOWED={'.html','.css','.js','.mjs','.json','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff2','.wasm','.txt'}
def canonical(data):return json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def safe_path(name):
    p=PurePosixPath(name)
    if not name or '\\' in name or p.is_absolute() or any(x in ('','.','..') for x in name.split('/')) or ':' in name or p.suffix.lower() not in ALLOWED:
        raise ValueError('资源路径不被允许：'+name)
    return p
def keygen(private,public):
    if private.exists() or public.exists():raise ValueError('密钥文件已存在，拒绝覆盖')
    if private.resolve()==public.resolve():raise ValueError('公钥与私钥必须使用不同路径')
    key=Ed25519PrivateKey.generate()
    fd=os.open(private,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f:f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    public.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
def build(source,private,out,version,shell_api):
    if version<1 or shell_api<1:raise ValueError('版本号及壳接口版本必须为正整数')
    key=serialization.load_pem_private_key(private.read_bytes(),password=None)
    if not isinstance(key,Ed25519PrivateKey):raise ValueError('需要 Ed25519 私钥')
    files={}; contents={}; total=0
    if source.is_symlink():raise ValueError('不接受符号链接目录')
    for file in sorted(source.rglob('*')):
        if file.is_symlink():raise ValueError('不接受符号链接')
        if not file.is_file():continue
        name=file.relative_to(source).as_posix();safe_path(name)
        raw=file.read_bytes();total+=len(raw)
        if total>MAX_SIZE:raise ValueError('业务资源包不得超过 64 MB；模型应单独分发')
        files[name]={'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw)};contents[name]=raw
    if 'index.html' not in files:raise ValueError('缺少 index.html')
    manifest={'format':'wuxianji.bundle','schema':1,'version':version,'minShellApi':shell_api,'files':files}
    envelope={'manifest':manifest,'signature':base64.b64encode(key.sign(canonical(manifest))).decode()}
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('update.json',canonical(envelope))
        for name,raw in contents.items():z.writestr('payload/'+name,raw)
    return envelope
def verify(archive,public,current_version,shell_api):
    key=serialization.load_pem_public_key(public.read_bytes())
    if not isinstance(key,Ed25519PublicKey):raise ValueError('需要 Ed25519 公钥')
    with zipfile.ZipFile(archive) as z:
        infos=z.infolist(); names=[i.filename for i in infos]
        if len(infos)>10000 or len({n.casefold() for n in names})!=len(names):raise ValueError('文件名重复或资源过多')
        if sum(i.file_size for i in infos)>MAX_SIZE+2*1024*1024:raise ValueError('解压后大小超限')
        if any(stat.S_ISLNK(i.external_attr>>16) or i.is_dir() for i in infos):raise ValueError('不接受链接或目录条目')
        info=z.getinfo('update.json')
        if info.file_size>2*1024*1024:raise ValueError('签名清单过大')
        env=json.loads(z.read('update.json')); m=env['manifest']
        key.verify(base64.b64decode(env['signature'],validate=True),canonical(m))
        if m.get('format')!='wuxianji.bundle' or m.get('schema')!=1:raise ValueError('资源包格式错误')
        if type(m.get('version')) is not int or m['version']<=current_version:raise ValueError('拒绝旧版本或重放更新')
        if type(m.get('minShellApi')) is not int or not 1<=m['minShellApi']<=shell_api:raise ValueError('需要更新客户端壳')
        files=m['files']
        if not isinstance(files,dict) or 'index.html' not in files or set(names)!={'update.json',*('payload/'+name for name in files)}:raise ValueError('清单与资源不一致')
        total=0
        for name,expected in files.items():
            safe_path(name);raw=z.read('payload/'+name);total+=len(raw)
            if total>MAX_SIZE or expected!={'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw)}:raise ValueError('资源被修改：'+name)
        return env
def publish(archive,public,destination,current_version,shell_api):
    env=verify(archive,public,current_version,shell_api)
    destination.mkdir(parents=True,exist_ok=True)
    latest=destination/'latest.json'
    if latest.exists() and json.loads(latest.read_text())['manifest']['version']>=env['manifest']['version']:raise ValueError('已有相同或更新的发布版本')
    digest=hashlib.sha256(archive.read_bytes()).hexdigest();target=destination/(digest+'.zip')
    fd,staging=tempfile.mkstemp(dir=destination);os.close(fd)
    try:
        shutil.copyfile(archive,staging);os.replace(staging,target)
        metadata={**env,'bundle':'/api/releases/'+target.name,'sha256':digest}
        Path(staging).write_bytes(canonical(metadata));os.replace(staging,latest)
    finally:Path(staging).unlink(missing_ok=True)
    return env
def main():
    p=argparse.ArgumentParser(description='无限记资源包签名与验证（开发工具）');sub=p.add_subparsers(dest='command',required=True)
    k=sub.add_parser('keygen');k.add_argument('--private',type=Path,required=True);k.add_argument('--public',type=Path,required=True)
    b=sub.add_parser('build');b.add_argument('--source',type=Path,required=True);b.add_argument('--private',type=Path,required=True);b.add_argument('--out',type=Path,required=True);b.add_argument('--version',type=int,required=True);b.add_argument('--shell-api',type=int,default=1)
    for name in ('verify','publish'):
        v=sub.add_parser(name);v.add_argument('--archive',type=Path,required=True);v.add_argument('--public',type=Path,required=True);v.add_argument('--current-version',type=int,required=True);v.add_argument('--shell-api',type=int,default=1)
        if name=='publish':v.add_argument('--destination',type=Path,required=True)
    a=vars(p.parse_args());command=a.pop('command')
    if command=='build':a['out']=a.pop('out');a['shell_api']=a.pop('shell_api')
    if command=='publish':a['destination']=a.pop('destination')
    try:
        result=globals()[command](**a)
        print('完成'+('：版本 '+str(result['manifest']['version']) if result else ''))
    except Exception as e:p.exit(1,'操作失败：'+str(e)+'\n')
if __name__=='__main__':main()
