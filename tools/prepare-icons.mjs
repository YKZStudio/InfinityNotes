import {readFile,writeFile,copyFile} from 'node:fs/promises';
const names={close:'x',plus:'plus',search:'magnifying-glass',sidebar:'sidebar-simple',undo:'arrow-counter-clockwise',redo:'arrow-clockwise',export:'export',cloud:'cloud-arrow-up',more:'dots-three',settings:'gear-six',cursor:'cursor',hand:'hand',note:'note',text:'text-t',pen:'pencil-simple',rect:'square',circle:'circle',arrow:'arrow-up-right',image:'image',link:'link',external:'arrow-square-out',sliders:'sliders-horizontal',boards:'squares-four',layers:'stack',back:'arrow-left'};
const icons={};for(const [name,file] of Object.entries(names))icons[name]=(await readFile(`node_modules/@phosphor-icons/core/assets/regular/${file}.svg`,'utf8')).replace('<svg ','<svg class="icon" aria-hidden="true" ');
await writeFile('client/vendor/icons.mjs','// Phosphor Icons · MIT\nexport default '+JSON.stringify(icons)+';\n');
await copyFile('node_modules/@phosphor-icons/core/LICENSE','client/vendor/PHOSPHOR-LICENSE.txt');
