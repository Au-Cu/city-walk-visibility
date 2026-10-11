import test from 'node:test';
import assert from 'node:assert/strict';
import {mapQuery,mapData,MAP_SERVICES} from '../server/data-proxy.mjs';

const bbox='35.702425,139.775431,35.716575,139.791369';
test('map bounds are numeric, ordered and limited to 40 square kilometers',()=>{
  assert.ok(mapQuery(bbox).query.includes('way["building"]'));
  for(const value of ['', 'NaN,0,1,2', '0,0,0,1', '-90,0,1,2', '0,0,1,1', '0,0,1,1);out;'])assert.throws(()=>mapQuery(value));
});
test('proxy is not an open query/URL relay',async()=>{
  let called=false;
  for(const url of ['http://example.test/api/map-data?bbox=bad','http://example.test/api/map-data?bbox='+bbox+'&service=https://unknown.test']){
    const reply=await mapData(new Request(url),()=>{called=true;});assert.equal(reply.status,400);
  }
  assert.equal(called,false);
});
test('map proxy identifies the application and never forwards visitor credentials',async()=>{
  const request=new Request('http://example.test/api/map-data?bbox='+bbox,{headers:{Cookie:'private',Authorization:'Bearer private'}});
  const reply=await mapData(request,async(url,options)=>{
    assert.ok(url.startsWith(MAP_SERVICES.coffee));
    assert.ok(options.headers['User-Agent'].includes('CityWalkPrototype'));
    assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);
    return Response.json({elements:[{id:1,type:'way'}]});
  });
  assert.equal(reply.status,200);assert.equal(reply.headers.get('X-Map-Source'),MAP_SERVICES.coffee);
  assert.equal((await reply.json()).elements[0].id,1);
});
test('upstream failure and XML/HTML are not passed off as map JSON',async()=>{
  const req=()=>new Request('http://example.test/api/map-data?bbox='+bbox);
  let reply=await mapData(req(),async()=>new Response('Too many requests',{status:429}));
  assert.equal(reply.status,429);assert.equal(reply.headers.get('Cache-Control'),'no-store');
  reply=await mapData(req(),async()=>new Response('<html>Error</html>',{headers:{'Content-Type':'text/html'}}));
  assert.equal(reply.status,502);assert.ok((await reply.json()).error.includes('错误页面'));
});
