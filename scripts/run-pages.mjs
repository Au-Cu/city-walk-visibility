import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [command,...extra]=process.argv.slice(2);
if(!['dev','deploy'].includes(command))throw new Error('Expected dev or deploy.');
// Preview the shared Worker locally with an explicit config. Pages dev in
// Wrangler 4.92 can inherit Vinext's asset redirect; public deployment remains
// Pages only and never creates a workers.dev domain.
const args=command==='dev'?['dev','--config',path.join(root,'wrangler.public.jsonc'),'--port','4174','--ip','127.0.0.1','--inspector-port','0',...extra]:['pages','deploy','--branch','main','--no-bundle',...extra];
const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:command==='dev'?root:path.join(root,'cloudflare/pages'),stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
