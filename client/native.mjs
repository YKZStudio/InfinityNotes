export const isNative=!!window.__TAURI__?.core?.invoke;
export const invoke=(command,args={})=>window.__TAURI__.core.invoke(command,args);
export let nativeInfo=null;
export async function nativeStatus(){if(isNative)nativeInfo=await invoke('native_status');return nativeInfo;}
