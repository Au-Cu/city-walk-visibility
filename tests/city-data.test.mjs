import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CITIES} from '../public/cities.js';
import {buildDataset,snapPoint,shortestPath} from '../public/engine.js';
test('all ten bundled datasets retain real OSM IDs, dates, buildings and connected example roads',async()=>{
  for(const city of CITIES.filter(c=>c.snapshot)){
    const file=new URL('../public/data/'+city.snapshot,import.meta.url),size=(await fs.stat(file)).size;assert.ok(size<25*1024*1024,city.id+' fits Cloudflare asset limit');
    const raw=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(raw.osm3s?.timestamp_osm_base);assert.equal(raw.metadata.license,'ODbL 1.0');assert.deepEqual(raw.metadata.bounds,city.bounds);
    const data=buildDataset(raw);assert.ok(data.stats.roadWays>0);assert.ok(data.stats.buildings>0);
    const snaps=city.points.map(([lat,lon])=>snapPoint(data,{lat,lon}));
    for(let i=1;i<snaps.length;i++){const leg=shortestPath(data,snaps[i-1].id,snaps[i].id);assert.ok(leg,city.id+' connected via');assert.ok(leg.edgeIds.every(id=>Number.isSafeInteger(data.edges[id].wayId)));}
  }
});
