"""Align generated Android project to the available stable API 36 SDK; minimum stays 31."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'src-tauri/gen/android'
if not root.exists():raise SystemExit('请先执行 tauri android init')
for file in root.rglob('*.gradle.kts'):
    text=file.read_text();text=text.replace('compileSdk = 37','compileSdk = 36').replace('targetSdk = 37','targetSdk = 36')
    file.write_text(text)
print('Android 项目已使用 API 36 编译，最低 Android 12 / API 31 由 tauri.conf.json 指定')
