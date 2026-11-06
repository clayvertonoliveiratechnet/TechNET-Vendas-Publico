const mobileMedia=window.matchMedia('(max-width:820px)');

function enhanceAndroidTabs(){
  const nav=document.querySelector('#mobileBottomNav');
  if(!nav||!mobileMedia.matches)return;
  nav.classList.add('android-tabs-v4');
  nav.setAttribute('aria-label','Navegação rápida');
  nav.querySelectorAll('button[data-p]').forEach(button=>{
    const active=button.classList.contains('active')||button.getAttribute('aria-current')==='page';
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
    if(button.classList.contains('main-add')&&!button.getAttribute('aria-label'))button.setAttribute('aria-label','Nova venda');
  });
}

let frame=0;
function schedule(){
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(enhanceAndroidTabs);
}

window.addEventListener('DOMContentLoaded',()=>{
  enhanceAndroidTabs();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
});
mobileMedia.addEventListener?.('change',schedule);
