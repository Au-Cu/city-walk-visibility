import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';
import fs from 'node:fs/promises';
test('Pages isolates API Functions from static real-map assets',async()=>{
  const routes=JSON.parse(await fs.readFile(new URL('../public/_routes.json',import.meta.url),'utf8'));
  assert.deepEqual(routes,{version:1,include:['/api/*'],exclude:[]});
  const config=JSON.parse(await fs.readFile(new URL('../cloudflare/pages/wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.name,'city-walk-visibility');
  assert.equal(config.pages_build_output_dir,'../../.pages-output');
  assert.equal(config.compatibility_date,'2026-05-22');
  assert.equal(config.main,undefined);
});
test('standalone Cloudflare entry serves assets, health and a bounded API',async()=>{
  const env={ASSETS:{fetch:()=>new Response('asset')}};
  assert.equal(await (await worker.fetch(new Request('https://example.test/'),env,{})).text(),'asset');
  assert.equal((await (await worker.fetch(new Request('https://example.test/api/health'),env,{})).json()).configuredDataBackend,false);
  assert.equal((await worker.fetch(new Request('https://example.test/api/map-data?bbox=bad'),env,{})).status,400);
  assert.equal((await worker.fetch(new Request('https://example.test/api/map-data?bbox=bad',{headers:{Origin:'https://other.test'}}),env,{})).status,403);
  assert.equal((await worker.fetch(new Request('https://example.test/api/unknown'),env,{})).status,404);
});
test('public map API has best-effort request throttling',async()=>{
  const request=()=>new Request('https://example.test/api/map-data?bbox=bad',{headers:{'CF-Connecting-IP':'rate-test'}});
  for(let i=0;i<6;i++)assert.equal((await worker.fetch(request(),{},{})).status,400);
  const response=await worker.fetch(request(),{},{});assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});
