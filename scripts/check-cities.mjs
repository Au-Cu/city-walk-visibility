import fs from 'node:fs/promises';
import {CITIES} from '../public/cities.js';
import {buildDataset,planRoute} from '../public/engine.js';
const records=[];
for(const city of CITIES.filter(c=>c.snapshot)){
  try{
    const raw=JSON.parse(await fs.readFile(new URL('../public/data/'+city.snapshot,import.meta.url),'utf8'));
    const data=buildDataset(raw);
    const result=await planRoute(data,{points:city.points.map(([lat,lon])=>({lat,lon})),options:{detour:.25,backtrack:500,radius:120,fov:180,repeat:'none',quality:'standard'}});
    const record={city:city.id,roads:data.stats.roadWays,buildings:data.stats.buildings,baseline_m:result.baselineLength,best_m:result.best.length,backtrack_m:result.best.backtracking,repeat_m:result.best.repeated,area_m2:result.best.area,baseline_area_m2:result.baseline.area,max_snap_m:Math.max(...result.snaps.map(s=>s.offset)),clipped:result.clipped,timestamp:result.timestamp};
    records.push(record);console.log(JSON.stringify(record));
  }catch(error){records.push({city:city.id,error:error.message});console.log(JSON.stringify(records.at(-1)));}
}
await fs.mkdir(new URL('../qa-output/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../qa-output/city-checks.json',import.meta.url),JSON.stringify(records,null,2));
if(records.some(r=>r.error))process.exitCode=1;
