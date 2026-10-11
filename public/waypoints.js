export const MAX_WAYPOINTS=8;

export function parseCoordinate(text,label='点位'){
  const numbers=String(text).trim().split(/[,，\s]+/).filter(Boolean).map(Number);
  if(numbers.length!==2||numbers.some(n=>!Number.isFinite(n))||Math.abs(numbers[0])>85||Math.abs(numbers[1])>180)throw new Error(label+'请输入有效的“纬度, 经度”，或使用地图选点。');
  return {lat:numbers[0],lon:numbers[1]};
}

export function validateRoutePoints(points){
  if(!Array.isArray(points)||points.length<2||points.length>MAX_WAYPOINTS+2)throw new Error(`请设置起点、终点及最多 ${MAX_WAYPOINTS} 个途经点。`);
  for(const point of points)if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>85||Math.abs(point.lon)>180)throw new Error('路线点位坐标无效。');
  return points;
}
