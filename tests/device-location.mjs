import assert from 'node:assert/strict';
import { getDevicePosition } from '../device-location.js';

let browserCalls=0;
globalThis.window={TechNETNativeTracking:{snapshot:()=>JSON.stringify({
  location_permission:true,last_position:{latitude:-5.79,longitude:-35.21,accuracy:8,recorded_at:new Date().toISOString()}
})}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(resolve){
  browserCalls++;resolve({coords:{latitude:-8,longitude:-34,accuracy:15}});
}}}});
assert.deepEqual(await getDevicePosition(),{latitude:-5.79,longitude:-35.21,accuracy:8});
assert.equal(browserCalls,0,'the APK must use its native GPS');
window.TechNETNativeTracking.snapshot=()=>JSON.stringify({location_permission:false});
await assert.rejects(getDevicePosition(),/Permita/);
window.TechNETNativeTracking.snapshot=()=>JSON.stringify({last_position:{latitude:-5.79,longitude:-35.21,recorded_at:new Date(Date.now()-600000).toISOString()}});
await assert.rejects(getDevicePosition({timeout:0}),/Aguardando/);
assert.equal(browserCalls,0,'an old native position must not fall back to the disabled WebView GPS');
delete window.TechNETNativeTracking;
assert.deepEqual(await getDevicePosition(),{latitude:-8,longitude:-34,accuracy:15});
assert.equal(browserCalls,1);
console.log('DEVICE_LOCATION_OK');
