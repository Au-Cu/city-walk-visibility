import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.pages-output');
const marker='.city-walk-pages-build';
const identity='city-walk-visibility Pages build output';
const runtime=path.join(root,'.sites-runtime');
await fs.mkdir(runtime,{recursive:true});
const temporary=await fs.mkdtemp(path.join(runtime,'pages-build-'));
const staging=path.join(temporary,'assets');

async function copyAssets(source,destination){
  await fs.mkdir(destination,{recursive:true});
  let count=0;
  for(const entry of await fs.readdir(source,{withFileTypes:true})){
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    if(entry.isDirectory())count+=await copyAssets(from,to);
    else if(entry.isFile()){
      if((await fs.stat(from)).size>25*1024*1024)throw new Error(`Cloudflare Pages asset exceeds 25 MiB: ${from}`);
      await fs.copyFile(from,to);count++;
    }else throw new Error(`Unsupported asset (links are not copied): ${from}`);
  }
  return count;
}

try{
  const count=await copyAssets(path.join(root,'public'),staging);
  const bundled=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',path.join(root,'wrangler.public.jsonc'),'--outdir',path.join(temporary,'bundle')],{cwd:root,stdio:'inherit'});
  if(bundled.error)throw bundled.error;
  if(bundled.status!==0)throw new Error('Pages API bundle failed; existing output was preserved.');
  await fs.copyFile(path.join(temporary,'bundle/worker.js'),path.join(staging,'_worker.js'));
  await fs.writeFile(path.join(staging,marker),identity+'\n');
  let existing;
  try{existing=await fs.lstat(output);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing){
    // Remove only this exact, marked build directory, never a checkout or link.
    if(!existing.isDirectory()||existing.isSymbolicLink()||(await fs.readFile(path.join(output,marker),'utf8')).trim()!==identity)throw new Error(`Refusing to replace an unrecognized directory: ${output}`);
    if((await fs.realpath(output)).toLowerCase()!==output.toLowerCase())throw new Error('Pages output resolves outside its expected directory.');
    await fs.rm(output,{recursive:true,force:true});
  }
  await fs.rename(staging,output);
  // Keep Pages config discovery isolated from the Sites/Vinext build redirect.
  const pagesRedirect=path.join(root,'cloudflare/pages/.wrangler/deploy');
  await fs.mkdir(pagesRedirect,{recursive:true});
  await fs.writeFile(path.join(pagesRedirect,'config.json'),JSON.stringify({configPath:'../../wrangler.jsonc'}));
  console.log(`Pages build ready: ${count} real-map assets + bundled API in ${output}`);
}finally{
  // mkdtemp created this task-owned directory under the ignored runtime folder.
  await fs.rm(temporary,{recursive:true,force:true});
}
