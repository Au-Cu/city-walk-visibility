import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('CityWalker is the consistent visible brand and metadata title',async()=>{
  const read=file=>fs.readFile(new URL('../'+file,import.meta.url),'utf8');
  const html=await read('public/index.html');
  assert.match(html,/<title>CityWalker<\/title>/);
  assert.match(html,/aria-label="CityWalker 首页"/);
  for(const key of ['application-name','og:title','og:site_name','twitter:title'])assert.ok(html.includes(`="${key}" content="CityWalker"`));
  for(const file of ['public/index.html','app/layout.tsx','README.md'])assert.doesNotMatch(await read(file),/城市漫步|CITY WALK \/ WORLD|CityWalkPrototype|CityWalkVisibility/);
  assert.match(await read('public/favicon.svg'),/<title>CityWalker<\/title>/);
  assert.ok((await read('public/app.js')).includes("a.download='CityWalker-route.geojson'"));
  assert.match(await read('README.md'),/^# CityWalker\r?\n/);
  const pkg=JSON.parse(await read('package.json')),lock=JSON.parse(await read('package-lock.json'));
  assert.equal(pkg.name,'citywalker');assert.equal(lock.name,pkg.name);assert.equal(lock.packages[''].name,pkg.name);
});
