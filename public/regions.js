export const MAX_REGION_AREA=40000000;
export const MAX_IMPORT_BYTES=25*1024*1024;
export function regionArea(b){return (b.north-b.south)*111195*(b.east-b.west)*111195*Math.cos((b.south+b.north)/2*Math.PI/180);}
export function validateBounds(b){
  if(!b||['south','west','north','east'].some(k=>typeof b[k]!=='number'||!Number.isFinite(b[k])))throw new Error('地图边界必须包含有效的 south / west / north / east。');
  if(b.south>=b.north||b.west>=b.east||b.south< -85||b.north>85||b.west< -180||b.east>180)throw new Error('地图边界无效。当前支持纬度 ±85° 内、不跨日期变更线的局部区域。');
  if(regionArea(b)>MAX_REGION_AREA)throw new Error('单次计算区域上限为 40 平方公里；这不是整座城市大小的限制，请缩小步行选点范围。');
  return b;
}
export function regionCovers(pts,meta,radius=120){
  if(!pts.length||!meta?.bounds)return false;
  const b=meta.bounds,lat=(b.south+b.north)/2,dy=radius/111195,dx=radius/(111195*Math.cos(lat*Math.PI/180));
  return pts.every(p=>p.lat>b.south+dy&&p.lat<b.north-dy&&p.lon>b.west+dx&&p.lon<b.east-dx);
}
export function requestBounds(pts,opt,extra=1){
  if(pts.length<2)throw new Error('请先设置起点和终点。');
  const lonSpan=Math.max(...pts.map(p=>p.lon))-Math.min(...pts.map(p=>p.lon));
  if(lonSpan>180)throw new Error('当前局部模型不支持跨越日期变更线，请将路线拆成两段。');
  let length=0;for(let i=1;i<pts.length;i++){const lat=(pts[i].lat+pts[i-1].lat)/2;length+=Math.hypot((pts[i].lat-pts[i-1].lat)*111195,(pts[i].lon-pts[i-1].lon)*111195*Math.cos(lat*Math.PI/180));}
  const lat=pts.reduce((s,p)=>s+p.lat,0)/pts.length,pad=(Math.max(500,length*(.2+opt.detour*.3))+opt.radius)*extra,dy=pad/111195,dx=pad/(111195*Math.cos(lat*Math.PI/180));
  return validateBounds({south:Math.max(-85,Math.min(...pts.map(p=>p.lat))-dy),north:Math.min(85,Math.max(...pts.map(p=>p.lat))+dy),west:Math.max(-180,Math.min(...pts.map(p=>p.lon))-dx),east:Math.min(180,Math.max(...pts.map(p=>p.lon))+dx)});
}
export function normalizeMapData(raw,meta=raw?.metadata){
  if(!raw||!Array.isArray(raw.elements)||!raw.elements.length||raw.elements.length>750000)throw new Error('需要有效的 Overpass JSON，且不超过 750,000 个 OSM 元素。');
  if(raw.remark)throw new Error('数据提取未完成：'+raw.remark);
  for(const e of raw.elements)if(e.type==='node'&&(!Number.isFinite(e.lat)||!Number.isFinite(e.lon)||Math.abs(e.lat)>90||Math.abs(e.lon)>180))throw new Error('OSM 节点包含无效的地理坐标。');
  let bounds=meta?.bounds||raw.bounds;
  if(!bounds){
    let south=Infinity,west=Infinity,north=-Infinity,east=-Infinity;
    for(const e of raw.elements)if(e.type==='node'&&Number.isFinite(e.lat)&&Number.isFinite(e.lon)){south=Math.min(south,e.lat);north=Math.max(north,e.lat);west=Math.min(west,e.lon);east=Math.max(east,e.lon);}
    bounds={south,west,north,east};
  }
  validateBounds(bounds);
  if(!raw.elements.some(e=>e.type==='way'&&e.tags?.highway))throw new Error('数据没有道路标签，请导入包含道路、建筑和完整引用节点的 Overpass JSON。');
  return {...raw,metadata:{title:'导入的真实区域',source:'本地文件',fetchedAt:new Date().toISOString(),...meta,bounds,license:'ODbL 1.0',attribution:'© OpenStreetMap contributors'}};
}
