// Manual, bounded extraction. Never used by the deployed site's runtime.
import fs from 'node:fs/promises';
import {CITIES,cityById} from '../public/cities.js';
import {normalizeMapData} from '../public/regions.js';
import {mapQuery,MAP_SERVICES} from '../server/data-proxy.mjs';
const args=process.argv.slice(2),id=args[0],city=cityById(id);
if(!city?.snapshot)throw new Error('请选择带示例区域的城市：'+CITIES.filter(c=>c.snapshot).map(c=>c.id).join(', '));
const index=args.indexOf('--endpoint'),endpoint=index>=0?args[index+1]:MAP_SERVICES.coffee;
const url=new URL(endpoint);
if(url.protocol!=='https:'||url.username||url.password)throw new Error('需要无凭证的 HTTPS 数据端点。');
if(url.hostname==='overpass-api.de'&&!args.includes('--one-off'))throw new Error('主服务仅限明确的一次性提取：加 --one-off；禁止用作本站运行时后端。');
const {bounds}=city,{query:boundedQuery}=mapQuery([bounds.south,bounds.west,bounds.north,bounds.east].join(','));
const query=boundedQuery.replace('[timeout:50]','[timeout:90]');
console.log('一次性获取 '+city.name+' / '+city.district+' 的真实道路和建筑');
let response;
for(let attempt=0;attempt<2;attempt++){
  try{response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query}),headers:{'User-Agent':'CityWalkVisibility/0.2 (+https://github.com/Au-Cu/city-walk-visibility; manual bounded extraction)'},signal:AbortSignal.timeout(115000)});
    if(response.status!==429&&response.status!==504)break;
  }catch(error){if(attempt===1)throw error;}
  if(attempt===0){console.log('服务限流或超时；等待 45 秒后仅重试一次。');await new Promise(resolve=>setTimeout(resolve,45000));}
}
if(!response)throw new Error('数据服务不可用');
if(!response.ok)throw new Error('HTTP '+response.status);
const raw=normalizeMapData(await response.json(),{bounds,title:city.name+' · '+city.district,cityId:city.id,source:endpoint,fetchedAt:new Date().toISOString()});
await fs.writeFile(new URL('../public/data/'+city.snapshot,import.meta.url),JSON.stringify(raw));
console.log(JSON.stringify({city:id,elements:raw.elements.length,timestamp:raw.osm3s?.timestamp_osm_base,bytes:Buffer.byteLength(JSON.stringify(raw))}));
