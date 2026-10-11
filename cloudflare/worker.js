import {mapData} from '../server/data-proxy.mjs';
// Best-effort isolate-local protection; no paid storage is provisioned.
const visitors=new Map();
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/map-data'){
      const origin=request.headers.get('Origin');
      if(origin&&origin!==url.origin)return Response.json({error:'地图接口仅供本站使用。'},{status:403});
      const ip=request.headers.get('CF-Connecting-IP')||'local',now=Date.now(),previous=visitors.get(ip),record=previous&&now-previous.start<60000?previous:{start:now,count:0};
      if(++record.count>6)return Response.json({error:'地图请求过于频繁，请一分钟后重试。'},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
      if(visitors.size>10000)visitors.clear();visitors.set(ip,record);
      return mapData(request,fetch,{endpoint:env.OVERPASS_ENDPOINT,apiKey:env.OVERPASS_API_KEY,waitUntil:p=>ctx.waitUntil(p)});
    }
    if(url.pathname==='/api/health')return Response.json({ok:true,application:'city-walk-visibility',configuredDataBackend:Boolean(env.OVERPASS_ENDPOINT)});
    if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.ASSETS.fetch(request);
  }
};
