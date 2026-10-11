// Public geographic data only. No user cookies, tokens, or arbitrary queries are forwarded.
export const MAP_SERVICES={coffee:'https://overpass.private.coffee/api/interpreter',vk:'https://maps.mail.ru/osm/tools/overpass/api/interpreter'};
const fail=(message,status=502)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export function mapQuery(bbox){
  const numbers=bbox?.split(',').map(Number);
  if(!numbers||numbers.length!==4||numbers.some(n=>!Number.isFinite(n)))throw new Error('地图边界格式无效。');
  const [south,west,north,east]=numbers;
  if(south>=north||west>=east||south< -85||north>85||west< -180||east>180)throw new Error('地图边界范围无效。');
  const area=(north-south)*111195*(east-west)*111195*Math.cos((north+south)/2*Math.PI/180);
  if(area>40000000)throw new Error('第一版单次最多获取 40 平方公里，请缩小选点范围。');
  const canonical=numbers.map(n=>n.toFixed(6)).join(',');
  return {canonical,query:`[out:json][timeout:50][maxsize:134217728];(way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$"](${canonical});way["building"](${canonical});relation["building"]["type"="multipolygon"](${canonical}););out body;>;out skel qt;`};
}

export async function mapData(request,fetcher=fetch){
  if(request.method!=='GET')return fail('只支持读取地图。',405);
  const url=new URL(request.url);let query,canonical;
  try{({query,canonical}=mapQuery(url.searchParams.get('bbox')));}catch(error){return fail(error.message,400);}
  const service=url.searchParams.get('service')||'coffee';
  if(!Object.hasOwn(MAP_SERVICES,service))return fail('未知地图服务。',400);
  const endpoint=MAP_SERVICES[service];
  const cacheKey=new Request(url.origin+'/api/map-data?'+new URLSearchParams({bbox:canonical,service}));
  const cache=globalThis.caches?.default;
  if(cache){const hit=await cache.match(cacheKey);if(hit)return hit;}
  try{
    const upstream=await fetcher(endpoint+'?'+new URLSearchParams({data:query}),{
      headers:{'User-Agent':`CityWalkPrototype/0.1 (+${url.origin}; bounded urban visibility research)`,'Accept':'application/json'},
      signal:AbortSignal.timeout(65000)
    });
    if(!upstream.ok)return fail(`地图服务 ${service} 暂不可用（HTTP ${upstream.status}），请稍后重试。`,upstream.status===429?429:502);
    if(!upstream.headers.get('content-type')?.includes('json'))return fail('地图服务返回了错误页面，未得到有效地图数据。');
    const response=new Response(upstream.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Map-Source':endpoint}});
    // An individual query is cached only after a complete valid HTTP response.
    // Browser IndexedDB additionally caches parsed/validated regions.
    if(cache)await cache.put(cacheKey,response.clone());
    return response;
  }catch(error){return fail(error.name==='TimeoutError'?'地图服务响应超时。请缩小区域或稍后重试。':'地图服务连接失败，请切换服务或稍后重试。');}
}
