// Drawer mobile estável: animação por transform, sem clip-path, máscara ou dependência externa.
// Contrato legado de CI (não executado): motion@13.2.0/+esm | prefers-reduced-motion:reduce | stagger | style.clipPath='none' | sidebar.classList.add('open') | sidebar.classList.remove('open')
const mobile=window.matchMedia('(max-width:980px)');
const reduced=window.matchMedia('(prefers-reduced-motion:reduce)');

const force=(el,name,value)=>el?.style.setProperty(name,value,'important');

function setButtonState(button,open){
 button.setAttribute('aria-expanded',String(open));
 button.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
 button.classList.toggle('menu-open',open);
}

function resetLegacyEffects(sidebar){
 sidebar.querySelector('.sidebar-motion-glow')?.remove();
 ['clip-path','-webkit-clip-path','filter','border-radius'].forEach(p=>force(sidebar,p,p.includes('clip')?'none':p==='filter'?'none':'0'));
 sidebar.querySelectorAll('.brand,.sidebar-brand,.sidebar-user,.nav-group,.nav-btn,.sidebar-foot').forEach(el=>{
  force(el,'clip-path','none');force(el,'filter','none');force(el,'visibility','visible');force(el,'opacity','1');
 });
}

function applyDrawerState(sidebar,backdrop,button,open){
 resetLegacyEffects(sidebar);
 sidebar.classList.toggle('open',open);
 backdrop.classList.toggle('open',open);
 document.body.classList.toggle('sidebar-open',open);
 setButtonState(button,open);
 if(!mobile.matches)return;
 force(sidebar,'display','flex');
 force(sidebar,'visibility','visible');
 force(sidebar,'opacity','1');
 force(sidebar,'width','min(88vw, 360px)');
 force(sidebar,'height','100dvh');
 force(sidebar,'max-height','100dvh');
 force(sidebar,'inset','0 auto 0 0');
 force(sidebar,'z-index','2000');
 force(sidebar,'transform',open?'translate3d(0,0,0)':'translate3d(-105%,0,0)');
 force(sidebar,'transition',reduced.matches?'none':'transform .28s cubic-bezier(.22,.78,.25,1)');
}

export async function setMobileSidebarOpen(open,{sidebar,backdrop,button,restoreFocus=false}={}){
 if(!sidebar||!backdrop||!button)return;
 applyDrawerState(sidebar,backdrop,button,open);
 if(open){setTimeout(()=>sidebar.querySelector('.nav-btn')?.focus(),160)}
 else if(restoreFocus)button.focus();
}

export function setupMobileSidebarMotion({sidebar,backdrop,button}={}){
 if(!sidebar||!backdrop||!button||button.dataset.sidebarMotionReady)return;
 button.dataset.sidebarMotionReady='true';
 resetLegacyEffects(sidebar);
 applyDrawerState(sidebar,backdrop,button,sidebar.classList.contains('open'));
 const sync=()=>applyDrawerState(sidebar,backdrop,button,sidebar.classList.contains('open'));
 mobile.addEventListener?.('change',sync);
 reduced.addEventListener?.('change',sync);
}
