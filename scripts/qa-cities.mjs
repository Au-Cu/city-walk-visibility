import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CITIES} from '../public/cities.js';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/周金铜/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const browser=await playwright.chromium.launch({channel:'msedge',headless:true}),output=path.resolve('qa-output');await fs.mkdir(output,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/map-data'))network.push(r.url());});
await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0e9"/></svg>'}));
const waitPlan=async()=>{await page.waitForFunction(()=>!document.getElementById('calculate').disabled,{},{timeout:150000});if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error').textContent());if(!await page.locator('#results').isVisible())throw new Error('No route results');};
try{
  await page.goto(process.env.CITY_WALK_QA_URL||'http://127.0.0.1:4174');await waitPlan();const records=[];
  for(const city of CITIES.filter(c=>c.snapshot)){
    await page.locator('#city-select').selectOption(city.id);
    if(await page.locator('#results').isVisible())throw new Error('Old route persists after city change');
    await page.locator('#calculate').click();await waitPlan();
    const data=await page.locator('#data-detail').textContent();if(!data.includes(city.name))throw new Error('Wrong region '+data);
    records.push({city:city.id,best:await page.locator('#best-length').textContent(),baseline:await page.locator('#base-length').textContent(),gain:await page.locator('#gain-label').textContent(),data});
    console.log(JSON.stringify(records.at(-1)));
    if(city.id==='london')await page.screenshot({path:path.join(output,'world-london.png'),fullPage:true});
  }
  if(network.length)throw new Error('Bundled city examples unexpectedly contacted an external map-data API');
  await page.locator('#city-search').fill('Seoul');if(await page.locator('#city-select option').count()!==1)throw new Error('City filter failed');await page.locator('#city-search').fill('');
  await page.locator('.global-location summary').click();await page.locator('#map-center').fill('-33.869, 151.208');await page.locator('#jump-map').click();if(!(await page.locator('#location-label').textContent()).includes('自定义'))throw new Error('Global coordinate jump failed');
  await page.locator('#map-file').setInputFiles(path.resolve('public/data/hangzhou.json'));await page.waitForFunction(()=>!document.getElementById('calculate').disabled);if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error').textContent());if(!(await page.locator('#city-note').textContent()).includes('已导入'))throw new Error('Import failed');
  await page.locator('#city-select').selectOption('hangzhou');await page.locator('#calculate').click();await waitPlan();
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(500);const widths=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));if(widths.scroll>widths.client+1)throw new Error('Mobile overflow');await page.screenshot({path:path.join(output,'world-mobile.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({cities:records.length,externalMapRequests:network.length,widths,errors}));
}finally{await browser.close();}
