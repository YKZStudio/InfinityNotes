export const isNative=!!window.__TAURI__?.core?.invoke;
export const invoke=(command,args={})=>window.__TAURI__.core.invoke(command,args);
export let nativeInfo=null;
export async function nativeStatus(){if(isNative)nativeInfo=await invoke('native_status');return nativeInfo;}

let nativeDark;
function applyInsets(value){
  for(const side of ['top','right','bottom','left']){
    const px=Number(value?.[side]);
    if(Number.isFinite(px)&&px>=0&&px<=500)document.documentElement.style.setProperty('--native-safe-'+side,px+'px');
  }
}
// Layout events also cover rotation, navigation mode changes and foldable/window resizing.
window.addEventListener('infinity-insets',event=>applyInsets(event.detail));
async function refreshInsets(){
  if(!isNative)return;
  try{applyInsets(await invoke('window_insets',{dark:nativeDark===true}));}catch{/* Older shells retain CSS environment insets. */}
}
export function setNativeAppearance(dark){if(nativeDark===dark)return;nativeDark=dark;refreshInsets();}
window.addEventListener('resize',refreshInsets);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshInsets();});
function visualHeight(){document.documentElement.style.setProperty('--visual-height',(window.visualViewport?.height||innerHeight)+'px');}
window.visualViewport?.addEventListener('resize',visualHeight);visualHeight();
