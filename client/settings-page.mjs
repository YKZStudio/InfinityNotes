// One settings form serves a full page and the first-run stepper.
export function createSettingsPages(api){
 const $=s=>document.querySelector(s),page=$('#settingsPage'),form=page.querySelector('form');
 let first=false,step=0,origin='home';
 const sections=[...page.querySelectorAll('.settings-grid>section')];
 const steps=['欢迎','存储位置','外观','输入方式'];
 function paint(){
  page.dataset.setup=String(first);page.dataset.step=String(step);
  $('#setupProgress').hidden=!first;$('#setupProgress').textContent=`${step+1} / ${steps.length} · ${steps[step]}`;
  $('#setupWelcome').hidden=!first||step!==0;
  sections.forEach((s,i)=>s.hidden=first&&(step===0||i!==step-1));
  $('#settingsTitle').textContent=first?['欢迎来到无限记','让灵感有处安放','选一个喜欢的样子','按你的习惯记录'][step]:'设置';
  $('#settingsIntro').textContent=first?['从一张看板开始，把想法慢慢铺开。','选择存储文件夹，保存你的看板和附件。','主题色会同步应用到背景、卡片和控件。','键盘和语音都可以稍后在设置里开启。'][step]:'外观、存储与记录方式';
  $('#saveSettings').textContent=first?(step===3?'开始记录':'下一步'):'保存设置';
  $('#setupPrevious').hidden=!first||step===0;
  $('#closeSettings').hidden=first;
  for(const b of page.querySelectorAll('.dialog-footer>button:not(#saveSettings):not(#setupPrevious)'))b.hidden=first;
  page.scrollTop=0;
 }
 function show(required){
  if(page.hidden){origin=document.body.dataset.page||'home';history.pushState({infinity:'settings'},'');}
  first=required;step=0;document.body.dataset.page='settings';page.hidden=false;
  for(const id of ['main','sidebar','library'])$('#'+id).hidden=true;
  paint();$('#settingsTitle').focus();
 }
 function hide(result='cancel',fromBack=false){
  if(api.required()){if(step>0){step--;paint();}return;}
  page.hidden=true;document.body.dataset.page=origin;
  $('#library').hidden=origin!=='home';$('#main').hidden=origin!=='editor';$('#sidebar').hidden=origin!=='editor';
  page.dispatchEvent(new CustomEvent('settings-close',{detail:result}));
  if(!fromBack&&history.state?.infinity==='settings')history.back();
 }
 form.addEventListener('submit',e=>{
  if(!first||step===3)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(step===1&&!api.storageReady()){api.toast('请先选择存储文件夹');$('#chooseFolder').focus();return;}
  step++;paint();$('#settingsTitle').focus();
 },true);
 $('#setupPrevious').onclick=()=>{if(step>0){step--;paint();}};
 $('#closeSettings').onclick=()=>hide();
 window.addEventListener('popstate',()=>{if(!page.hidden){if(api.required()){if(step>0){step--;paint();}history.pushState({infinity:'settings'},'');}else hide('cancel',true);}});
 page.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hide();}});
 return {show,hide};
}
