import test from 'node:test';
import assert from 'node:assert/strict';
import {CalculationClock,durationText} from '../public/progress-estimate.js';

test('unknown loading/network time is never turned into a false countdown',()=>{
  const clock=new CalculationClock(0);
  assert.equal(clock.read(1000).remainingMs,null);
  clock.observe({stage:'fetch'},2000);
  assert.equal(clock.read(60000).remainingMs,null);
  assert.equal(clock.read(60000).elapsedMs,60000);
});
test('ETA learns from completed candidate pace and updates on new measurements',()=>{
  const clock=new CalculationClock(0);clock.beginCompute(1000);
  clock.observe({stage:'visibility',completed:1,total:21},3000);
  assert.equal(clock.read(3000).remainingMs,null);
  clock.observe({stage:'visibility',completed:3,total:21},4000);
  assert.equal(clock.read(4000).remainingMs,9000);
  assert.equal(clock.read(5000).remainingMs,8000);
  clock.observe({stage:'visibility',completed:5,total:21},4500);
  assert.equal(clock.read(4500).remainingMs,6000);
  assert.equal(clock.read(12000).remainingMs,0);
});
test('past compute timings exclude data loading and remain explicitly approximate',()=>{
  const clock=new CalculationClock(0);clock.beginCompute(20000,10000);
  assert.equal(clock.read(23000).remainingMs,7000);
  assert.equal(clock.read(23000).elapsedMs,23000);
  assert.equal(clock.read(23000).source,'history');
  assert.equal(durationText(61000),'1 分 1 秒');assert.equal(durationText(1),'1 秒');
});
