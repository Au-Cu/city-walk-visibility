// Estimates stay on this browser. Network waiting is deliberately not forecast.
export class CalculationClock{
  constructor(now){this.started=now;this.stage='load';this.samples=[];this.remaining=null;this.estimateAt=now;this.computeStarted=null;this.historicalMs=null;}
  beginCompute(now,historicalMs=null){this.computeStarted=now;this.stage='search';this.samples=[];this.historicalMs=Number.isFinite(historicalMs)&&historicalMs>0?historicalMs:null;this.remaining=this.historicalMs;this.estimateAt=now;}
  observe(message,now){
    if(message.stage&&message.stage!==this.stage){this.stage=message.stage;this.samples=[];this.remaining=null;}
    if(this.stage==='visibility'&&Number.isFinite(message.completed)&&message.total>0){
      const last=this.samples.at(-1);
      if(!last||message.completed>last.completed)this.samples.push({completed:message.completed,now});
      if(this.samples.length>6)this.samples.shift();
      if(this.samples.length>=2){
        const first=this.samples[0],latest=this.samples.at(-1),pace=(latest.now-first.now)/(latest.completed-first.completed);
        this.remaining=Math.max(0,pace*(message.total-message.completed));this.estimateAt=now;
      }
    }
  }
  read(now){
    let remainingMs=null,source='unknown';
    if(this.stage!=='fetch'&&this.stage!=='load'){
      if(this.remaining!==null){remainingMs=Math.max(0,this.remaining-(now-this.estimateAt));source=this.stage==='visibility'?'live':'history';}
      else if(this.historicalMs&&this.computeStarted!==null){remainingMs=Math.max(0,this.historicalMs-(now-this.computeStarted));source='history';}
    }
    return {elapsedMs:Math.max(0,now-this.started),remainingMs,source,stage:this.stage};
  }
}

export function durationText(milliseconds){
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  return seconds>=60?`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`:`${seconds} 秒`;
}
