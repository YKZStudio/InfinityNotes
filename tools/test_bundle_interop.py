"""Verify Python-signed releases using the actual Rust client verifier (including Unicode)."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from release import keygen,build
root=Path(__file__).resolve().parents[1]
cargo=shutil.which('cargo') or str(Path.home()/'.cargo/bin/cargo')
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);source=d/'client';source.mkdir();(source/'index.html').write_text('<h1>无限记</h1>');(source/'嵌套').mkdir();(source/'嵌套/测试.mjs').write_text('export const 文字="中文";')
    keygen(d/'private.pem',d/'public.pem');build(source,d/'private.pem',d/'bundle.zip',7,1)
    command=[cargo,'run','--quiet','--locked','--manifest-path',str(root/'native-core/Cargo.toml'),'--example','check_bundle','--',str(d/'bundle.zip'),str(d/'public.pem')]
    subprocess.run(command+[str(d/'valid'),'6'],check=True)
    rejected=subprocess.run(command+[str(d/'replayed'),'7'],capture_output=True)
    if rejected.returncode==0:raise AssertionError('客户端没有拒绝回放版本')
    print('Python/Rust 资源包验签互通及版本拒绝通过')
