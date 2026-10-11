import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/周金铜/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL=process.env.CITY_WALK_QA_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'msedge',headless:true});
const output=path.resolve('qa-output');await fs.mkdir(output,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
// No automated requests to OSM tile servers. The local road/building vectors remain real.
await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0e9"/></svg>'}));
const waitPlan=async()=>{await page.waitForFunction(()=>!document.getElementById('calculate').disabled,{},{timeout:160000});const error=await page.locator('#error').textContent();if(await page.locator('#error').isVisible())throw new Error(error);};
try{
  await page.goto(baseURL);await page.waitForSelector('#results:not([hidden])',{timeout:120000});await waitPlan();
  const initial={best:await page.locator('#best-length').textContent(),baseline:await page.locator('#base-length').textContent(),gain:await page.locator('#gain-label').textContent(),data:await page.locator('#data-detail').textContent()};
  await page.screenshot({path:path.join(output,'tokyo-desktop.png'),fullPage:true});
  await page.locator('[data-route="baseline"]').click();if(await page.locator('[data-route="baseline"]').getAttribute('aria-pressed')!=='true')throw new Error('Route switch failed');
  await page.locator('[data-route="best"]').click();await page.locator('#position').fill('50');await page.locator('#position').dispatchEvent('input');await page.waitForTimeout(200);if(!(await page.locator('#observation-detail').textContent()).includes('已走'))throw new Error('Observer update failed');
  await page.locator('.advanced summary').click();await page.locator('#detour').fill('0');await page.locator('#detour').dispatchEvent('input');await page.locator('#calculate').click();await waitPlan();
  if(await page.locator('#best-length').textContent()!==await page.locator('#base-length').textContent())throw new Error('Zero-detour UI mismatch');
  const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent;await download.saveAs(path.join(output,'route.geojson'));const geo=JSON.parse(await fs.readFile(path.join(output,'route.geojson'),'utf8'));if(geo.features[0].geometry.type!=='LineString')throw new Error('Export missing route');
  await page.locator('#detour').fill('25');await page.locator('#detour').dispatchEvent('input');await page.locator('#calculate').click();await waitPlan();
  await page.locator('[data-pick="via"]').click();await page.locator('#map').click({position:{x:550,y:340}});if((await page.locator('#via-name').textContent())!=='地图选点')throw new Error('Map input failed');
  await page.locator('#tokyo-example').click();
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(500);const width=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));if(width.scroll>width.client+1)throw new Error('Mobile horizontal overflow');
  await page.screenshot({path:path.join(output,'tokyo-mobile.png'),fullPage:true});
  let live={skipped:'Use --live to include the external service check.'};
  if(process.argv.includes('--live')){
  // These real Tokyo points are outside the bundled snapshot: test the entire live loading pipeline.
  await page.setViewportSize({width:1440,height:1050});
  await page.locator('#start').fill('35.708, 139.7825');await page.locator('#via').fill('35.710, 139.7823');await page.locator('#end').fill('35.711, 139.7845');
  const liveRequests=[];page.on('response',response=>{if(response.url().includes('/api/map-data'))liveRequests.push({url:response.url().split('?')[0],status:response.status()});});
  await page.locator('#calculate').click();await waitPlan();
  live={requests:liveRequests,best:await page.locator('#best-length').textContent(),baseline:await page.locator('#base-length').textContent(),data:await page.locator('#data-detail').textContent()};
  if(!live.requests.some(r=>r.status===200)||live.data.includes('32,476'))throw new Error('Live region did not replace snapshot');
  await page.screenshot({path:path.join(output,'tokyo-live.png'),fullPage:true});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({initial,live,width,errors,download:download.suggestedFilename()},null,2));
}finally{await browser.close();}
