import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MAX_WAYPOINTS,parseCoordinate,validateRoutePoints} from '../public/waypoints.js';
import {buildDataset,planRoute,shortestPath,snapPoint,combineCandidates} from '../public/engine.js';

test('zero through eight waypoints are accepted; excess and malformed coordinates are rejected',()=>{
  for(let n=0;n<=MAX_WAYPOINTS;n++)assert.equal(validateRoutePoints(Array.from({length:n+2},()=>({lat:35,lon:139}))).length,n+2);
  assert.throws(()=>validateRoutePoints(Array.from({length:MAX_WAYPOINTS+3},()=>({lat:35,lon:139}))),/最多 8/);
  assert.throws(()=>validateRoutePoints([{lat:35,lon:139}]),/起点、终点/);
  assert.throws(()=>validateRoutePoints([{lat:NaN,lon:139},{lat:35,lon:139}]),/坐标无效/);
  assert.deepEqual(parseCoordinate('35.71，139.8'),{lat:35.71,lon:139.8});
  assert.throws(()=>parseCoordinate('','途经点 2'),/途经点 2/);
});

test('nine-leg combination stays bounded without relaxing budget or repeat constraints',async()=>{
  const data={edges:[]},lists=Array.from({length:9},(_,phase)=>Array.from({length:26},(_,choice)=>{
    const id=data.edges.length,length=100+choice;data.edges.push({physicalId:`${phase}:${choice}`,length});
    return {edgeIds:[id],nodeIds:[],length,backtracking:choice%3};
  }));
  const result=await combineCandidates(data,lists,{repeat:'none',backtrack:500,quality:'standard'},1125);
  assert.equal(result.truncated,true);assert.equal(result.frontierLimit,1024);
  assert.ok(result.routes.length>0&&result.routes.length<=1024);
  assert.ok(result.expanded<=9*26*1024);
  for(const route of result.routes){assert.equal(route.legs.length,9);assert.ok(route.length<=1125.001);assert.equal(route.repeated,0);}
});

test('real Tokyo paths visit zero, two, five and eight waypoints in the requested order',async()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('../public/data/tokyo-asakusa.json',import.meta.url),'utf8')),data=buildDataset(raw);
  const preset=[{lat:35.71104,lon:139.79633},{lat:35.71465,lon:139.80177},{lat:35.7101,lon:139.8107}],snaps=preset.map(p=>snapPoint(data,p));
  const a=shortestPath(data,snaps[0].id,snaps[1].id),b=shortestPath(data,snaps[1].id,snaps[2].id),chain=[...a.nodeIds,...b.nodeIds.slice(1)];
  for(const count of [0,2,5,8]){
    const points=Array.from({length:count+2},(_,i)=>{const node=data.nodes[chain[Math.floor(i*(chain.length-1)/(count+1))]];return {lat:node.lat,lon:node.lon};});
    const result=await planRoute(data,{points,options:{detour:0,backtrack:500,radius:60}}),ids=result.best.osmNodeIds;
    let after=-1;
    for(const snap of result.snaps){const index=ids.indexOf(data.nodes[snap.id].osmId,after+1);assert.ok(index>after,`Missing or out-of-order waypoint for ${count} vias`);after=index;}
    assert.equal(result.inputPoints.length,count+2);assert.equal(result.best.repeated,0);assert.ok(result.best.length<=result.budget+.01);
  }
  const many=Array.from({length:10},(_,i)=>{const n=data.nodes[chain[Math.floor(i*(chain.length-1)/9)]];return {lat:n.lat,lon:n.lon};});
  const optimized=await planRoute(data,{points:many,options:{detour:.25,backtrack:500,radius:60}});
  assert.equal(optimized.best.repeated,0);assert.ok(optimized.best.length<=optimized.budget+.01);assert.ok(optimized.best.area>=optimized.baseline.area);
});
