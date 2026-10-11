import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES} from '../public/cities.js';
import {regionArea,validateBounds,regionCovers,requestBounds,normalizeMapData} from '../public/regions.js';
test('all ten requested city examples have valid bounded areas and points',()=>{
  const examples=CITIES.filter(c=>c.snapshot);
  assert.deepEqual(new Set(examples.map(c=>c.id)),new Set(['tokyo','seoul','sapporo','london','amsterdam','paris','new-york','hangzhou','singapore','kyoto']));
  assert.equal(new Set(CITIES.map(c=>c.id)).size,CITIES.length);
  for(const city of examples){validateBounds(city.bounds);assert.ok(regionArea(city.bounds)<40000000);assert.ok(regionCovers(city.points.map(([lat,lon])=>({lat,lon})),{bounds:city.bounds},400));}
});
test('region calculations work in both hemispheres and reject intercity / date-line routes',()=>{
  for(const [lat,lon] of [[48.85,2.35],[40.71,-74.01],[-33.86,151.2],[-23.55,-46.63],[1.29,103.85]]){
    const points=[{lat,lon},{lat:lat+.01,lon:lon+.01}],bounds=requestBounds(points,{radius:120,detour:.25});assert.ok(regionCovers(points,{bounds},220));
  }
  assert.throws(()=>requestBounds([{lat:35,lon:139},{lat:51,lon:0}],{radius:120,detour:.25}),/40/);
  assert.throws(()=>requestBounds([{lat:0,lon:179.999},{lat:0,lon:-179.999}],{radius:120,detour:.25}),/日期/);
});
test('imports require actual OSM topology and bounded numeric coordinates',()=>{
  const raw={elements:[{type:'node',id:1,lat:-33.87,lon:151.2},{type:'node',id:2,lat:-33.86,lon:151.21},{type:'way',id:3,tags:{highway:'footway'},nodes:[1,2]}]};
  assert.equal(normalizeMapData(raw).metadata.bounds.south,-33.87);
  assert.throws(()=>normalizeMapData({type:'FeatureCollection',features:[]}),/Overpass JSON/);
  assert.throws(()=>normalizeMapData({...raw,remark:'timeout'}),/未完成/);
  assert.throws(()=>normalizeMapData({...raw,elements:[...raw.elements,{type:'node',id:4,lat:Infinity,lon:0}]}, {bounds:{south:-33.87,west:151.2,north:-33.86,east:151.21}}),/地理坐标/);
  assert.throws(()=>validateBounds({south:'35',west:1,north:36,east:2}));
});
