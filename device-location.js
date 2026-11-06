// Sale capture and map controls share the APK's native fix; browsers use their own GPS.
export async function getDevicePosition({timeout=12000,maximumAge=15000}={}){
  if(window.TechNETNativeTracking?.snapshot){
    const deadline=Date.now()+timeout;
    do{
      const snapshot=JSON.parse(window.TechNETNativeTracking.snapshot()||'{}');
      if(snapshot.location_permission===false)throw new Error('Permita a localização nas configurações do aplicativo.');
      const p=snapshot.last_position,t=Date.parse(p?.recorded_at);
      if(p?.latitude!=null&&p?.longitude!=null&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&Number.isFinite(t)&&Date.now()-t>=-5000&&Date.now()-t<=maximumAge){
        return {latitude:Number(p.latitude),longitude:Number(p.longitude),accuracy:Number(p.accuracy)||0};
      }
      if(Date.now()>=deadline)break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }while(Date.now()<=deadline);
    throw new Error('Aguardando uma localização recente do GPS. Confira o sinal e tente novamente.');
  }
  if(!navigator.geolocation)throw new Error('GPS indisponível neste navegador.');
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
    p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
    ()=>reject(new Error('Confira a permissão de localização e tente novamente.')),
    {enableHighAccuracy:true,timeout,maximumAge}
  ));
}
