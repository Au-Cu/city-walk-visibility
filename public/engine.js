// Real OSM road graph + bounded, sampled two-dimensional visibility coverage.
const EARTH = 6371008.8;
const RAD = Math.PI / 180;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function projectionBacktracking(points, angle = 0) {
  if (points.length < 2) return 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  let one = 0, two = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x, dy = points[i].y - points[i-1].y;
    one += Math.abs(dx*c + dy*s); two += Math.abs(-dx*s + dy*c);
  }
  const dx = points.at(-1).x-points[0].x, dy = points.at(-1).y-points[0].y;
  return Math.max(0, (one + two - Math.abs(dx*c+dy*s) - Math.abs(-dx*s+dy*c))/2);
}
export function pointInRing(p, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function pointInBuilding(p, rings) { return pointInRing(p,rings[0]) && !rings.slice(1).some(r=>pointInRing(p,r)); }
export function raySegment(p, dx, dy, segment) {
  const [ax,ay,bx,by]=segment,sx=bx-ax,sy=by-ay,den=dx*sy-dy*sx;
  if(Math.abs(den)<1e-10)return Infinity;
  const qx=ax-p.x,qy=ay-p.y,t=(qx*sy-qy*sx)/den,u=(qx*dy-qy*dx)/den;
  return t>=0.00001&&u>=-1e-9&&u<=1+1e-9?t:Infinity;
}
class Heap {
  constructor(){this.items=[];}
  push(value){const a=this.items;let i=a.length;a.push(value);while(i){const p=(i-1)>>1;if(a[p][0]<=value[0])break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return first;}
  get length(){return this.items.length;}
}
function bboxOf(rings){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const ring of rings)for(const p of ring){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}return {minX,minY,maxX,maxY};}
function intersects(a,b){return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;}
function stitch(parts){
  const pending=parts.map(p=>p.slice()),rings=[];
  while(pending.length){let ring=pending.pop(),changed=true;while(ring[0]!==ring.at(-1)&&changed){changed=false;for(let i=0;i<pending.length;i++){const p=pending[i];if(ring.at(-1)===p[0])ring.push(...p.slice(1));else if(ring.at(-1)===p.at(-1))ring.push(...p.slice(0,-1).reverse());else if(ring[0]===p.at(-1))ring.unshift(...p.slice(0,-1));else if(ring[0]===p[0])ring.unshift(...p.slice(1).reverse());else continue;pending.splice(i,1);changed=true;break;}}if(ring.length>=4&&ring[0]===ring.at(-1))rings.push(ring);}
  return rings;
}
export function buildDataset(raw, suppliedMetadata) {
  const metadata=suppliedMetadata||raw.metadata;
  if(!metadata?.bounds)throw new Error('地图数据缺少边界信息。');
  const bounds=metadata.bounds,lat0=(bounds.south+bounds.north)/2,lon0=(bounds.west+bounds.east)/2,scaleX=EARTH*RAD*Math.cos(lat0*RAD),scaleY=EARTH*RAD;
  const project=(lat,lon)=>({x:(lon-lon0)*scaleX,y:(lat-lat0)*scaleY});
  const unproject=(x,y)=>[lat0+y/scaleY,lon0+x/scaleX];
  const sw=project(bounds.south,bounds.west),ne=project(bounds.north,bounds.east),extent={minX:sw.x,minY:sw.y,maxX:ne.x,maxY:ne.y};
  const osmNodes=new Map(),ways=new Map(),relations=[];
  for(const e of raw.elements||[]){if(e.type==='node')osmNodes.set(e.id,e);if(e.type==='way'){const prev=ways.get(e.id);if(!prev||e.tags||!prev.tags)ways.set(e.id,e);}if(e.type==='relation')relations.push(e);}
  const nodes=[],nodeMap=new Map(),adj=[],reverse=[],edges=[],roads=[],physical=new Map();
  const indexFor=id=>{if(nodeMap.has(id))return nodeMap.get(id);const n=osmNodes.get(id);if(!n)return -1;const p=project(n.lat,n.lon),i=nodes.length;nodes.push({...p,lat:n.lat,lon:n.lon,osmId:id});nodeMap.set(id,i);adj.push([]);reverse.push([]);return i;};
  const inBounds=n=>n.lat>=bounds.south&&n.lat<=bounds.north&&n.lon>=bounds.west&&n.lon<=bounds.east;
  let axisC=0,axisS=0,totalLength=0,skippedRoads=0;
  for(const way of ways.values()){
    const t=way.tags||{};if(!t.highway)continue;
    const explicitFoot=['yes','designated','permissive'].includes(t.foot);
    if(/^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$/.test(t.highway)||['no','private'].includes(t.foot)||(!explicitFoot&&['private','no','customers'].includes(t.access))||t.indoor==='yes'||t.area==='yes'){skippedRoads++;continue;}
    const refs=way.nodes||[];let road=[];const roadParts=[];
    for(let k=1;k<refs.length;k++){
      const oa=osmNodes.get(refs[k-1]),ob=osmNodes.get(refs[k]);if(!oa||!ob||!inBounds(oa)||!inBounds(ob)){if(road.length>1)roadParts.push(road);road=[];continue;}
      const a=indexFor(oa.id),b=indexFor(ob.id),length=distance(nodes[a],nodes[b]);if(length<.02)continue;
      const physicalKey=oa.id<ob.id?oa.id+':'+ob.id:ob.id+':'+oa.id;
      let physicalId=physical.get(physicalKey);if(physicalId===undefined){physicalId=physical.size;physical.set(physicalKey,physicalId);}
      const add=(from,to)=>{const id=edges.length,e={id,from,to,length,physicalId,wayId:way.id,highway:t.highway,heading:Math.atan2(nodes[to].y-nodes[from].y,nodes[to].x-nodes[from].x)};edges.push(e);adj[from].push(id);reverse[to].push(id);};
      if(t['oneway:foot']!=='-1')add(a,b);if(!['yes','1','true'].includes(t['oneway:foot']))add(b,a);
      if(!road.length)road.push([oa.lat,oa.lon]);road.push([ob.lat,ob.lon]);
      if(!['footway','path','steps'].includes(t.highway)){const h=Math.atan2(nodes[b].y-nodes[a].y,nodes[b].x-nodes[a].x);axisC+=length*Math.cos(4*h);axisS+=length*Math.sin(4*h);totalLength+=length;}
    }
    if(road.length>1)roadParts.push(road);for(const points of roadParts)roads.push({id:way.id,name:t['name:zh']||t['name:en']||t.name||'',points,highway:t.highway});
  }
  const buildings=[],consumed=new Set();let malformedBuildings=0;
  const ringFor=refs=>{const ring=refs.map(id=>osmNodes.get(id)).filter(Boolean);return ring.length===refs.length?ring.map(n=>project(n.lat,n.lon)):null;};
  for(const rel of relations){
    if(!rel.tags?.building||rel.tags.type!=='multipolygon')continue;
    const members=rel.members||[],outerRefs=stitch(members.filter(m=>m.type==='way'&&m.role!=='inner').map(m=>ways.get(m.ref)?.nodes).filter(Boolean)),innerRefs=stitch(members.filter(m=>m.type==='way'&&m.role==='inner').map(m=>ways.get(m.ref)?.nodes).filter(Boolean));
    const outer=outerRefs.map(ringFor).filter(Boolean),inner=innerRefs.map(ringFor).filter(Boolean);
    for(const shell of outer){const rings=[shell,...inner.filter(r=>pointInRing(r[0],shell))],box=bboxOf(rings);if(intersects(box,extent))buildings.push({id:'r'+rel.id,rings,box});}
    if(outer.length){for(const m of members)if(m.type==='way')consumed.add(m.ref);}else malformedBuildings++;
  }
  for(const way of ways.values()){
    if(!way.tags?.building||consumed.has(way.id))continue;
    const refs=way.nodes||[];if(refs.length<4||refs[0]!==refs.at(-1)){malformedBuildings++;continue;}
    const ring=ringFor(refs);if(!ring){malformedBuildings++;continue;}const box=bboxOf([ring]);if(intersects(box,extent))buildings.push({id:'w'+way.id,rings:[ring],box});
  }
  if(!edges.length)throw new Error('这个区域没有可用的步行路网。');
  const segmentGrid=new Map(),buildingGrid=new Map(),segments=[],gridSize=48;
  // Imported ways can extend far beyond the requested region. Index only the
  // local extent plus maximum sight radius, never an unbounded remote polygon.
  const addGrid=(grid,box,id)=>{const minX=Math.max(box.minX,extent.minX-300),maxX=Math.min(box.maxX,extent.maxX+300),minY=Math.max(box.minY,extent.minY-300),maxY=Math.min(box.maxY,extent.maxY+300);for(let gx=Math.floor(minX/gridSize);gx<=Math.floor(maxX/gridSize);gx++)for(let gy=Math.floor(minY/gridSize);gy<=Math.floor(maxY/gridSize);gy++){const key=gx+':'+gy;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}};
  buildings.forEach((b,index)=>{addGrid(buildingGrid,b.box,index);for(const ring of b.rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i];if(distance(a,c)<.001)continue;const id=segments.length;segments.push([a.x,a.y,c.x,c.y]);addGrid(segmentGrid,{minX:Math.min(a.x,c.x),maxX:Math.max(a.x,c.x),minY:Math.min(a.y,c.y),maxY:Math.max(a.y,c.y)},id);}});
  const axisAngle=totalLength&&Math.hypot(axisC,axisS)/totalLength>.15?Math.atan2(axisS,axisC)/4:0;
  return {metadata:{...metadata,timestamp:raw.osm3s?.timestamp_osm_base||metadata.fetchedAt},project,unproject,extent,nodes,adj,reverse,edges,roads,buildings,segments,segmentGrid,buildingGrid,gridSize,axisAngle,segmentMarks:new Uint32Array(segments.length),epoch:0,stats:{nodes:nodes.length,directedEdges:edges.length,roadWays:new Set(roads.map(r=>r.id)).size,buildings:buildings.length,malformedBuildings,skippedRoads}};
}
export function shortestPath(data,start,end,weight=null,all=false,backwards=false){
  const costs=new Float64Array(data.nodes.length);costs.fill(Infinity);const previous=new Int32Array(data.nodes.length);previous.fill(-1);const heap=new Heap();costs[start]=0;heap.push([0,start]);
  while(heap.length){const [cost,u]=heap.pop();if(cost!==costs[u])continue;if(!all&&u===end)break;for(const id of (backwards?data.reverse[u]:data.adj[u])){const e=data.edges[id],v=backwards?e.from:e.to,newCost=cost+(weight?weight(e):e.length);if(newCost<costs[v]){costs[v]=newCost;previous[v]=id;heap.push([newCost,v]);}}}
  if(all)return {costs,previous,backwards};if(!Number.isFinite(costs[end]))return null;
  const edgeIds=[];let at=end;while(at!==start){const id=previous[at];if(id<0)return null;edgeIds.push(id);at=data.edges[id].from;}edgeIds.reverse();return makeLeg(data,start,edgeIds);
}
function makeLeg(data,start,edgeIds){const nodeIds=[start];let length=0;for(const id of edgeIds){const e=data.edges[id];nodeIds.push(e.to);length+=e.length;}return {edgeIds,nodeIds,length,backtracking:projectionBacktracking(nodeIds.map(id=>data.nodes[id]),data.axisAngle)};}
function fromTrees(data,start,end,middle,forward,backward){
  const a=[],b=[];let at=middle,count=0;while(at!==start&&count++<data.nodes.length){const id=forward.previous[at];if(id<0)return null;a.push(id);at=data.edges[id].from;}a.reverse();at=middle;count=0;while(at!==end&&count++<data.nodes.length){const id=backward.previous[at];if(id<0)return null;b.push(id);at=data.edges[id].to;}return makeLeg(data,start,[...a,...b]);
}
export function repeatedLength(data,edgeIds){const seen=new Set();let result=0;for(const id of edgeIds){const e=data.edges[id];if(seen.has(e.physicalId))result+=e.length;seen.add(e.physicalId);}return result;}
function hash(n,seed){let x=(n+1)*2654435761^(seed+1)*1597334677;x=Math.imul(x^(x>>>16),2246822507);return (x>>>0)/4294967296;}
function nearbySegments(data,p,radius){const ids=new Set(),size=data.gridSize;for(let x=Math.floor((p.x-radius)/size);x<=Math.floor((p.x+radius)/size);x++)for(let y=Math.floor((p.y-radius)/size);y<=Math.floor((p.y+radius)/size);y++)for(const id of data.segmentGrid.get(x+':'+y)||[])ids.add(id);return [...ids];}
function rayCast(data,p,angle,radius){
  const dx=Math.cos(angle),dy=Math.sin(angle),size=data.gridSize;let gx=Math.floor(p.x/size),gy=Math.floor(p.y/size),nextX=Math.abs(dx)<1e-12?Infinity:((dx>0?(gx+1)*size:gx*size)-p.x)/dx,nextY=Math.abs(dy)<1e-12?Infinity:((dy>0?(gy+1)*size:gy*size)-p.y)/dy;
  const stepX=dx>0?1:-1,stepY=dy>0?1:-1,deltaX=Math.abs(size/dx),deltaY=Math.abs(size/dy);let best=radius,walked=0;
  data.epoch++;if(data.epoch>=0xfffffffe){data.segmentMarks.fill(0);data.epoch=1;}const epoch=data.epoch;
  while(walked<=best){for(const id of data.segmentGrid.get(gx+':'+gy)||[]){if(data.segmentMarks[id]===epoch)continue;data.segmentMarks[id]=epoch;best=Math.min(best,raySegment(p,dx,dy,data.segments[id]));}const exit=Math.min(nextX,nextY);if(best<=exit+1e-7)break;if(nextX<nextY){walked=nextX;nextX+=deltaX;gx+=stepX;}else{walked=nextY;nextY+=deltaY;gy+=stepY;}}
  return {x:p.x+dx*best,y:p.y+dy*best};
}
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function visibilityPolygon(data,p,heading,options){
  const radius=options.radius,fov=options.fov*RAD,full=options.fov===360;if(full)heading=0;
  const ids=data.buildingGrid.get(Math.floor(p.x/data.gridSize)+':'+Math.floor(p.y/data.gridSize))||[];
  if(ids.some(id=>pointInBuilding(p,data.buildings[id].rings)))return [];
  const half=fov/2,angles=[-half,half],steps=Math.ceil(options.fov/6);
  for(let i=1;i<steps;i++)angles.push(-half+fov*i/steps);
  for(const id of nearbySegments(data,p,radius)){const seg=data.segments[id];for(const q of [[seg[0],seg[1]],[seg[2],seg[3]]]){if(Math.hypot(q[0]-p.x,q[1]-p.y)>radius+1)continue;const a=wrap(Math.atan2(q[1]-p.y,q[0]-p.x)-heading);for(const d of [-.000001,0,.000001])if(a+d>=-half&&a+d<=half)angles.push(a+d);}}
  angles.sort((a,b)=>a-b);const unique=angles.filter((a,i)=>i===0||a-angles[i-1]>1e-8),poly=full?[]:[p];for(const a of unique)poly.push(rayCast(data,p,heading+a,radius));return poly;
}
function polygonArea(poly){let sum=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)sum+=poly[j].x*poly[i].y-poly[i].x*poly[j].y;return Math.abs(sum)/2;}
function bitCount(mask){let sum=0;for(let v of mask){v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);sum+=(((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}return sum;}
function unionInto(target,source){for(let i=0;i<target.length;i++)target[i]|=source[i];}
function scanPolygon(poly,grid,apply){
  if(poly.length<3)return;const minY=Math.max(0,Math.floor((Math.min(...poly.map(p=>p.y))-grid.minY)/grid.cell)),maxY=Math.min(grid.rows-1,Math.floor((Math.max(...poly.map(p=>p.y))-grid.minY)/grid.cell));
  for(let row=minY;row<=maxY;row++){const y=grid.minY+(row+.5)*grid.cell,hits=[];for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a.y>y)!==(b.y>y))hits.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));}hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2){const first=Math.max(0,Math.ceil((hits[i]-grid.minX)/grid.cell-.5)),last=Math.min(grid.cols-1,Math.floor((hits[i+1]-grid.minX)/grid.cell-.5));for(let col=first;col<=last;col++)apply(row*grid.cols+col);}}
}
function createCoverageGrid(data,routes,options){
  const radius=options.radius;let routeMinX=Infinity,routeMinY=Infinity,routeMaxX=-Infinity,routeMaxY=-Infinity;
  for(const route of routes)for(const leg of route.legs)for(const id of leg.nodeIds){const p=data.nodes[id];routeMinX=Math.min(routeMinX,p.x);routeMinY=Math.min(routeMinY,p.y);routeMaxX=Math.max(routeMaxX,p.x);routeMaxY=Math.max(routeMaxY,p.y);}
  let minX=Math.max(data.extent.minX,routeMinX-radius),maxX=Math.min(data.extent.maxX,routeMaxX+radius),minY=Math.max(data.extent.minY,routeMinY-radius),maxY=Math.min(data.extent.maxY,routeMaxY+radius);
  const cell=Math.max(options.quality==='fine'?10:15,Math.ceil(Math.sqrt((maxX-minX)*(maxY-minY)/160000)));
  minX=Math.floor(minX/cell)*cell;minY=Math.floor(minY/cell)*cell;const cols=Math.ceil((maxX-minX)/cell),rows=Math.ceil((maxY-minY)/cell),words=Math.ceil(cols*rows/32),occupied=new Uint32Array(words),grid={minX,minY,cols,rows,cell,words};
  for(const b of data.buildings){if(!intersects(b.box,{minX,minY,maxX,maxY}))continue;const local=new Set();scanPolygon(b.rings[0],grid,i=>local.add(i));for(const hole of b.rings.slice(1))scanPolygon(hole,grid,i=>local.delete(i));for(const i of local)occupied[i>>>5]|=1<<(i&31);}
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const x=minX+(col+.5)*cell,y=minY+(row+.5)*cell;if(x<data.extent.minX||x>data.extent.maxX||y<data.extent.minY||y>data.extent.maxY){const i=row*cols+col;occupied[i>>>5]|=1<<(i&31);}}
  return {...grid,occupied};
}
function sampleRoute(data,route,step){
  const samples=[];let walked=0,next=0;
  for(const leg of route.legs){for(let k=0;k<leg.edgeIds.length;k++){const edge=data.edges[leg.edgeIds[k]],a=data.nodes[edge.from],b=data.nodes[edge.to];while(next<=walked+edge.length+1e-7){const t=clamp((next-walked)/edge.length,0,1);samples.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:edge.heading,distance:next});next+=step;}if(k>0){const prev=data.edges[leg.edgeIds[k-1]];if(Math.abs(wrap(edge.heading-prev.heading))>.30)samples.push({x:a.x,y:a.y,heading:edge.heading,distance:walked});}walked+=edge.length;}}
  const last=data.edges[route.legs.at(-1).edgeIds.at(-1)];if(last){const n=data.nodes[last.to];samples.push({x:n.x,y:n.y,heading:last.heading,distance:walked});}samples.sort((a,b)=>a.distance-b.distance);return samples;
}
function coverageGeoJSON(data,mask,grid){
  const rectangles=[],active=new Map();
  for(let row=0;row<grid.rows;row++){const runs=[];let first=-1;for(let col=0;col<=grid.cols;col++){const i=row*grid.cols+col,set=col<grid.cols&&(mask[i>>>5]&(1<<(i&31)));if(set&&first<0)first=col;if(!set&&first>=0){runs.push([first,col]);first=-1;}}const next=new Map();for(const [start,end] of runs){const key=start+':'+end;if(active.has(key)){const r=active.get(key);r.endRow=row+1;next.set(key,r);}else{const r={start,end,startRow:row,endRow:row+1};rectangles.push(r);next.set(key,r);}}active.clear();for(const [key,r] of next)active.set(key,r);}
  return {type:'FeatureCollection',features:rectangles.map(r=>{const x1=grid.minX+r.start*grid.cell,x2=grid.minX+r.end*grid.cell,y1=grid.minY+r.startRow*grid.cell,y2=grid.minY+r.endRow*grid.cell;const corners=[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]].map(([x,y])=>data.unproject(x,y).reverse());return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[corners]}};})};
}
function routePublic(data,route,grid){
  const nodeIds=route.legs.flatMap((l,i)=>i?l.nodeIds.slice(1):l.nodeIds),edgeIds=route.legs.flatMap(l=>l.edgeIds);
  return {length:route.length,backtracking:route.backtracking,repeated:route.repeated,area:route.area,coordinates:nodeIds.map(id=>[data.nodes[id].lat,data.nodes[id].lon]),osmNodeIds:nodeIds.map(id=>data.nodes[id].osmId),wayIds:[...new Set(edgeIds.map(id=>data.edges[id].wayId))],samples:route.samples.map(p=>({coordinates:data.unproject(p.x,p.y),heading:p.heading,distance:p.distance})),coverage:coverageGeoJSON(data,route.mask,grid)};
}
export function snapPoint(data,point){const p=data.project(point.lat,point.lon);let id=-1,best=Infinity;for(let i=0;i<data.nodes.length;i++){if(!data.adj[i].length&&!data.reverse[i].length)continue;const d=distance(p,data.nodes[i]);if(d<best){best=d;id=i;}}if(id<0||best>180)throw new Error('所选点距离已知步行道路超过 180 米，请选在街道附近，或重新加载区域。');return {id,offset:best,coordinates:[data.nodes[id].lat,data.nodes[id].lon]};}
export async function planRoute(data,input,notify=()=>{}){
  const options={detour:.25,backtrack:500,radius:120,fov:180,repeat:'none',quality:'standard',...input.options};
  if(![180,360].includes(options.fov)||options.radius<30||options.radius>300||options.detour<0||options.detour>1||options.backtrack<0)throw new Error('路线参数超出支持范围。');
  if(!data.buildings.length)throw new Error('该区域没有建筑轮廓，无法可靠计算建筑遮挡。');
  const snaps=input.points.map(p=>snapPoint(data,p));if(snaps.some((p,i)=>i&&p.id===snaps[i-1].id))throw new Error('相邻两个点吸附到了同一位置，请拉开距离。');
  notify({stage:'search',progress:10,text:'正在真实步行路网上搜索候选路线…'});
  const baselineLegs=[];for(let i=1;i<snaps.length;i++){const leg=shortestPath(data,snaps[i-1].id,snaps[i].id);if(!leg)throw new Error('所选点之间的步行路网不连通。请检查河岸、封闭区域或扩大数据范围。');baselineLegs.push(leg);}
  const baselineLength=baselineLegs.reduce((sum,l)=>sum+l.length,0),budget=baselineLength*(1+options.detour);
  const legLists=[];
  for(let phase=0;phase<baselineLegs.length;phase++){
    const baseline=baselineLegs[phase],start=snaps[phase].id,end=snaps[phase+1].id,maxLength=budget-baselineLength+baseline.length,seen=new Set(),list=[];
    const add=leg=>{if(!leg||leg.length>maxLength+.001)return;const key=leg.edgeIds.join(',');if(seen.has(key))return;seen.add(key);list.push(leg);};add(baseline);
    const forward=shortestPath(data,start,end,null,true),backward=shortestPath(data,end,start,null,true,true),bins=new Map();
    for(let i=0;i<data.nodes.length;i++){const extra=forward.costs[i]+backward.costs[i]-baseline.length;if(!Number.isFinite(extra)||extra>maxLength-baseline.length+.001||data.adj[i].length<2)continue;const n=data.nodes[i];if(n.x-options.radius<data.extent.minX||n.x+options.radius>data.extent.maxX||n.y-options.radius<data.extent.minY||n.y+options.radius>data.extent.maxY)continue;const key=Math.floor(n.x/110)+':'+Math.floor(n.y/110),quality=extra+distance(n,{x:(Math.floor(n.x/110)+.5)*110,y:(Math.floor(n.y/110)+.5)*110})*.7;if(!bins.has(key)||quality<bins.get(key).quality)bins.set(key,{id:i,quality});}
    const choices=[...bins.values()].sort((a,b)=>a.quality-b.quality).slice(0,100);
    for(const choice of choices){choice.openness=polygonArea(visibilityPolygon(data,data.nodes[choice.id],0,{...options,fov:360}));}
    choices.sort((a,b)=>b.openness-a.openness);
    for(const choice of choices.slice(0,options.quality==='fine'?44:28))add(fromTrees(data,start,end,choice.id,forward,backward));
    const use=new Map();for(const id of baseline.edgeIds)use.set(data.edges[id].physicalId,1);
    for(let seed=0;seed<12;seed++){
      const leg=shortestPath(data,start,end,e=>e.length*(1+(use.get(e.physicalId)||0)*(.12+seed*.025))*(.75+.65*hash(e.physicalId,seed)));add(leg);if(leg)for(const id of leg.edgeIds){const key=data.edges[id].physicalId;use.set(key,(use.get(key)||0)+1);}
    }
    list.sort((a,b)=>a.length-b.length);legLists.push(list.slice(0,options.quality==='fine'?36:26));
  }
  const baseline={legs:baselineLegs,length:baselineLength,backtracking:baselineLegs.reduce((s,l)=>s+l.backtracking,0),repeated:repeatedLength(data,baselineLegs.flatMap(l=>l.edgeIds))};
  const combined=[];
  const combine=(phase,legs,length,backtracking)=>{if(length>budget+.001||backtracking>options.backtrack+.001)return;if(phase===legLists.length){const edgeIds=legs.flatMap(l=>l.edgeIds),repeated=repeatedLength(data,edgeIds),limit=options.repeat==='any'?Infinity:options.repeat==='small'?length*.05:.001;if(repeated>limit)return;combined.push({legs:legs.slice(),length,backtracking,repeated});return;}for(const leg of legLists[phase]){legs.push(leg);combine(phase+1,legs,length+leg.length,backtracking+leg.backtracking);legs.pop();}};
  combine(0,[],0,0);combined.sort((a,b)=>a.length-b.length);
  if(!combined.length)throw new Error(`未找到同时满足约束的候选路线。最短参考为 ${(baselineLength/1000).toFixed(2)} 公里，投影回头 ${Math.round(baseline.backtracking)} 米、重复路段 ${Math.round(baseline.repeated)} 米。可以提高回头上限或允许少量重复。`);
  const limit=options.quality==='fine'?120:64,selected=combined.length<=limit?combined:Array.from({length:limit},(_,i)=>combined[Math.floor(i*(combined.length-1)/(limit-1))]);
  const routes=[baseline,...selected],grid=createCoverageGrid(data,routes,options),cache=new Map();let observerCount=0;
  const maskAt=sample=>{const heading=options.fov===360?0:sample.heading,key=Math.round(sample.x*5)+':'+Math.round(sample.y*5)+':'+Math.round(heading*10000);if(cache.has(key))return cache.get(key);const polygon=visibilityPolygon(data,sample,heading,options),mask=new Uint32Array(grid.words);scanPolygon(polygon,grid,i=>{if(!(grid.occupied[i>>>5]&(1<<(i&31))))mask[i>>>5]|=1<<(i&31);});cache.set(key,mask);observerCount++;return mask;};
  for(let i=0;i<routes.length;i++){const route=routes[i];route.samples=sampleRoute(data,route,options.quality==='fine'?15:28);route.mask=new Uint32Array(grid.words);for(const sample of route.samples)unionInto(route.mask,maskAt(sample));route.area=bitCount(route.mask)*grid.cell*grid.cell;if(i%2===0){notify({stage:'visibility',progress:25+Math.round(70*(i+1)/routes.length),text:`建筑遮挡与覆盖去重：${i+1} / ${routes.length} 条路线`});await new Promise(resolve=>setTimeout(resolve,0));}}
  selected.sort((a,b)=>b.area-a.area||a.backtracking-b.backtracking||a.length-b.length);const best=selected[0];
  const clipped=best.samples.some(p=>p.x-options.radius<data.extent.minX||p.x+options.radius>data.extent.maxX||p.y-options.radius<data.extent.minY||p.y+options.radius>data.extent.maxY);
  notify({stage:'done',progress:100,text:'路线计算完成'});
  return {best:routePublic(data,best,grid),baseline:routePublic(data,baseline,grid),budget,baselineLength,snaps,inputPoints:input.points,candidatesGenerated:combined.length,candidatesEvaluated:selected.length,observerCount,cellSize:grid.cell,sampleStep:options.quality==='fine'?15:28,axisDegrees:data.axisAngle/RAD,clipped,options,optimality:'best_evaluated_candidate',stats:data.stats,timestamp:data.metadata.timestamp};
}
