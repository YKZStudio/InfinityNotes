"""从同一份客户端源码生成可双击的单文件预览，便于评审；不提供云端服务。"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'client/index.html').read_text()
style=(root/'client/style.css').read_text()
core=(root/'client/core.mjs').read_text().replace('export const ','const ').replace('export function ','function ').replace('export class ','class ')
app='\n'.join(line for line in (root/'client/app.mjs').read_text().splitlines() if not line.startswith('import '))
native=(root/'client/native.mjs').read_text().replace('export const ','const ').replace('export let ','let ').replace('export async function ','async function ')
speech=(root/'client/speech.mjs').read_text().replace('export function ','function ').replace('export async function ','async function ')
code=core+'\n'+native+'\n'+speech+'\n'+app
if '</script' in code.lower():raise ValueError('预览脚本包含不安全的结束标记')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+style+'</style>')
html=html.replace('<script type="module" src="app.mjs"></script>','<script type="module">'+code+'</script>')
out=root/'preview.html';out.write_text(html,encoding='utf-8');print(out)
