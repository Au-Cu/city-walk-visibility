import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildDataset,shortestPath,snapPoint} from '../public/engine.js';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/周金铜/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const data=buildDataset(JSON.parse(await fs.readFile(new URL('../public/data/tokyo-asakusa.json',import.meta.url),'utf8')));
const preset=[{lat:35.71104,lon:139.79633},{lat:35.71465,lon:139.80177},{lat:35.7101,lon:139.8107}],snaps=preset.map(p=>snapPoint(data,p));
const a=shortestPath(data,snaps[0].id,snaps[1].id),b=shortestPath(data,snaps[1].id,snaps[2].id),chain=[...a.nodeIds,...b.nodeIds.slice(1)];
const stops=count=>Array.from({length:count+2},(_,i)=>{const n=data.nodes[chain[Math.floor(i*(chain.length-1)/(count+1))]];return `${n.lat}, ${n.lon}`;});
const browser=await playwright.chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],records=[];
const output=path.resolve('qa-output');await fs.mkdir(output,{recursive:true});
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0e9"/></svg>'}));
await page.addInitScript(()=>{
  const OriginalWorker=window.Worker;
  window.Worker=class extends OriginalWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data.kind==='planned')window.__qaRoute=event.data.result;});}};
  window.__etaTexts=[];
  window.addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('progress-eta');if(el)new MutationObserver(()=>window.__etaTexts.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true});});
});
async function waitPlan(){await page.waitForFunction(()=>!document.getElementById('calculate').disabled,{},{timeout:160000});if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error').textContent());if(!await page.locator('#results').isVisible())throw new Error('No route');}
async function removeAll(){while(await page.locator('[data-waypoint-action="remove"]').count())await page.locator('[data-waypoint-action="remove"]').last().click();}
try{
  await page.goto(process.env.CITY_WALK_QA_URL||'http://127.0.0.1:4174/');await waitPlan();
  await page.locator('.advanced summary').click();await page.locator('#radius').fill('60');await page.locator('#detour').fill('0');
  for(const count of [0,1,2,3,4,5,8]){
    await removeAll();const coordinates=stops(count);
    await page.locator('#start').fill(coordinates[0]);await page.locator('#end').fill(coordinates.at(-1));
    for(let i=0;i<count;i++){await page.locator('#add-waypoint').click();await page.locator('#waypoint-list input').nth(i).fill(coordinates[i+1]);}
    if(await page.locator('#end-number').textContent()!==String(count+2))throw new Error('End numbering mismatch');
    await page.locator('#calculate').click();await waitPlan();
    const checked=await page.evaluate(()=>{const r=window.__qaRoute;let after=-1;for(const snap of r.snaps){const index=r.best.coordinates.findIndex((p,i)=>i>after&&Math.abs(p[0]-snap.coordinates[0])<1e-9&&Math.abs(p[1]-snap.coordinates[1])<1e-9);if(index<0)return {ordered:false};after=index;}return {ordered:true,count:r.inputPoints.length-2,repeated:r.best.repeated,withinBudget:r.best.length<=r.budget+.01};});
    if(!checked.ordered||checked.count!==count||checked.repeated!==0||!checked.withinBudget)throw new Error('Route constraint failure '+JSON.stringify(checked));records.push(checked);console.log(JSON.stringify(checked));
  }
  if(!await page.locator('#add-waypoint').isDisabled())throw new Error('Waypoint cap not enforced');
  const oldFirst=await page.locator('#waypoint-list input').nth(0).inputValue(),oldSecond=await page.locator('#waypoint-list input').nth(1).inputValue();
  await page.locator('[data-waypoint-action="up"]').nth(1).click();
  if(await page.locator('#waypoint-list input').nth(0).inputValue()!==oldSecond||await page.locator('#waypoint-list input').nth(1).inputValue()!==oldFirst)throw new Error('Reorder lost values');
  await page.locator('[data-waypoint-action="down"]').nth(0).click();
  await page.locator('#detour').fill('25');await page.locator('#calculate').click();await waitPlan();
  const eta=await page.evaluate(()=>({seenEstimate:window.__etaTexts.some(t=>t.includes('预计还需约')),seenElapsed:window.__etaTexts.some(t=>t.includes('已用时')),stopped:document.getElementById('progress-area').hidden}));
  if(!eta.seenEstimate||!eta.seenElapsed||!eta.stopped)throw new Error('ETA not visible or not stopped '+JSON.stringify(eta));
  await page.screenshot({path:path.join(output,'waypoints-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(300);const widths=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));if(widths.scroll>widths.client+1)throw new Error('Mobile overflow');await page.screenshot({path:path.join(output,'waypoints-mobile.png'),fullPage:true});
  await page.locator('[data-waypoint-action="remove"]').last().click();if(!await page.locator('#add-waypoint').isEnabled())throw new Error('Delete did not release cap');
  await page.locator('#tokyo-example').click();if(await page.locator('#waypoint-list input').count()!==1)throw new Error('Example did not reset waypoints');
  await page.setViewportSize({width:1440,height:1050});await page.locator('#waypoint-list [data-pick]').click();await page.locator('#map').click({position:{x:550,y:330}});if(await page.locator('#waypoint-list small').textContent()!=='地图选点')throw new Error('Dynamic map picking failed');
  await page.route('**/api/map-data?**',async route=>{await new Promise(resolve=>setTimeout(resolve,1000));try{await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA unavailable backend'})});}catch{}});
  await page.locator('#start').fill('-33.87, 151.205');await page.locator('#waypoint-list input').fill('-33.869, 151.206');await page.locator('#end').fill('-33.868, 151.207');await page.locator('#calculate').click();await page.waitForFunction(()=>document.getElementById('progress-eta').textContent.includes('等待地图服务'));
  if((await page.locator('#progress-eta').textContent()).includes('预计还需'))throw new Error('Network wait got false ETA');await page.locator('#cancel').click();await page.waitForFunction(()=>document.getElementById('progress-area').hidden);
  if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({records,eta,widths,networkCancel:true,errors}));
}finally{await browser.close();}
