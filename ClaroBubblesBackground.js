const SVG_LOGO=`<svg class="claro-bubble-logo" viewBox="0 0 150 58" aria-hidden="true" focusable="false"><text x="4" y="43">Claro</text><path d="M119 4h5v15h-5zM136 11l4 4-11 11-4-4zM134 31h15v5h-15z"/></svg>`;
const random=(min,max)=>min+Math.random()*(max-min);

export class ClaroBubblesBackground{
 constructor({enabled=true}={}){this.enabled=enabled;this.layer=null;this.bubbles=[];this.animations=new Set();this.timers=new Set();this.media=window.matchMedia('(max-width:760px)');this.reduced=window.matchMedia('(prefers-reduced-motion:reduce)');this.onViewportChange=()=>this.sync();this.onVisibilityChange=()=>this.handleVisibility()}
 mount(){if(!this.enabled||this.layer)return;this.layer=document.createElement('div');this.layer.className='claro-bubbles-background';this.layer.setAttribute('aria-hidden','true');document.body.prepend(this.layer);this.media.addEventListener?.('change',this.onViewportChange);this.reduced.addEventListener?.('change',this.onViewportChange);document.addEventListener('visibilitychange',this.onVisibilityChange);this.sync()}
 sync(){if(!this.layer)return;this.clear();const count=this.reduced.matches?(this.media.matches?3:5):(this.media.matches?5:10);for(let i=0;i<count;i++)this.createBubble(i,true)}
 createBubble(index=0,initial=false){if(!this.layer)return;const mobile=this.media.matches,reduced=this.reduced.matches,size=reduced?random(mobile?52:68,mobile?100:150):random(mobile?52:60,mobile?125:220),bubble=document.createElement('div');bubble.className='claro-bubble';bubble.style.setProperty('--bubble-size',`${size}px`);bubble.innerHTML=SVG_LOGO;this.layer.appendChild(bubble);this.bubbles.push(bubble);const x=random(-size*.15,Math.max(0,window.innerWidth-size*.85)),y=random(window.innerHeight*.04,Math.max(window.innerHeight*.08,window.innerHeight-size*.72));bubble.style.transform=`translate3d(${x}px,${y}px,0) rotate(${random(-5,5)}deg) scale(${reduced?1:0.34})`;if(reduced){bubble.style.opacity=String(random(.065,.13));return}this.animateLife(bubble,{x,y,size,delay:initial?index*180+random(0,700):0})}
 animateLife(bubble,{x,y,size,delay}){if(!bubble.isConnected)return;const mobile=this.media.matches,duration=random(9000,19000),rise=random(mobile?36:70,mobile?100:190),drift=random(mobile?-34:-75,mobile?34:75),opacity=random(.1,.24),float=bubble.animate([{transform:`translate3d(${x}px,${y}px,0) rotate(${random(-4,2)}deg) scale(.34)`,opacity:0},{offset:.12,opacity,transform:`translate3d(${x+drift*.12}px,${y-rise*.1}px,0) rotate(${random(-2,3)}deg) scale(1)`},{offset:.72,opacity:opacity*.92,transform:`translate3d(${x+drift*.72}px,${y-rise*.7}px,0) rotate(${random(-4,4)}deg) scale(${random(.96,1.04)})`},{transform:`translate3d(${x+drift}px,${y-rise}px,0) rotate(${random(-5,5)}deg) scale(1.03)`,opacity:opacity*.78}],{duration,delay,easing:'cubic-bezier(.37,0,.24,1)',fill:'forwards'});this.track(float);const popAt=delay+duration*random(.68,.9),timer=setTimeout(()=>{this.timers.delete(timer);if(bubble.isConnected)this.pop(bubble,x+drift*(popAt-delay)/duration,y-rise*(popAt-delay)/duration,size)},popAt);this.timers.add(timer)}
 pop(bubble,x,y,size){const pop=bubble.animate([{transform:`translate3d(${x}px,${y}px,0) scale(1)`,opacity:getComputedStyle(bubble).opacity},{offset:.55,transform:`translate3d(${x}px,${y}px,0) scale(1.09,.94)`,opacity:.2},{transform:`translate3d(${x}px,${y}px,0) scale(1.2)`,opacity:0}],{duration:420,easing:'cubic-bezier(.2,.75,.3,1)',fill:'forwards'});this.track(pop);const particles=this.media.matches?5:Math.round(random(6,10)),cx=x+size/2,cy=y+size/2;for(let i=0;i<particles;i++){const p=document.createElement('i'),angle=(Math.PI*2*i/particles)+random(-.22,.22),distance=random(size*.18,size*.38);p.className='claro-bubble-particle';p.style.setProperty('--particle-size',`${random(3,7)}px`);p.style.transform=`translate3d(${cx}px,${cy}px,0) scale(.4)`;this.layer.appendChild(p);const a=p.animate([{opacity:.22,transform:`translate3d(${cx}px,${cy}px,0) scale(.4)`},{offset:.34,opacity:.17},{opacity:0,transform:`translate3d(${cx+Math.cos(angle)*distance}px,${cy+Math.sin(angle)*distance}px,0) scale(1)`}],{duration:random(500,850),easing:'cubic-bezier(.16,.75,.32,1)'});this.track(a);a.finished.catch(()=>{}).finally(()=>p.remove())}pop.finished.catch(()=>{}).finally(()=>{this.removeBubble(bubble);const timer=setTimeout(()=>{this.timers.delete(timer);this.createBubble()},random(350,1100));this.timers.add(timer)})}
 track(animation){this.animations.add(animation);animation.finished.catch(()=>{}).finally(()=>this.animations.delete(animation));return animation}
 removeBubble(bubble){bubble.remove();this.bubbles=this.bubbles.filter(item=>item!==bubble)}
 handleVisibility(){for(const animation of this.animations){if(document.hidden)animation.pause();else animation.play()}}
 clear(){for(const timer of this.timers)clearTimeout(timer);this.timers.clear();for(const animation of this.animations)animation.cancel();this.animations.clear();for(const bubble of this.bubbles)bubble.remove();this.bubbles=[];this.layer?.querySelectorAll('.claro-bubble-particle').forEach(p=>p.remove())}
 destroy(){this.clear();this.media.removeEventListener?.('change',this.onViewportChange);this.reduced.removeEventListener?.('change',this.onViewportChange);document.removeEventListener('visibilitychange',this.onVisibilityChange);this.layer?.remove();this.layer=null}
}

export function mountClaroBubblesBackground(options){const background=new ClaroBubblesBackground(options);background.mount();return background}

/* Commercial team menu portal v65.
   The dashboard uses several historical stacking/compositing layers. Moving the open menu to
   document.body makes it a true top-level overlay instead of fighting card z-index values. */
let adminTeamPortalInstalled=false;
function installAdminTeamMenuPortal(){
 if(adminTeamPortalInstalled)return;adminTeamPortalInstalled=true;
 const state={picker:null,menu:null,home:null};
 const clearInline=menu=>{for(const p of ['left','top','right','bottom','width','max-height'])menu.style.removeProperty(p)};
 const place=()=>{
  const {picker,menu}=state;if(!picker||!menu||!picker.isConnected||!menu.isConnected)return;
  const r=picker.getBoundingClientRect(),margin=8,gap=8,vw=document.documentElement.clientWidth||window.innerWidth,vh=window.visualViewport?.height||window.innerHeight;
  const width=Math.max(210,Math.min(r.width,vw-margin*2));
  const left=Math.max(margin,Math.min(r.left,vw-width-margin));
  const roomBelow=Math.max(160,vh-r.bottom-gap-margin);
  menu.style.setProperty('left',`${Math.round(left)}px`,'important');
  menu.style.setProperty('top',`${Math.round(r.bottom+gap)}px`,'important');
  menu.style.setProperty('width',`${Math.round(width)}px`,'important');
  menu.style.setProperty('max-height',`${Math.round(Math.min(360,roomBelow))}px`,'important');
 };
 const restore=(hide=true)=>{
  const {picker,menu,home}=state;if(!menu)return;
  if(hide)menu.classList.add('hidden');
  menu.classList.remove('adm-team-menu-portal');clearInline(menu);
  if(home?.isConnected&&menu.parentElement!==home)home.appendChild(menu);
  picker?.setAttribute('aria-expanded','false');
  state.picker=null;state.menu=null;state.home=null;
 };
 const open=picker=>{
  const menu=document.querySelector('#admTeamMenu');if(!menu)return;
  if(state.menu)restore(true);
  state.picker=picker;state.menu=menu;state.home=menu.parentElement;
  document.body.appendChild(menu);menu.classList.add('adm-team-menu-portal');menu.classList.remove('hidden');picker.setAttribute('aria-expanded','true');
  place();requestAnimationFrame(place);
 };
 document.addEventListener('click',e=>{
  const target=e.target instanceof Element?e.target:null;if(!target)return;
  const option=target.closest('.adm-team-option'),menuHit=target.closest('#admTeamMenu'),picker=target.closest('#admTeamPicker');
  if(option&&menuHit?.classList.contains('adm-team-menu-portal')){restore(false);return}
  if(picker){e.preventDefault();e.stopImmediatePropagation();if(state.menu&&!state.menu.classList.contains('hidden'))restore(true);else open(picker);return}
  if(menuHit&&menuHit===state.menu)return;
  if(state.menu)restore(true);
 },true);
 window.addEventListener('resize',()=>{if(state.menu)place()},{passive:true});
 window.addEventListener('scroll',()=>{if(state.menu)place()},{passive:true,capture:true});
 window.visualViewport?.addEventListener('resize',()=>{if(state.menu)place()},{passive:true});
}
installAdminTeamMenuPortal();
