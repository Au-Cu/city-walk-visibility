import {buildDataset,planRoute,visibilityPolygon,snapPoint} from './engine.js';
let dataset=null;
self.onmessage=async event=>{
  const {id,kind}=event.data;
  try{
    if(kind==='load'){
      dataset=buildDataset(event.data.raw,event.data.metadata);
      self.postMessage({id,kind:'loaded',stats:dataset.stats,metadata:dataset.metadata,roads:dataset.roads,buildings:dataset.buildings.map(b=>b.rings.map(r=>r.map(p=>dataset.unproject(p.x,p.y))))});
    }else if(kind==='plan'){
      if(!dataset)throw new Error('请先加载地图数据。');
      const result=await planRoute(dataset,event.data.input,progress=>self.postMessage({id,kind:'progress',...progress}));
      self.postMessage({id,kind:'planned',result});
    }else if(kind==='view'){
      const {sample,options}=event.data,p=dataset.project(...sample.coordinates),polygon=visibilityPolygon(dataset,p,sample.heading,options).map(p=>dataset.unproject(p.x,p.y));
      self.postMessage({id,kind:'viewed',polygon});
    }else if(kind==='snap'){
      self.postMessage({id,kind:'snapped',snap:snapPoint(dataset,event.data.point)});
    }
  }catch(error){self.postMessage({id,kind:'error',message:error.message});}
};
