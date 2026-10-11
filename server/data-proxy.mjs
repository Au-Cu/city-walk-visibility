// Public geographic data only. No user cookies, tokens, or arbitrary queries are forwarded.
export const MAP_SERVICES={coffee:'https://overpass.private.coffee/api/interpreter',vk:'https://maps.mail.ru/osm/tools/overpass/api/interpreter'};
const fail=(message,status=502)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export function mapQuery(bbox){
  const parts=bbox?.split(',');
  if(!parts||parts.length!==4||parts.some(s=>!s.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s.trim())))throw new Error('地图边界格式无效。');
  const numbers=parts.map(Number);
  if(numbers.some(n=>!Number.isFinite(n)))throw new Error('地图边界格式无效。');
  const [south,west,north,east]=numbers;
  if(south>=north||west>=east||south< -85||north>85||west< -180||east>180)throw new Error('地图边界范围无效。');
  const area=(north-south)*111195*(east-west)*111195*Math.cos((north+south)/2*Math.PI/180);
  if(area>40000000)throw new Error('第一版单次最多获取 40 平方公里，请缩小选点范围。');
  const canonical=numbers.map(n=>n.toFixed(6)).join(',');
  return {canonical,query:`[out:json][timeout:50][maxsize:134217728];(way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$"](${canonical});way["building"](${canonical});relation["building"]["type"="multipolygon"](${canonical}););out body;>;out skel qt;`};
}

export async function mapData(request,fetcher=fetch,config={}){
  if(request.method!=='GET')return fail('只支持读取地图。',405);
  const url=new URL(request.url);let query,canonical;
  try{({query,canonical}=mapQuery(url.searchParams.get('bbox')));}catch(error){return fail(error.message,400);}
  const service=url.searchParams.get('service')||'coffee';
  if(!Object.hasOwn(MAP_SERVICES,service)&&!['auto','configured'].includes(service))return fail('未知地图服务。',400);
  let custom;
  if(config.endpoint){try{const endpoint=new URL(config.endpoint);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new Error();custom={id:'configured',endpoint:endpoint.href};}catch{return fail('专用数据后端配置无效，请管理员检查 HTTPS 端点。',503);}}
  if(service==='configured'&&!custom)return fail('还未配置专用数据后端。可导入真实 OSM JSON，或选择内置城市示例。',503);
  const targets=service==='configured'?[custom]:service==='auto'?(custom?[custom]:Object.entries(MAP_SERVICES).map(([id,endpoint])=>({id,endpoint}))):[{id:service,endpoint:MAP_SERVICES[service]}];
  const cacheKey=new Request(url.origin+'/api/map-data?'+new URLSearchParams({bbox:canonical,service,v:'2'}));
  const cache=config.cache||globalThis.caches?.default;
  if(cache){const hit=await cache.match(cacheKey);if(hit)return hit;}
  const failures=[];let rateLimited=false;
  for(const {id,endpoint} of targets){try{
    const headers={'User-Agent':`CityWalkPrototype/0.2 (+https://github.com/Au-Cu/city-walk-visibility; origin ${url.origin})`,'Accept':'application/json'};
    if(id==='configured'&&config.apiKey)headers.Authorization='Bearer '+config.apiKey;
    const upstream=await fetcher(endpoint,{method:'POST',body:new URLSearchParams({data:query}),headers,signal:AbortSignal.timeout(65000)});
    if(!upstream.ok){rateLimited||=upstream.status===429;failures.push(`${id} HTTP ${upstream.status}`);continue;}
    if(!upstream.headers.get('content-type')?.includes('json')){failures.push(id+' 返回了错误页面而非地图 JSON');continue;}
    const response=new Response(upstream.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Map-Source':id==='configured'?'configured data backend':endpoint}});
    if(cache){const caching=cache.put(cacheKey,response.clone()).catch(()=>{});if(config.waitUntil)config.waitUntil(caching);else await caching;}
    return response;
  }catch(error){failures.push(error.name==='TimeoutError'?id+' 响应超时':id+' 连接失败');}}
  return fail('地图加载失败：'+failures.join('；')+'。请用内置城区示例、导入真实 OSM JSON，或配置稳定的数据后端。',rateLimited?429:502);
}
