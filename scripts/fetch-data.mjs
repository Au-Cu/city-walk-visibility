import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bounds = { south: 35.701, west: 139.786, north: 35.723, east: 139.821 };
const box = [bounds.south, bounds.west, bounds.north, bounds.east].join(',');
const query = `[out:json][timeout:90];(way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$"](${box});way["building"](${box});relation["building"]["type"="multipolygon"](${box}););out body;>;out skel qt;`;
const endpoints = ['https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
await fs.mkdir(path.join(root, 'public/data'), { recursive: true });
await fs.mkdir(path.join(root, 'public/vendor'), { recursive: true });
let payload;
for (const endpoint of endpoints) {
  try {
    console.log('Fetching Tokyo street and building data from ' + new URL(endpoint).hostname);
    const response = await fetch(endpoint, {
      method: 'POST', body: new URLSearchParams({ data: query }),
      headers: { 'User-Agent': 'CityWalkPrototype/0.1 (local urban visibility research)' },
      signal: AbortSignal.timeout(115000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    payload = await response.json();
    if (payload.remark || !payload.elements?.length) throw new Error(payload.remark || 'No map elements');
    payload.metadata = { title: '东京浅草—隅田川—押上', bounds, fetchedAt: new Date().toISOString(), source: endpoint, license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' };
    await fs.writeFile(path.join(root, 'public/data/tokyo-asakusa.json'), JSON.stringify(payload));
    const counts = {};
    for (const e of payload.elements) counts[e.type] = (counts[e.type] || 0) + 1;
    console.log(JSON.stringify({ counts, timestamp: payload.osm3s?.timestamp_osm_base, bounds }));
    break;
  } catch (error) { console.log(new URL(endpoint).hostname + ': ' + error.message); }
}
if (!payload?.metadata) throw new Error('Could not obtain real Tokyo map data');
for (const file of ['leaflet.js', 'leaflet.css']) {
  const response = await fetch('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/' + file, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Leaflet download ' + response.status);
  await fs.writeFile(path.join(root, 'public/vendor', file), new Uint8Array(await response.arrayBuffer()));
}
const licenseResponse = await fetch('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/LICENSE');
if (!licenseResponse.ok) throw new Error('Leaflet license download failed');
await fs.writeFile(path.join(root, 'public/vendor/LEAFLET-LICENSE.txt'), await licenseResponse.text());
console.log('Real map snapshot and Leaflet assets saved.');
