const MOTION_URL='https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm';
const android=/Android/i.test(navigator.userAgent);
const mobile=window.matchMedia('(max-width:820px)');
const reduced=window.matchMedia('(prefers-reduced-motion:reduce)');
let motionPromise=null,nav=null,entered=false,activeControl=null,keyboardControl=null;

const eligible=()=>android&&mobile.matches&&!reduced.matches;
const loadMotion=()=>motionPromise??=(eligible()?import(MOTION_URL).catch(()=>null):Promise.resolve(null));
const cancel=control=>{try{control?.cancel()}catch{}}

function keepSaleIconStable(){
 const saleButton=nav?.querySelector('.main-add');
 const icon=saleButton?.querySelector('.sale-action-icon');
 const wrap=saleButton?.querySelector('.mobile-nav-icon');
 if(!saleButton||!icon)return;
 saleButton.style.removeProperty('transform');
 if(wrap){wrap.style.removeProperty('transform');wrap.style.removeProperty('opacity')}
 icon.style.setProperty('display','block','important');
 icon.style.setProperty('visibility','visible','important');
 icon.style.setProperty('opacity','1','important');
 icon.style.setProperty('transform','none','important');
}

function burstMoney(button){
 if(!button||reduced.matches)return;
 const rect=button.getBoundingClientRect();
 const layer=document.createElement('div');
 layer.className='sale-money-burst';
 // Nasce ligeiramente acima do centro do botao para o efeito permanecer visivel sobre a barra.
 Object.assign(layer.style,{position:'fixed',left:`${rect.left+rect.width/2}px`,top:`${rect.top+rect.height*.38}px`,width:'1px',height:'1px',zIndex:'9999',pointerEvents:'none',overflow:'visible'});
 document.body.appendChild(layer);
 const total=14;
 const particles=[];
 for(let i=0;i<total;i++){
  const p=document.createElement('span');
  p.textContent='$';
  p.setAttribute('aria-hidden','true');
  // Abre em leque ao redor da metade superior do botao e continua flutuando para cima.
  const spread=(i/(total-1)-.5)*110;
  const jitter=(Math.random()-.5)*18;
  const x=spread+jitter;
  const rise=78+Math.random()*68;
  const size=13+Math.random()*9;
  Object.assign(p.style,{position:'absolute',left:'0',top:'0',fontSize:`${size}px`,fontWeight:'900',lineHeight:'1',color:i%3===0?'#ffd54a':'#fff',textShadow:'0 2px 8px rgba(0,0,0,.3)',transform:'translate(-50%,-50%) scale(.35)',opacity:'0',willChange:'transform,opacity'});
  layer.appendChild(p);particles.push({p,x,y:-rise,rot:(Math.random()-.5)*70,drift:(Math.random()-.5)*14});
 }
 loadMotion().then(motion=>{
  if(motion){
   motion.animate(button,{scale:[1,.94,1.08,1]},{duration:.42,ease:[.22,.8,.25,1]});
   particles.forEach(({p,x,y,rot,drift},i)=>motion.animate(p,{x:[0,x*.22,x*.7,x+drift],y:[0,-18,y*.58,y],rotate:[0,rot*.3,rot*.7,rot],scale:[.35,1.08,.94,.72],opacity:[0,1,.92,0]},{duration:1.25+Math.random()*.45,delay:i*.025,ease:[.18,.72,.28,1]}));
   setTimeout(()=>layer.remove(),1900);
  }else{
   particles.forEach(({p,x,y,rot,drift},i)=>{p.animate([{transform:'translate(-50%,-50%) scale(.35)',opacity:0},{transform:`translate(calc(-50% + ${x*.22}px),calc(-50% - 18px)) scale(1.08)`,opacity:1},{transform:`translate(calc(-50% + ${x*.7}px),calc(-50% + ${y*.58}px)) rotate(${rot*.7}deg) scale(.94)`,opacity:.92},{transform:`translate(calc(-50% + ${x+drift}px),calc(-50% + ${y}px)) rotate(${rot}deg) scale(.72)`,opacity:0}],{duration:1350+i*18,easing:'cubic-bezier(.18,.72,.28,1)',fill:'forwards'})});
   setTimeout(()=>layer.remove(),1900);
  }
 });
}

function placeIndicator(button,animated=false){const indicator=nav?.querySelector('.mobile-nav-indicator');if(!indicator)return;const target=button&&!button.classList.contains('main-add')?button:null;if(!target){indicator.hidden=true;keepSaleIconStable();return}const navBox=nav.getBoundingClientRect(),box=target.getBoundingClientRect(),x=box.left-navBox.left+(box.width-18)/2;indicator.hidden=false;if(!animated||!eligible()){indicator.style.transform=`translate3d(${x}px,0,0)`;keepSaleIconStable();return}loadMotion().then(motion=>{if(!motion){indicator.style.transform=`translate3d(${x}px,0,0)`;keepSaleIconStable();return}cancel(activeControl);activeControl=motion.animate(indicator,{x},{duration:.32,ease:[.22,.8,.25,1]});keepSaleIconStable()})}

export function setupMobileBottomNavMotion(element){nav=element;if(!nav)return;keepSaleIconStable();const active=nav.querySelector('[aria-current="page"],button.active');requestAnimationFrame(()=>{placeIndicator(active);keepSaleIconStable()});if(nav.dataset.motionReady)return;nav.dataset.motionReady='true';nav.addEventListener('click',event=>{const button=event.target.closest('button.main-add');if(button)burstMoney(button)});nav.addEventListener('pointerdown',event=>tap(event.target.closest('button'),.94));for(const type of ['pointerup','pointercancel','pointerleave'])nav.addEventListener(type,event=>tap(event.target.closest('button'),1));window.addEventListener('orientationchange',()=>requestAnimationFrame(()=>{placeIndicator(nav?.querySelector('[aria-current="page"],button.active'));keepSaleIconStable()}),{passive:true});if(eligible()&&!entered){entered=true;loadMotion().then(motion=>{if(!motion||!nav){keepSaleIconStable();return}motion.animate(nav,{opacity:[0,1],y:[18,0]},{duration:.38,ease:[.22,.8,.25,1]});const regularButtons=nav.querySelectorAll('button:not(.main-add)');if(regularButtons.length)motion.animate(regularButtons,{opacity:[0,1],scale:[.94,1]},{duration:.3,delay:motion.stagger(.035),ease:[.22,.8,.25,1]});keepSaleIconStable()})}}

function tap(button,scale){if(!button||button.classList.contains('main-add')||!eligible()){keepSaleIconStable();return}loadMotion().then(motion=>{if(motion&&button.isConnected)motion.animate(button,{scale},{duration:.12,ease:'easeOut'});keepSaleIconStable()})}

export function animateMobileBottomNavActive(button,previous){if(!nav||!button)return;placeIndicator(button,true);keepSaleIconStable();if(!eligible()||button===previous||button.classList.contains('main-add'))return;loadMotion().then(motion=>{if(!motion||!button.isConnected){keepSaleIconStable();return}motion.animate(button.querySelector('.mobile-nav-icon')||button,{scale:[1,1.12,1],y:[0,-2,0]},{duration:.34,ease:[.22,.8,.25,1]}).finished?.finally?.(()=>keepSaleIconStable());keepSaleIconStable()})}

export function setMobileBottomNavKeyboardHidden(hidden){if(!nav)return;nav.classList.toggle('motion-keyboard-hidden',hidden);nav.style.pointerEvents=hidden?'none':'';if(!eligible()){nav.style.opacity=hidden?'0':'';nav.style.transform=hidden?'translateY(120%)':'';if(!hidden)keepSaleIconStable();return}loadMotion().then(motion=>{if(!motion||!nav)return;cancel(keyboardControl);keyboardControl=motion.animate(nav,{opacity:hidden?0:1,y:hidden?'120%':0},{duration:hidden?.2:.3,ease:[.22,.8,.25,1]});if(!hidden)keepSaleIconStable()})}
