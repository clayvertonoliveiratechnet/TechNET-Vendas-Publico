import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual shell functions without a browser or production account.
const source = readFileSync(new URL('../consultivo-app.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').split("init().catch")[0];
const storage = new Map();
let positions = [], requests = [];
const sb = { from(table) {
  let rangeStart=0,rangeEnd=999;
  const query = { select() { return this; }, eq(key, value) { requests.push([table, key, value]); return this; },
    gte() { return this; }, lt() { return this; }, order() { return this; }, range(start,end) { rangeStart=start;rangeEnd=end;return this; },
    limit() { return this; }, then(resolve) { resolve({ data: positions.slice(rangeStart,rangeEnd+1), error: null }); } };
  return query;
} };
const context = vm.createContext({ console, Date, Map, Set, Number, JSON, Math, URLSearchParams,
  createClient: () => sb, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: { addEventListener() {} }, setInterval: () => 1, clearInterval() {},
});
vm.runInContext(source, context);
vm.runInContext("session={user:{id:'consultant-a'}};profile={role:'consultant'}", context);
positions = [{ latitude: -5.79, longitude: -35.21, accuracy: 8, recorded_at: new Date().toISOString() }];
await vm.runInContext('loadServerTracking()', context);
assert.equal(vm.runInContext('currentPosition.lat', context), -5.79);
assert.equal(vm.runInContext('getRoute().length', context), 1);
assert(requests.some(([table, key, value]) => table === 'tv_consultivo_positions' && key === 'user_id' && value === 'consultant-a'));
assert.equal(vm.runInContext('geoStatus', context), 'active');

positions = Array.from({length:2001},(_,i)=>({latitude:-5.79,longitude:-35.21,
  recorded_at:new Date(Date.now()-((2001-i)*1000)).toISOString()}));
await vm.runInContext('loadServerTracking()', context);
assert.equal(vm.runInContext('getRoute().length', context),2001,'the full server route must survive pagination and the local cache cap');

// A successful request with no route must remove points from a prior account.
positions = [];
await vm.runInContext('loadServerTracking()', context);
assert.equal(vm.runInContext('getRoute().length', context), 0);
assert.equal(vm.runInContext('currentPosition', context), null);

context.window.TechNETNativeTracking = { configure() {}, snapshot: () => JSON.stringify({
  configured: true, paused: false, last_position: { latitude: -5.79, longitude: -35.21,
    accuracy: 8, recorded_at: new Date(Date.now() - 10 * 60_000).toISOString() },
}) };
vm.runInContext('syncNativeTrackingSnapshot()', context);
assert.equal(vm.runInContext('geoStatus', context), 'error', 'an old GPS fix must not be shown as active');
context.window.TechNETNativeTracking.snapshot = () => JSON.stringify({ configured: true, paused: false,
  location_permission: false, last_position: null });
vm.runInContext('syncNativeTrackingSnapshot()', context);
assert.equal(vm.runInContext('geoStatus', context), 'denied');
console.log('CONSULTIVO_TRACKING_RUNTIME_OK');
