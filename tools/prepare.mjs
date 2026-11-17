import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('client/vendor',{recursive:true});
await copyFile('artwork/icon.svg','client/icon.svg');
await copyFile('node_modules/vosk-browser/dist/vosk.js','client/vendor/vosk.js');
await copyFile('third_party/vosk-browser/COPYING','client/vendor/VOSK-LICENSE.txt');
await copyFile('third_party/vosk-browser/NOTICE','client/vendor/VOSK-NOTICE.txt');
console.log('离线语音运行库已从锁定依赖复制到业务目录');

await import("./prepare-icons.mjs");
