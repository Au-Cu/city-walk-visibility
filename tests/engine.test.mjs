import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDataset,planRoute,projectionBacktracking,pointInRing,pointInBuilding,raySegment,visibilityPolygon,shortestPath,repeatedLength} from '../public/engine.js';

const ring=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}];
test('same-direction and orthogonal travel have zero axis cancellation; returning counts',()=>{
  assert.equal(projectionBacktracking([{x:0,y:0},{x:100,y:0},{x:100,y:100}]),0);
  assert.equal(projectionBacktracking([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:100,y:0}]),100);
  assert.equal(projectionBacktracking([{x:0,y:0},{x:-40,y:0},{x:100,y:0}]),40);
});
test('building courtyard is a hole, not an obstacle',()=>{
  const rings=[ring(0,0,100,100),ring(20,20,40,40)];
  assert.equal(pointInBuilding({x:10,y:10},rings),true);
  assert.equal(pointInBuilding({x:30,y:30},rings),false);
});
test('ray intersection picks physical wall distance and ignores parallel segments',()=>{
  assert.equal(raySegment({x:0,y:0},1,0,[20,-10,20,10]),20);
  assert.equal(raySegment({x:0,y:0},1,0,[20,10,40,10]),Infinity);
});
function fixture(){
  const point=(id,x,y)=>({type:'node',id,lat:y/111195,lon:x/111195});
  return buildDataset({elements:[point(1,-80,0),point(2,0,0),point(3,80,0),point(4,20,-10),point(5,40,-10),point(6,40,10),point(7,20,10),{type:'way',id:1,nodes:[1,2,3],tags:{highway:'residential',oneway:'yes'}},{type:'way',id:2,nodes:[4,5,6,7,4],tags:{building:'yes'}}]}, {bounds:{south:-.002,west:-.002,north:.002,east:.002},fetchedAt:new Date().toISOString()});
}
test('front wall blocks ground behind it; distance is not circular buffering',()=>{
  const data=fixture(),poly=visibilityPolygon(data,{x:0,y:0},0,{radius:100,fov:180});
  assert.equal(pointInRing({x:10,y:0},poly),true);
  assert.equal(pointInRing({x:50,y:0},poly),false);
  assert.equal(pointInRing({x:-10,y:0},poly),false);
});
test('car one-way is not assumed to prohibit walking; reverse traversal is a repeated road',()=>{
  const data=fixture(),a=data.nodes.findIndex(n=>n.osmId===1),b=data.nodes.findIndex(n=>n.osmId===3);
  const forward=shortestPath(data,a,b),reverse=shortestPath(data,b,a);
  assert.ok(forward&&reverse);
  assert.ok(Math.abs(repeatedLength(data,[...forward.edgeIds,...reverse.edgeIds])-forward.length)<1e-6);
});
const raw=JSON.parse(fs.readFileSync(new URL('../public/data/tokyo-asakusa.json',import.meta.url),'utf8'));
const real=buildDataset(raw),points=[{lat:35.71104,lon:139.79633},{lat:35.71465,lon:139.80177},{lat:35.7101,lon:139.8107}];
test('real Tokyo route follows actual OSM edges, ordered via, budget and repeat constraints',async()=>{
  assert.ok(real.stats.buildings>1000);assert.ok(real.stats.nodes>1000);
  const result=await planRoute(real,{points,options:{detour:.25,backtrack:500}});
  assert.ok(result.best.length<=result.budget+.01);assert.ok(result.best.backtracking<=500.01);assert.equal(result.best.repeated,0);
  assert.ok(result.best.area>=result.baseline.area);assert.equal(result.clipped,false);
  const ids=result.best.osmNodeIds,viaId=real.nodes[result.snaps[1].id].osmId;
  assert.equal(ids[0],real.nodes[result.snaps[0].id].osmId);assert.equal(ids.at(-1),real.nodes[result.snaps.at(-1).id].osmId);assert.ok(ids.includes(viaId));
  const allowed=new Set(real.edges.map(e=>real.nodes[e.from].osmId+':'+real.nodes[e.to].osmId));
  for(let i=1;i<ids.length;i++)assert.ok(allowed.has(ids[i-1]+':'+ids[i]),'No invented road connectors');
  console.log(JSON.stringify({realDataTimestamp:result.timestamp,bestLength:result.best.length,baselineLength:result.baseline.length,bestArea:result.best.area,baselineArea:result.baseline.area,repeat:result.best.repeated,candidates:result.candidatesEvaluated}));
});
test('zero detour uses the actual shortest walking length through the via point',async()=>{
  const result=await planRoute(real,{points,options:{detour:0,backtrack:500}});
  assert.ok(Math.abs(result.best.length-result.baselineLength)<.01);
});
test('too restrictive backtracking reports infeasibility instead of inventing a route',async()=>{
  await assert.rejects(planRoute(real,{points,options:{detour:0,backtrack:0}}),/未找到同时满足约束/);
});
