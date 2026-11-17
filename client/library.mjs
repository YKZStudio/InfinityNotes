import {exportSVG,clone} from './core.mjs';
import {icon} from './icons.mjs';
import {presets} from './theme.mjs';
export function library(api){
 const $=s=>document.querySelector(s);let tab='boards',sort='all';
 function page(value,fromHistory=false){if(!fromHistory&&value!==document.body.dataset.page){if(value==='editor')history.pushState({infinity:'editor'},'');else if(value==='home'&&history.state?.infinity==='editor')history.back();}document.body.dataset.page=value;$('#library').hidden=value!=='home';$('#main').hidden=value!=='editor';$('#sidebar').hidden=value!=='editor';api.closeSidebar();if(value==='home')render();}
 function open(b,camera){page('editor');api.open(b.id,camera);}
 function date(time){const d=new Date();d.setHours(0,0,0,0);return time>=+d?'今天':time>=+d-86400000?'昨天':new Date(time).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});}
 function render(){
  const boards=sort==='recent'?[...api.state().boards].sort((a,b)=>b.updated-a.updated):api.state().boards;
  const grid=$('#libraryBoards');grid.replaceChildren();
  for(const b of boards){const button=document.createElement('button');button.className='library-card';button.setAttribute('aria-label','打开看板 '+b.title);const preview=document.createElement('div');preview.className='library-preview';preview.innerHTML=exportSVG(b);preview.setAttribute('aria-hidden','true');const title=document.createElement('strong');title.textContent=b.title;const meta=document.createElement('span');meta.textContent=date(b.updated);button.append(preview,title,meta);button.onclick=()=>open(b);grid.append(button);}
  const scenes=$('#libraryScenes');scenes.replaceChildren();
  for(const b of boards)for(const s of b.scenes){const button=document.createElement('button');button.className='scene-card';const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=s.name;detail.textContent=b.title;button.innerHTML=icon('layers');button.append(title,detail);button.onclick=()=>open(b,clone(s.camera));scenes.append(button);}
  if(!scenes.children.length){const empty=document.createElement('div');empty.className='library-empty';empty.innerHTML=icon('layers')+'<h2>留住一个视角</h2><p>在看板中点击「＋ 场景」，保存当前视角。<br>之后就能从这里回到它。</p>';scenes.append(empty);}
 }
 function select(value){tab=value;$('#libraryTitle').textContent=tab==='boards'?'看板':'场景';$('#libraryBoards').hidden=tab!=='boards';$('#libraryFilters').hidden=tab!=='boards';$('#libraryScenes').hidden=tab!=='scenes';$('#libraryNav').style.setProperty('--index',tab==='boards'?0:1);for(const b of document.querySelectorAll('[data-tab]')){if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}render();}
 $('#backHome').onclick=()=>page('home');$('#libraryNew').onclick=()=>{page('editor');$('#newBoard').click();};
 for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{if(b.dataset.tab==='settings'){$('#libraryNav').style.setProperty('--index',2);for(const nav of document.querySelectorAll('[data-tab]'))nav.removeAttribute('aria-current');b.setAttribute('aria-current','page');api.settings();}else select(b.dataset.tab);};
 for(const b of document.querySelectorAll('[data-sort]'))b.onclick=()=>{sort=b.dataset.sort;for(const other of document.querySelectorAll('[data-sort]'))other.setAttribute('aria-pressed',String(other===b));render();};
 for(const [name,color] of presets){const b=document.createElement('button');b.type='button';b.className='palette-chip';b.style.backgroundColor=color;b.setAttribute('aria-label',name+'主题');b.onclick=()=>{$('#accent').value=color;preview();};$('#palettePresets').append(b);}
 function preview(){api.preview({...api.state().settings,accent:$('#accent').value,theme:$('#theme').value,reduced:$('#reducedGlass').checked});}
 for(const id of ['accent','theme','reducedGlass'])$('#'+id).addEventListener('input',preview);
 $('#settingsPage').addEventListener('settings-close',()=>{api.preview(api.state().settings);select(tab);});
 window.addEventListener('popstate',e=>{if(document.body.dataset.page==='settings')return;if(e.state?.infinity==='editor')page('editor',true);else page('home',true);});
 document.addEventListener('workspace-render',render);if(document.body.dataset.page==='settings')render();else page('home');
}
