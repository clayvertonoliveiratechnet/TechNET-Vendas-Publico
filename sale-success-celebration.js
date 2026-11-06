// Comemoração da Nova Venda. O observador só dispara quando o fluxo troca para a tela
// de documentos com a marca VENDA SALVA, estado alcançado após persistir venda/produtos.
let lastCelebrated=null;
export function showSaleSuccessCelebration({customerName='Cliente'}={}){
 document.querySelector('.sale-success-celebration')?.remove();
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const root=document.createElement('div');root.className='sale-success-celebration';root.setAttribute('role','status');root.setAttribute('aria-live','polite');
 root.innerHTML=`<div class="sale-success-balloons" aria-hidden="true"></div><div class="sale-success-card"><div class="sale-success-check">✓</div><div class="sale-success-kicker">VENDA CADASTRADA</div><h2>Parabéns! 🎉</h2><p>A venda de <strong>${escapeHtml(customerName)}</strong> foi salva com sucesso.</p><small>Agora vamos anexar os documentos.</small></div>`;
 document.body.appendChild(root);const balloons=root.querySelector('.sale-success-balloons');
 if(!reduced){const colors=['#d31f28','#ffca28','#2e7d32','#1976d2','#7b1fa2','#ff7043'];for(let i=0;i<16;i++){const b=document.createElement('i');b.className='sale-success-balloon';b.style.setProperty('--x',`${4+Math.random()*92}%`);b.style.setProperty('--delay',`${Math.random()*.55}s`);b.style.setProperty('--duration',`${2.2+Math.random()*1.1}s`);b.style.setProperty('--drift',`${-35+Math.random()*70}px`);b.style.setProperty('--balloon',colors[i%colors.length]);balloons.appendChild(b)}}
 requestAnimationFrame(()=>root.classList.add('show'));const close=()=>{root.classList.remove('show');setTimeout(()=>root.remove(),280)};setTimeout(close,reduced?1400:3000);return{close};
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function detectSuccessfulSale(){const step=document.querySelector('#content .doc-step');if(!step)return;const kicker=step.querySelector('.kicker')?.textContent?.trim();if(kicker!=='VENDA SALVA')return;const customerName=step.querySelector('h2')?.textContent?.trim()||'Cliente';const signature=`${customerName}|${step.textContent.slice(0,120)}`;if(signature===lastCelebrated)return;lastCelebrated=signature;showSaleSuccessCelebration({customerName})}
function setup(){const content=document.getElementById('content');if(!content)return;new MutationObserver(detectSuccessfulSale).observe(content,{childList:true,subtree:true});detectSuccessfulSale()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
