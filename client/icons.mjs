import icons from './vendor/icons.mjs';
export function icon(name){return icons[name]||icons.more;}
export function decorateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
