export const FORMAT = 'wuxianji.board';
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const TYPES = ['note', 'text', 'rect', 'ellipse', 'arrow', 'path', 'image', 'link'];
export const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function board(title = '未命名看板') {
  return {format: FORMAT, schema: 1, id: uid(), title, updated: Date.now(), nodes: [], scenes: [], camera: {x: 0, y: 0, z: 1}};
}
export function node(type, x, y, extra = {}) {
  return {id: uid(), type, x, y, w: type === 'text' ? 260 : 220, h: type === 'text' ? 64 : 160,
    text: type === 'note' ? '写下一个想法' : type === 'text' ? '双击编辑文字' : '',
    fill: type === 'note' ? '#fff0ad' : '#d5ede5', color: '#253c35', rotation: 0, locked: false, ...extra};
}
const finite = (n, max = 1e8) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
const color = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
export function validateBoard(b) {
  if (!b || b.format !== FORMAT || b.schema !== 1 || !/^[a-zA-Z0-9-]{1,80}$/.test(b.id) ||
    typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200 || !Array.isArray(b.nodes) || b.nodes.length > 5000 ||
    !Array.isArray(b.scenes) || b.scenes.length > 100) throw Error('看板格式或版本不受支持');
  const camera = c => c && finite(c.x) && finite(c.y) && finite(c.z, 8) && c.z >= .1;
  if (!camera(b.camera)) throw Error('无效的视图参数');
  const ids = new Set();
  for (const n of b.nodes) {
    if (!n || typeof n.id !== 'string' || n.id.length > 80 || ids.has(n.id) || !TYPES.includes(n.type) ||
      !['x','y','w','h','rotation'].every(k => finite(n[k])) || n.w < 1 || n.h < 1 || n.w > 10000 || n.h > 10000 ||
      !color(n.fill) || !color(n.color) || typeof n.text !== 'string' || n.text.length > 100000 || typeof n.locked !== 'boolean') throw Error('看板包含无效对象');
    ids.add(n.id);
    if (n.type === 'path' && (!Array.isArray(n.points) || n.points.length > 100000 || !n.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => finite(v))))) throw Error('无效笔迹');
    if (n.type === 'image' && (typeof n.src !== 'string' || n.src.length > 7e6 || !/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(n.src))) throw Error('图片格式不受支持');
    if (n.type === 'link' && (typeof n.url !== 'string' || n.url.length > 4000 || !/^https?:\/\//i.test(n.url))) throw Error('仅支持网页链接');
  }
  for (const s of b.scenes) if (!s || typeof s.name !== 'string' || s.name.length > 100 || !camera(s.camera)) throw Error('无效场景');
  return b;
}
export class History {
  constructor(limit = 60) { this.limit = limit; this.past = []; this.future = []; }
  push(value) { this.past.push(clone(value)); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  undo(current) { if (!this.past.length) return current; this.future.push(clone(current)); return this.past.pop(); }
  redo(current) { if (!this.future.length) return current; this.past.push(clone(current)); return this.future.pop(); }
}
export const worldPoint = (x, y, camera) => ({x: (x - camera.x) / camera.z, y: (y - camera.y) / camera.z});
export function zoomAt(camera, x, y, factor) {
  const p = worldPoint(x, y, camera), z = Math.max(.1, Math.min(8, camera.z * factor));
  return {x: x - p.x * z, y: y - p.y * z, z};
}
function words(n) {
  const size = n.type === 'text' ? 26 : 18, limit = Math.max(1, Math.floor((n.w - 36) / size));
  const lines = n.text.split('\n').flatMap(l => Array.from(l).reduce((a,c,i) => { if (i % limit === 0) a.push(''); a[a.length-1] += c; return a; }, []));
  return `<text fill="${n.color}" font-size="${size}" font-family="system-ui, sans-serif">${lines.slice(0, Math.max(1, Math.floor((n.h-22)/(size*1.5)))).map((l,i) => `<tspan x="18" y="${30+i*size*1.5}">${escapeXML(l)}</tspan>`).join('')}</text>`;
}
export function nodeSVG(n) {
  let body = '';
  if (n.type === 'ellipse') body = `<ellipse cx="${n.w/2}" cy="${n.h/2}" rx="${n.w/2}" ry="${n.h/2}" fill="${n.fill}"/>${words(n)}`;
  else if (n.type === 'arrow') body = `<path d="M 4 ${n.h/2} H ${n.w-14} m -18 -14 l 18 14 -18 14" fill="none" stroke="${n.color}" stroke-width="3"/>`;
  else if (n.type === 'path') body = `<polyline points="${n.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${n.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  else if (n.type === 'image') body = `<image href="${n.src}" width="${n.w}" height="${n.h}" preserveAspectRatio="xMidYMid meet"/>`;
  else if (n.type === 'text') body = words(n);
  else body = `<rect width="${n.w}" height="${n.h}" rx="${n.type === 'note' ? 3 : 18}" fill="${n.fill}"/>${n.type === 'note' ? `<path d="M 0 0 H ${n.w} V 8 H 0 Z" fill="#ffffff" opacity=".3"/>` : ''}${words(n)}`;
  return `<g data-id="${escapeXML(n.id)}" transform="translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.w/2} ${n.h/2})">${body}</g>`;
}
export function exportSVG(b) {
  let x = 0, y = 0, w = 1000, h = 700;
  if (b.nodes.length) {
    // Radius bound includes rotated corners and paths normalized to their own bounds.
    const boxes = b.nodes.map(n => {const r=Math.hypot(n.w,n.h)/2; return [n.x+n.w/2-r,n.y+n.h/2-r,n.x+n.w/2+r,n.y+n.h/2+r];});
    x = Math.min(...boxes.map(a=>a[0]))-30; y = Math.min(...boxes.map(a=>a[1]))-30;
    w = Math.max(...boxes.map(a=>a[2]))-x+30; h = Math.max(...boxes.map(a=>a[3]))-y+30;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7faf7"/>${b.nodes.map(nodeSVG).join('')}</svg>`;
}
export function demo() {
  const b = board('让想法，无边生长');
  b.camera = {x: 42, y: 30, z: .9};
  b.nodes = [
    node('text', 55, 28, {text:'把脑海里的世界，\n慢慢铺展开。', w:520,h:130, color:'#274f43'}),
    node('note', 80, 210, {text:'一个灵感\n\n不必完整，先记下来。', w:230,h:210, rotation:-4}),
    node('note', 370, 230, {text:'一些可能\n\n旅行、故事、下一次冒险。', fill:'#dce8fa', w:230,h:210, rotation:3}),
    node('ellipse', 700, 230, {text:'新的方向', w:220,h:160,fill:'#dbeedf'}),
    node('arrow', 610, 300, {w:80,h:50}),
    node('text', 90, 490, {text:'选择工具添加内容 · 双击编辑 · 拖动移动\n滚轮缩放 · 空格拖动画布 · 左下角保存场景', w:740,h:110,color:'#63776f'})
  ]; return b;
}
