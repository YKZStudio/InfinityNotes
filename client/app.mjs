import {board, node, demo, uid, clone, History, validateBoard, worldPoint, zoomAt, nodeSVG, exportSVG, escapeXML} from './core.mjs';
import {isNative, invoke, nativeStatus, nativeInfo, setNativeAppearance} from './native.mjs';
import {startSpeech} from './speech.mjs';
import {decorateIcons} from './icons.mjs';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const names = {note:'便笺条',text:'文字',rect:'矩形',ellipse:'椭圆',path:'笔迹',image:'图片',link:'网页链接',arrow:'箭头'};
const defaults = {theme:'system',accent:'#b66d27',keyboard:false,speech:false,speechLang:'zh-CN',reduced:false,serverURL:'',speechMode:'offline'};
let state = {schema:1, boards:[demo()], current:null, settings:{...defaults}, revisions:{}};
state.current = state.boards[0].id;
let db, folder, selected=null, tool='select', history=new History(), drag=null, space=false, saveTimer, toastTimer, speechEngine, shifted=false, saving=Promise.resolve(), sequence=0, sessionToken='', storageBlocked=false;
const pointers=new Map();
const current = () => state.boards.find(b=>b.id===state.current);
const object = () => current().nodes.find(n=>n.id===selected);
decorateIcons();
const compactLayout=matchMedia('(max-width:820px)');
function setSidebar(open,restoreFocus=false){
  const mobile=compactLayout.matches;
  $('#sidebar').classList.toggle('open',mobile&&open);
  $('#sidebarBackdrop').hidden=!(mobile&&open);
  $('#sidebar').inert=mobile&&!open;$('#main').inert=mobile&&open;
  $('#menu').setAttribute('aria-expanded',String(mobile&&open));
  if(mobile&&open)$('#search').focus();else if(mobile&&restoreFocus)$('#menu').focus();
}
setSidebar(false);compactLayout.addEventListener('change',()=>setSidebar(false));
$('#sidebar').addEventListener('keydown',e=>{
  if(!compactLayout.matches||!$('#sidebar').classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();setSidebar(false,true);return;}
  if(e.key==='Tab'){
    const focusable=$$('#sidebar button:not(:disabled), #sidebar input, #sidebar [tabindex="0"]');
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
const request = r => new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500); }
async function openDB() {const r=indexedDB.open('wuxianji-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv'); db=await request(r);}
async function get(key) {return request(db.transaction('kv').objectStore('kv').get(key));}
function put(key,value) {return new Promise((ok,no)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,key);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});}
function validateWorkspace(value) {
  if (!value || value.schema!==1 || !Array.isArray(value.boards) || value.boards.length<1 || value.boards.length>200) throw Error('工作区格式不受支持');
  value.boards.forEach(validateBoard);
  if (new Set(value.boards.map(b=>b.id)).size!==value.boards.length) throw Error('工作区中存在重复看板');
  value.current=value.boards.some(b=>b.id===value.current)?value.current:value.boards[0].id;
  const s=value.settings||{};
  value.settings={theme:['system','light','dark'].includes(s.theme)?s.theme:'system',accent:/^#[\da-f]{6}$/i.test(s.accent)?s.accent:defaults.accent,keyboard:s.keyboard===true,speech:s.speech===true,speechLang:s.speechLang==='en-US'?'en-US':'zh-CN',reduced:s.reduced===true,serverURL:typeof s.serverURL==='string'?s.serverURL:''};
  value.settings.speechMode=['offline','server'].includes(s.speechMode)?s.speechMode:'offline';
  value.revisions=value.revisions&&typeof value.revisions==='object'&&!Array.isArray(value.revisions)?value.revisions:{}; return value;
}
function settingsTheme() {
  const s=state.settings; const dark=s.theme==='dark'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light'; document.documentElement.dataset.glass=s.reduced?'reduced':'full';
  document.documentElement.style.setProperty('--accent',/^#[\da-f]{6}$/i.test(s.accent)?s.accent:defaults.accent);
  document.querySelector('meta[name="theme-color"]').content=dark?'#1b1e24':'#f7f8fa';
  setNativeAppearance(dark);
}
function dirty() {current().updated=Date.now(); $('#saveStatus').textContent='正在保存…'; clearTimeout(saveTimer); saveTimer=setTimeout(()=>persist(),350);}
function persist() {
  const snapshot=clone(state), version=++sequence;
  saving=saving.catch(()=>{}).then(async()=>{
    if(storageBlocked) throw Error('原本机数据读取异常，已暂停自动写入以保留原始内容。请先导出，再导入有效备份。');
    if(!db) throw Error('本机存储不可用，请及时导出备份');
    await put('workspace',snapshot);
    let label='已保存到浏览器';
    if(isNative&&nativeInfo?.folder?.uri){await invoke('write_workspace',{data:JSON.stringify(snapshot)});label='已保存到自选文件夹';}
    if(folder) {
      try {
        if(await folder.queryPermission({mode:'readwrite'})!=='granted') throw Error('文件夹授权已失效，请在设置中重新选择');
        const file=await folder.getFileHandle('wuxianji-workspace.json',{create:true});const stream=await file.createWritable();
        await stream.write(JSON.stringify(snapshot)); await stream.close();label='已保存到自选文件夹';
      } catch(e) {label='已存浏览器，文件夹写入失败';toast(e.message);}
    }
    if(version===sequence) $('#saveStatus').textContent=label;
    renderBoards();
  }).catch(e=>{$('#saveStatus').textContent='保存失败，请导出备份';toast(e.message);});
  return saving;
}
function checkpoint() {history.push(current());}
function commit() {render();dirty();}
function renderBoards() {
  const query=$('#search').value.trim().toLocaleLowerCase(); $('#boards').replaceChildren(); $('#count').textContent=state.boards.length;
  for(const b of state.boards.filter(b=>!query||[b.title,...b.nodes.map(n=>n.text)].join(' ').toLocaleLowerCase().includes(query))) {
    const card=document.createElement('div');card.className='board-card'+(b.id===state.current?' selected':'');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',b.title);
    const preview=document.createElement('div');preview.className='board-preview';preview.innerHTML=exportSVG(b);card.append(preview);
    const title=document.createElement('strong');title.textContent=b.title;card.append(title);
    const date=document.createElement('small');date.textContent=`${b.nodes.length} 个想法 · ${new Date(b.updated).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}`;card.append(date);
    const remove=document.createElement('button');remove.className='board-delete';remove.textContent='×';remove.setAttribute('aria-label','删除看板 '+b.title);card.append(remove);
    remove.onclick=e=>{e.stopPropagation();if(!confirm(`删除“${b.title}”？原型尚无回收站，请先导出需要保留的内容。`))return;state.boards=state.boards.filter(x=>x.id!==b.id);if(!state.boards.length)state.boards=[board()];if(state.current===b.id)state.current=state.boards[0].id;selected=null;history=new History();render();dirty();};
    const open=()=>{state.current=b.id;selected=null;history=new History();setSidebar(false,true);render();dirty();};
    card.onclick=open;card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open();}};$('#boards').append(card);
  }
}
function renderCanvas() {
  const b=current(), c=b.camera; $('#world').setAttribute('transform',`translate(${c.x} ${c.y}) scale(${c.z})`);
  $('#world').innerHTML=b.nodes.map(nodeSVG).join('');
  const n=object();if(n) $('#world').insertAdjacentHTML('beforeend',`<g pointer-events="none" transform="translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.w/2} ${n.h/2})"><rect x="-5" y="-5" width="${n.w+10}" height="${n.h+10}" rx="4" fill="none" stroke="${state.settings.accent}" stroke-width="${1.5/c.z}" stroke-dasharray="${n.locked?'5 5':'none'}"/></g>`);
  $('#stage').style.backgroundSize=`${22*c.z}px ${22*c.z}px`;$('#stage').style.backgroundPosition=`${c.x}px ${c.y}px`;
  $('#empty').hidden=b.nodes.length!==0;$('#zoomValue').textContent=`${Math.round(c.z*100)}%`;
}
let inspectedId=null;
function renderInspector() {
  const n=object();$('#inspector').hidden=!n;$('#main').classList.toggle('has-selection',!!n);
  if(inspectedId!==selected){inspectedId=selected;$('#inspector').dataset.expanded='false';$('#toggleInspector').setAttribute('aria-expanded','false');$('#toggleInspector').setAttribute('aria-label','展开对象属性');}
  if(!n)return;
  $('#objectType').textContent=names[n.type]+(n.locked?' · 已锁定':'');$('#fill').value=n.fill;$('#ink').value=n.color;
  $('#width').value=Math.round(n.w);$('#height').value=Math.round(n.h);$('#rotation').value=n.rotation;
  $('#lock').textContent=n.locked?'解锁':'锁定';$('#editText').hidden=['image','arrow','path'].includes(n.type);$('#openLink').hidden=n.type!=='link';
  for(const id of ['fill','ink','width','height','rotation','editText','front','remove']) $('#'+id).disabled=n.locked;
  $('#width').disabled=n.locked||n.type==='path';$('#height').disabled=n.locked||n.type==='path';
}
function renderScenes() {$('#scenes').replaceChildren();current().scenes.forEach((s,i)=>{const row=document.createElement('div'),go=document.createElement('button'),del=document.createElement('button');go.textContent=`${i+1}. ${s.name}`;go.onclick=()=>{current().camera=clone(s.camera);renderCanvas();dirty();};del.textContent='×';del.setAttribute('aria-label','删除场景 '+s.name);del.onclick=()=>{checkpoint();current().scenes.splice(i,1);commit();};row.append(go,del);$('#scenes').append(row);});}
function render() {$('#boardTitle').value=current().title;$('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length;settingsTheme();renderCanvas();renderInspector();renderScenes();renderBoards();}
function selectTool(value) {tool=value;$$('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});$('#insertMenu').classList.toggle('active',['rect','ellipse','arrow'].includes(tool));$('#insertMenu small').textContent=['rect','ellipse','arrow'].includes(tool)?names[tool]:'插入';$('#stage').style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';}
$$('[data-tool]').forEach(b=>b.onclick=()=>{selectTool(b.dataset.tool);if($('#insertDialog').open){$('#insertDialog').close();toast('轻点画布放置'+names[tool]);}});
$('#newBoard').onclick=()=>{if(state.boards.length>=200)return toast('原型最多支持 200 个看板');const b=board();state.boards.unshift(b);state.current=b.id;setSidebar(false,true);selected=null;history=new History();render();dirty();};
$('#search').oninput=renderBoards;
$('#boardTitle').onchange=()=>{const title=$('#boardTitle').value.trim();if(!title){$('#boardTitle').value=current().title;return;}checkpoint();current().title=title;commit();};
$('#menu').onclick=()=>setSidebar(!$('#sidebar').classList.contains('open'),true);$('#closeSidebar').onclick=()=>setSidebar(false,true);$('#sidebarBackdrop').onclick=()=>setSidebar(false,true);
$('#toggleInspector').onclick=()=>{const expanded=$('#inspector').dataset.expanded!=='true';$('#inspector').dataset.expanded=String(expanded);$('#toggleInspector').setAttribute('aria-expanded',String(expanded));$('#toggleInspector').setAttribute('aria-label',expanded?'收起对象属性':'展开对象属性');};
$('#deselect').onclick=()=>{selected=null;renderCanvas();renderInspector();};
$('#insertMenu').onclick=()=>$('#insertDialog').showModal();
$('#boardMenu').onclick=()=>{$('#menuRedo').disabled=!history.future.length;$('#boardActionsDialog').showModal();};
for(const [id,target] of [['menuRedo','redo'],['menuExport','export'],['menuSync','sync'],['menuSettings','settings']])$('#'+id).onclick=()=>{$('#boardActionsDialog').close();$('#'+target).click();};
$$('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close('cancel');}));
function undo() {const b=history.undo(current());state.boards[state.boards.findIndex(v=>v.id===state.current)]=b;selected=null;commit();}
function redo() {const b=history.redo(current());state.boards[state.boards.findIndex(v=>v.id===state.current)]=b;selected=null;commit();}
$('#undo').onclick=undo;$('#redo').onclick=redo;
for(const [id,key] of [['fill','fill'],['ink','color'],['width','w'],['height','h'],['rotation','rotation']]) $('#'+id).onchange=()=>{const n=object();if(!n||n.locked)return;let v=$('#'+id).value;if(['w','h','rotation'].includes(key)){v=Number(v);if(!Number.isFinite(v)||v<(key==='rotation'?-180:1)||v>(key==='rotation'?180:10000))return renderInspector();}checkpoint();n[key]=v;commit();};
$('#lock').onclick=()=>{const n=object();if(n){checkpoint();n.locked=!n.locked;commit();}};
$('#front').onclick=()=>{const n=object();if(n&&!n.locked){checkpoint();current().nodes=current().nodes.filter(x=>x.id!==n.id);current().nodes.push(n);commit();}};
function removeSelected() {const n=object();if(n&&!n.locked){checkpoint();current().nodes=current().nodes.filter(x=>x.id!==n.id);selected=null;commit();}}
$('#remove').onclick=removeSelected;
$('#duplicate').onclick=()=>{const n=object();if(n){checkpoint();const copy={...clone(n),id:uid(),x:n.x+30,y:n.y+30,locked:false};current().nodes.push(copy);selected=copy.id;commit();}};
$('#openLink').onclick=()=>{const n=object();if(n?.type==='link'&&/^https?:\/\//i.test(n.url))window.open(n.url,'_blank','noopener,noreferrer');};
function edit() {const n=object();if(!n||n.locked||['image','arrow','path'].includes(n.type))return;$('#textEditor').value=n.text;$('#keyboard').hidden=!state.settings.keyboard;$('#speech').hidden=!state.settings.speech;$('#speechStatus').textContent='';$('#textEditor').inputMode=state.settings.keyboard?'none':'text';$('#editorDialog').showModal();$('#textEditor').focus();}
$('#editText').onclick=edit;
$('#editorDialog').addEventListener('close',()=>{speechEngine?.abort();if($('#editorDialog').returnValue==='save'&&object()){checkpoint();object().text=$('#textEditor').value.slice(0,100000);commit();}});
const stage=$('#stage');const pos=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
function finishPath(cancel=false) {
  if(drag?.type!=='draw')return;
  const gesture=drag,n=current().nodes.find(n=>n.id===gesture.id);drag=null;
  if(cancel){current().nodes=current().nodes.filter(n=>n.id!==gesture.id);selected=gesture.previousSelection;}
  else if(n&&n.points.length){
    const minX=Math.min(...n.points.map(p=>p[0])),minY=Math.min(...n.points.map(p=>p[1]));
    n.points=n.points.map(([x,y])=>[x-minX,y-minY]);n.x=minX;n.y=minY;
    n.w=Math.max(1,...n.points.map(p=>p[0]));n.h=Math.max(1,...n.points.map(p=>p[1]));history.push(gesture.before);
  }
  commit();
}
function placeNode(type,w){
  if(current().nodes.length>=5000)return toast('原型最多支持 5000 个对象');
  checkpoint();const n=node(type,w.x,w.y);current().nodes.push(n);selected=n.id;
  commit();selectTool('select');if(['text','note'].includes(n.type))edit();
}
function cancelMove(){if(drag?.type==='move'){const n=current().nodes.find(n=>n.id===drag.id);if(n){n.x=drag.x;n.y=drag.y;}}}
stage.onpointerdown=e=>{
  if(e.button!==0&&e.button!==1)return;
  if(pointers.size>=2)return;
  const p=pos(e);pointers.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);
  if(pointers.size===2){
    cancelMove();finishPath(true);
    const a=[...pointers.values()];drag={type:'pinch',distance:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),mid:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},camera:clone(current().camera)};
    renderCanvas();renderInspector();dirty();return;
  }
  const w=worldPoint(p.x,p.y,current().camera),id=e.target.closest('[data-id]')?.dataset.id;
  if(tool==='pan'||space||e.button===1){drag={type:'pan',start:p,camera:clone(current().camera)};return;}
  if(tool==='select'){
    selected=id||null;const n=object();
    if(n&&!n.locked)drag={type:'move',id:n.id,start:w,screen:p,x:n.x,y:n.y,before:clone(current()),moved:false};
    else if(!id&&e.pointerType==='touch')drag={type:'pan',start:p,camera:clone(current().camera)};
    renderCanvas();renderInspector();return;
  }
  if(tool!=='path'){
    // Wait until finger-up, so a second finger can start a pinch without adding an object.
    if(e.pointerType==='touch')drag={type:'place',tool,start:p,world:w,camera:clone(current().camera)};
    else placeNode(tool,w);
    return;
  }
  if(current().nodes.length>=5000)return toast('原型最多支持 5000 个对象');
  const before=clone(current()),previousSelection=selected;
  const n=node('path',0,0,{points:[[w.x,w.y]],color:state.settings.accent});current().nodes.push(n);selected=n.id;
  drag={type:'draw',id:n.id,before,previousSelection};renderCanvas();renderInspector();
};
stage.onpointermove=e=>{
  if(!pointers.has(e.pointerId))return;const p=pos(e);pointers.set(e.pointerId,p);if(!drag)return;
  if(drag.type==='place'){
    if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<8)return;
    drag={type:'pan',start:drag.start,camera:drag.camera};
  }
  if(drag.type==='pinch'&&pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};const c=zoomAt(drag.camera,drag.mid.x,drag.mid.y,d/Math.max(1,drag.distance));c.x+=mid.x-drag.mid.x;c.y+=mid.y-drag.mid.y;current().camera=c;}
  else if(drag.type==='pan')current().camera={...drag.camera,x:drag.camera.x+p.x-drag.start.x,y:drag.camera.y+p.y-drag.start.y};
  else if(drag.type==='move'&&object()){
    if(!drag.moved&&Math.hypot(p.x-drag.screen.x,p.y-drag.screen.y)<4)return;
    drag.moved=true;const w=worldPoint(p.x,p.y,current().camera);object().x=drag.x+w.x-drag.start.x;object().y=drag.y+w.y-drag.start.y;
  }
  else if(drag.type==='draw'&&object()){const n=object(),samples=e.getCoalescedEvents?.();for(const event of samples?.length?samples:[e]){const q=pos(event),w=worldPoint(q.x,q.y,current().camera);if(n.points.length<10000)n.points.push([w.x,w.y]);}}
  renderCanvas();dirty();
};
function pointerEnd(e) {
  if(!pointers.has(e.pointerId))return;
  const gesture=drag,cancel=e.type==='pointercancel';pointers.delete(e.pointerId);
  if(gesture?.type==='draw')finishPath(cancel);
  else if(gesture?.type==='move'){if(cancel)cancelMove();else if(gesture.moved)history.push(gesture.before);}
  if(gesture?.type==='pinch'&&pointers.size===1)drag={type:'pan',start:[...pointers.values()][0],camera:clone(current().camera)};
  else drag=null;
  if(!cancel&&gesture?.type==='place')placeNode(gesture.tool,gesture.world);
  renderInspector();$('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length;dirty();
}
stage.onpointerup=pointerEnd;stage.onpointercancel=pointerEnd;
stage.ondblclick=e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id){selected=id;edit();}};
stage.addEventListener('wheel',e=>{e.preventDefault();const p=pos(e);current().camera=zoomAt(current().camera,p.x,p.y,Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.006));renderCanvas();dirty();},{passive:false});
function zoom(factor) {current().camera=zoomAt(current().camera,stage.clientWidth/2,stage.clientHeight/2,factor);renderCanvas();dirty();}
$('#zoomIn').onclick=()=>zoom(1.2);$('#zoomOut').onclick=()=>zoom(1/1.2);$('#zoomValue').onclick=()=>zoom(1/current().camera.z);
$('#addScene').onclick=()=>{if(current().scenes.length>=100)return toast('最多保存 100 个场景');const name=prompt('场景名称',`场景 ${current().scenes.length+1}`);if(!name?.trim())return;checkpoint();current().scenes.push({name:name.trim().slice(0,100),camera:clone(current().camera)});commit();};
function center() {return worldPoint(stage.clientWidth/2,stage.clientHeight/2,current().camera);}
$('#image').onclick=()=>{$('#insertDialog').close();$('#imageFile').click();};
$('#imageFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)||f.size>5*1024*1024)return toast('请选择 5 MB 以内的 PNG、JPEG、WebP 或 GIF 图片');try{const src=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f);});const image=new Image();image.src=src;await image.decode();const p=center(),w=Math.min(440,image.naturalWidth),h=Math.min(10000,w*image.naturalHeight/image.naturalWidth);checkpoint();const n=node('image',p.x-w/2,p.y-h/2,{src,w,h});current().nodes.push(n);selected=n.id;commit();}catch{toast('无法读取这张图片');}};
$('#link').onclick=()=>{$('#insertDialog').close();const url=prompt('输入网页链接（https://…）');if(!url)return;try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();const p=center();checkpoint();const n=node('link',p.x-130,p.y-60,{url:u.href,text:u.hostname+'\n'+u.pathname,w:260,h:120,fill:'#dce8fa'});current().nodes.push(n);selected=n.id;commit();}catch{toast('请输入有效的 http 或 https 网页地址');}};
window.addEventListener('keydown',e=>{if($$('dialog[open]').length||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.code==='Space'){space=true;e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}if(e.key==='Escape'){selected=null;selectTool('select');renderCanvas();renderInspector();}const shortcuts={v:'select',h:'pan',t:'text',n:'note',p:'path'};if(!e.ctrlKey&&!e.metaKey&&shortcuts[e.key.toLowerCase()])selectTool(shortcuts[e.key.toLowerCase()]);});
window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;pointers.clear();finishPath();drag=null;});
function openSettings(first=false) {const s=state.settings;$('#settingsTitle').textContent=first?'欢迎来到无限记':'让无限记更像你';$('#saveSettings').textContent=first?'开始记录':'保存设置';$('#theme').value=s.theme;$('#accent').value=s.accent;$('#keyboardEnabled').checked=s.keyboard;$('#speechEnabled').checked=s.speech;$('#speechLang').value=s.speechLang;$('#speechMode').value=s.speechMode||'offline';$('#reducedGlass').checked=s.reduced;$('#serverURL').value=s.serverURL;$('#serverToken').value=sessionToken;$('#folderLabel').textContent=isNative?(nativeInfo?.folder?.name?'原生文件夹：'+nativeInfo.folder.name:'请先选择原生存储文件夹'):folder?`文件夹：${folder.name}；重启浏览器后可能需要重新授权。`:'当前：浏览器本机存储。可选文件夹或导出备份。';$('#settingsDialog').showModal();}
$('#settings').onclick=()=>{setSidebar(false);openSettings();};
$('#settingsDialog form').addEventListener('submit',e=>{
  if(isNative&&!nativeInfo?.folder?.uri){e.preventDefault();toast('请先选择一个存储文件夹');return;}
  const url=$('#serverURL').value.trim();if(url){try{const u=new URL(url);if(u.protocol!=='https:'&&!(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.protocol==='http:'))throw Error();}catch{e.preventDefault();return toast('远程服务请使用 HTTPS，本机测试可使用 http://127.0.0.1');}}
  state.settings={theme:$('#theme').value,accent:$('#accent').value,keyboard:$('#keyboardEnabled').checked,speech:$('#speechEnabled').checked,speechLang:$('#speechLang').value,reduced:$('#reducedGlass').checked,speechMode:$('#speechMode').value,serverURL:url.replace(/\/$/,'')};sessionToken=$('#serverToken').value;settingsTheme();dirty();
});
$('#chooseFolder').onclick=async()=>{
  if(isNative){try{
    await persist();const picked=await invoke('choose_folder');let existing;
    if(picked.workspace){existing=validateWorkspace(JSON.parse(picked.workspace));if(!confirm('文件夹已有工作区，是否载入？当前内容请先导出备份。'))return;}
    await invoke('confirm_folder');await nativeStatus();
    if(existing){state=existing;sessionToken='';$('#serverToken').value='';selected=null;history=new History();}
    storageBlocked=false;$('#folderLabel').textContent='已选择：'+nativeInfo.folder.name;$('#storageStatus').textContent=nativeInfo.folder.name;render();await persist();toast('原生文件夹已连接，业务资源已导出');
  }catch(e){toast(String(e));}return;}

  if(!window.showDirectoryPicker)return toast('此环境不支持文件夹选择。Android 需接入原生授权；本原型可先导出备份。');
  try{await persist();const handle=await showDirectoryPicker({mode:'readwrite',id:'wuxianji'});let existing;
    try{const file=await handle.getFileHandle('wuxianji-workspace.json');existing=validateWorkspace(JSON.parse(await(await file.getFile()).text()));}catch(e){if(e.name!=='NotFoundError')throw Error('文件夹中的工作区无法读取，已停止操作以保护原文件');}
    if(existing){if(!confirm('此文件夹已有无限记工作区。是否载入？当前浏览器内容将被替换，请先导出备份。'))return;state=existing;storageBlocked=false;sessionToken='';$('#serverToken').value='';selected=null;history=new History();render();}
    folder=handle;await put('folder',handle);$('#folderLabel').textContent=`已选择：${handle.name}`;$('#storageStatus').textContent=handle.name;await persist();toast('文件夹已连接');
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
};
function download(name,content,type='application/json') {const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('#export').onclick=()=>$('#exportDialog').showModal();$('#exportJSON').onclick=()=>download(current().title+'.json',JSON.stringify(current(),null,2));$('#exportSVG').onclick=()=>download(current().title+'.svg',exportSVG(current()),'image/svg+xml');$('#backup').onclick=()=>download('无限记工作区备份.json',JSON.stringify(state,null,2));
const mobileExport=document.createElement('button');mobileExport.type='button';mobileExport.textContent='导出 / 备份';mobileExport.onclick=()=>{$('#settingsDialog').close();$('#exportDialog').showModal();};$('#import').after(mobileExport);
$('#import').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>32*1024*1024)return toast('原型导入文件上限为 32 MB');try{const value=JSON.parse(await f.text());const incoming=value.format==='wuxianji.board'?[validateBoard(value)]:validateWorkspace(value).boards;if(state.boards.length+incoming.length>200)throw Error('导入后将超过 200 个看板');if(storageBlocked&&!confirm('本机原工作区读取异常。导入会恢复自动保存并替换原数据库中的工作区。确定继续？'))return;for(const b of incoming){b.id=uid();b.title=(b.title+'（导入）').slice(0,200);state.boards.push(b);}storageBlocked=false;state.current=incoming[0].id;selected=null;history=new History();render();dirty();$('#settingsDialog').close();toast(`已导入 ${incoming.length} 个看板`);}catch(e){toast('导入失败：'+e.message);}};
function keyboard() {const rows=['qwertyuiop','asdfghjkl','zxcvbnm'];$('#keyboard').replaceChildren();for(let i=0;i<rows.length;i++){const row=document.createElement('div');row.className='key-row';if(i===2)addKey(row,'⇧',()=>{shifted=!shifted;keyboard();},'wide');for(const key of rows[i])addKey(row,shifted?key.toUpperCase():key,()=>insert(shifted?key.toUpperCase():key));if(i===2)addKey(row,'⌫',()=>insert('',true),'wide');$('#keyboard').append(row);}const row=document.createElement('div');row.className='key-row';for(const s of [',','.','?'])addKey(row,s,()=>insert(s));addKey(row,'空格',()=>insert(' '),'space');addKey(row,'换行',()=>insert('\n'),'wide');$('#keyboard').append(row);}
function addKey(row,label,fn,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onpointerdown=e=>e.preventDefault();b.onclick=fn;row.append(b);}
function insert(value,backspace=false){const el=$('#textEditor');let start=el.selectionStart,end=el.selectionEnd;if(backspace&&start===end&&start>0)start-=Array.from(el.value.slice(0,start)).pop().length;el.setRangeText(value,start,end,'end');el.focus();}
keyboard();
let speechGeneration=0, speechController;
const mode=document.createElement('label');mode.className='setting-row';mode.innerHTML='识别方式<select id="speechMode"><option value="offline">离线模型</option><option value="server">私人服务器</option></select>';$('#speechLang').parentElement.after(mode);
const modelButton=document.createElement('button');modelButton.type='button';modelButton.textContent='导入当前语言离线模型（.tar.gz）';mode.after(modelButton);
const modelInput=document.createElement('input');modelInput.type='file';modelInput.accept='.gz';modelInput.hidden=true;document.body.append(modelInput);
modelButton.onclick=()=>modelInput.click();modelInput.onchange=async()=>{const f=modelInput.files[0];modelInput.value='';if(!f)return;if(f.size>150*1024*1024)return toast('请选择 150 MB 内的轻量模型');try{await put('speech-model-'+$('#speechLang').value,f);toast('当前语言模型已保存到本机缓存');}catch(e){toast('模型保存失败：'+e.message);}};
$('#speech').onclick=async()=>{
  if(speechEngine){await speechEngine.stop();speechEngine=null;$('#speech').textContent='◉ 语音输入';return;}
  const generation=++speechGeneration;speechController=new AbortController();$('#speech').disabled=true;let modelURL;
  try{if(state.settings.speechMode==='offline'){const blob=await get('speech-model-'+state.settings.speechLang);if(blob)modelURL=URL.createObjectURL(blob);}
    const active=await startSpeech({signal:speechController.signal,mode:state.settings.speechMode||'offline',modelURL,language:state.settings.speechLang,server:state.settings.serverURL||location.origin,token:sessionToken,onText:text=>{if(generation===speechGeneration&&$('#editorDialog').open)insert(text);},onStatus:msg=>{if(generation===speechGeneration)$('#speechStatus').textContent=msg;}});
    if(generation!==speechGeneration){active.abort();return;}speechEngine=active;$('#speech').textContent='■ 停止语音';
  }catch(e){toast('语音无法启动：'+e.message);}finally{if(modelURL)URL.revokeObjectURL(modelURL);$('#speech').disabled=false;}
};
$('#editorDialog').addEventListener('close',()=>{speechGeneration++;speechController?.abort();speechEngine?.abort();speechEngine=null;$('#speech').textContent='◉ 语音输入';});
$('#sync').onclick=async()=>{
  if(!sessionToken){openSettings();toast('请填写私人服务访问密钥，密钥仅在本次会话中保留');return;}
  const base=state.settings.serverURL||location.origin, b=clone(current()),key=base+'/'+b.id,revision=state.revisions[key]||0;
  $('#sync').disabled=true;
  try{const res=await fetch(base+'/api/boards/'+b.id,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionToken,'If-Match':String(revision)},body:JSON.stringify(b),signal:AbortSignal.timeout(15000)});const data=await res.json();if(res.status===409){const getRemote=confirm('云端已有另一版本。是否下载为新看板并保留本机版本？');if(getRemote){const r=await fetch(base+'/api/boards/'+b.id,{headers:{Authorization:'Bearer '+sessionToken},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('下载失败');const remote=validateBoard((await r.json()).board);remote.id=uid();remote.title=(remote.title+'（云端副本）').slice(0,200);state.boards.push(remote);renderBoards();dirty();}return toast('版本冲突：本机内容已保留，未覆盖云端');}if(!res.ok)throw Error(data.error||'同步失败');state.revisions[key]=data.revision;dirty();toast('当前看板已上传 · 版本 '+data.revision);}catch(e){toast('同步未完成：'+e.message);}finally{$('#sync').disabled=false;}
};
// Explicit cloud download allows a fresh device to recover existing boards without shared IDs.
const pull=document.createElement('button');pull.type='button';pull.textContent='下载云端看板';pull.onclick=async()=>{const token=$('#serverToken').value||sessionToken,base=$('#serverURL').value.replace(/\/$/,'')||location.origin;if(!token)return toast('请先填写访问密钥');try{const u=new URL(base);if(u.protocol!=='https:'&&!(['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.protocol==='http:'))throw Error('请使用 HTTPS');const headers={Authorization:'Bearer '+token};const res=await fetch(base+'/api/boards',{headers,signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('无法读取云端列表');const list=await res.json();const rows=list.boards;if(!rows.length)return toast('云端还没有看板');if(rows.length+state.boards.length>200)throw Error('导入后将超过 200 个看板');if(!confirm(`下载 ${rows.length} 个云端看板？本机同名内容将保留为副本。`))return;const downloaded=[];for(const row of rows){const r=await fetch(base+'/api/boards/'+encodeURIComponent(row.id),{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('下载中断，本机内容未更改');downloaded.push(await r.json());}for(const data of downloaded){const b=validateBoard(data.board);if(state.boards.some(x=>x.id===b.id)){b.id=uid();b.title=(b.title+'（云端副本）').slice(0,200);}else state.revisions[base+'/'+b.id]=data.revision;state.boards.push(b);}renderBoards();dirty();toast('云端看板已下载');}catch(e){toast(e.message);}};$('#serverToken').parentElement.after(pull);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',settingsTheme);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(saveTimer);persist();}});
try {await openDB();await nativeStatus();let stored=await get('workspace');
  if(isNative&&nativeInfo?.folder?.uri){const raw=await invoke('read_workspace');if(raw)stored=JSON.parse(raw);else stored=null;$('#storageStatus').textContent=nativeInfo.folder.name;}
  if(stored)state=validateWorkspace(stored);if(!isNative){folder=await get('folder');if(folder)$('#storageStatus').textContent=folder.name;}
  if(!stored)current().camera={x:20,y:110,z:Math.min(.9,(stage.clientWidth-40)/1000)};
  render();if(isNative)await invoke('app_ready');if(!stored||(isNative&&!nativeInfo?.folder?.uri))openSettings(true);
  if(nativeInfo?.error)toast(nativeInfo.error);
}
catch(e){storageBlocked=true;render();toast('本机数据无法读取：'+e.message+'。已暂停自动保存，请勿清除浏览器数据；可尝试导入备份。');}

if(isNative){
  const update=document.createElement('button');update.type='button';update.textContent='检查业务更新';
  update.onclick=async()=>{if(!nativeInfo.updateConfigured)return toast('此构建未配置更新公钥，尚不能接收热更新');
    try{const base=$('#serverURL').value.trim()||state.settings.serverURL;if(!base.startsWith('https://'))throw Error('请填写 HTTPS 服务地址');
      update.disabled=true;const response=await fetch(base.replace(/\/$/,'')+'/api/releases/latest',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('服务端尚未提供可用更新');
      const meta=await response.json();if(!confirm('下载并验证业务版本 '+meta.manifest.version+'？下次重新打开应用时生效。'))return;
      const result=await invoke('stage_update',{url:new URL(meta.bundle,base).href});toast('版本 '+result.version+' 已验证，请关闭并重新打开应用');
    }catch(e){toast(String(e));}finally{update.disabled=false;}};
  $('#serverToken').parentElement.after(update);
}
