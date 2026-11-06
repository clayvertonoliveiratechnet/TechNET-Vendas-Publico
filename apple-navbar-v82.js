const desktopMedia=window.matchMedia('(min-width:981px)');

const svg=(name)=>{
  const common='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const paths={
    search:'<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path>',
    sun:'<circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path>',
    chevron:'<path d="m8 10 4 4 4-4"></path>',
    logout:'<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M13 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5"></path>'
  };
  return `<svg ${common}>${paths[name]||''}</svg>`;
};

function initials(name){
  const parts=String(name||'Usuário').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(p=>p[0]).join('')||'U').toUpperCase();
}

function sourceItems(){
  return [...document.querySelectorAll('#nav .nav-btn')].map(btn=>({
    page:btn.dataset.page||'',
    label:btn.textContent.trim(),
    active:btn.classList.contains('active')||btn.getAttribute('aria-current')==='page',
    source:btn
  })).filter(x=>x.page&&x.label);
}

function closeMenus(root){
  root.querySelectorAll('.apple-nav-menu').forEach(menu=>menu.hidden=true);
  root.querySelectorAll('[aria-expanded="true"]').forEach(btn=>btn.setAttribute('aria-expanded','false'));
}

function build(){
  let root=document.querySelector('.apple-navbar');
  if(!root){
    root=document.createElement('nav');
    root.className='apple-navbar is-empty';
    root.setAttribute('aria-label','Navegação principal compacta');
    document.body.appendChild(root);
  }
  if(!desktopMedia.matches){root.classList.add('is-empty');return}

  const items=sourceItems();
  if(!items.length||document.querySelector('#app')?.classList.contains('hidden')){
    root.classList.add('is-empty');
    return;
  }

  const visible=items.slice(0,5),extra=items.slice(5);
  const name=document.querySelector('#userMini .mini-name')?.textContent?.trim()||'Usuário';
  const role=document.querySelector('#userMini .mini-role')?.textContent?.trim()||'TechNET Vendas';
  const extraActive=extra.some(x=>x.active);

  root.innerHTML=`
    <button class="apple-nav-brand" type="button" data-home aria-label="Ir para o Dashboard">
      <img class="apple-nav-logo" src="logo.png?v=12" alt="">
      <span class="apple-nav-brand-copy"><strong>TechNET Vendas</strong><small>Gestão comercial</small></span>
    </button>
    <div class="apple-nav-center">
      <div class="apple-nav-links">
        ${visible.map(x=>`<button class="apple-nav-link ${x.active?'active':''}" type="button" data-page="${x.page}" ${x.active?'aria-current="page"':''}>${x.label}</button>`).join('')}
      </div>
      ${extra.length?`<div class="apple-nav-more-wrap">
        <button class="apple-nav-more-btn ${extraActive?'active':''}" type="button" aria-expanded="false" aria-haspopup="menu">Mais ${svg('chevron')}</button>
        <div class="apple-nav-menu apple-nav-more-menu" role="menu" hidden>
          ${extra.map(x=>`<button type="button" role="menuitem" class="${x.active?'active':''}" data-page="${x.page}">${x.label}</button>`).join('')}
        </div>
      </div>`:''}
    </div>
    <div class="apple-nav-actions">
      <button class="apple-nav-icon-btn" type="button" data-search aria-label="Buscar no sistema">${svg('search')}</button>
      <button class="apple-nav-icon-btn" type="button" data-theme aria-label="Alternar tema claro ou escuro">${svg('sun')}</button>
      <span class="apple-nav-divider" aria-hidden="true"></span>
      <div class="apple-nav-account-wrap">
        <button class="apple-nav-account-btn" type="button" aria-expanded="false" aria-haspopup="menu">
          <span class="apple-nav-avatar" aria-hidden="true">${initials(name)}</span>
          <span class="apple-nav-user-copy"><strong>${name.replace(/[<>&"]/g,'')}</strong><small>${role.replace(/[<>&"]/g,'')}</small></span>
        </button>
        <div class="apple-nav-menu apple-nav-account-menu" role="menu" hidden>
          <div class="apple-nav-account-summary"><strong>${name.replace(/[<>&"]/g,'')}</strong><small>${role.replace(/[<>&"]/g,'')}</small></div>
          <button type="button" class="apple-nav-logout" role="menuitem">${svg('logout')} Sair da conta</button>
        </div>
      </div>
    </div>`;

  root.classList.remove('is-empty');

  const go=(page)=>{
    const target=[...document.querySelectorAll('#nav .nav-btn')].find(b=>b.dataset.page===page);
    if(target)target.click();
    closeMenus(root);
  };

  root.querySelector('[data-home]')?.addEventListener('click',()=>go('dashboard'));
  root.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.page)));
  root.querySelector('[data-search]')?.addEventListener('click',()=>document.querySelector('#globalSearchTrigger')?.click());
  root.querySelector('[data-theme]')?.addEventListener('click',()=>document.querySelector('#themeToggle')?.click());

  const moreBtn=root.querySelector('.apple-nav-more-btn'),moreMenu=root.querySelector('.apple-nav-more-menu');
  moreBtn?.addEventListener('click',e=>{
    e.stopPropagation();
    const opening=moreMenu.hidden;
    closeMenus(root);
    moreMenu.hidden=!opening;
    moreBtn.setAttribute('aria-expanded',String(opening));
  });

  const accountBtn=root.querySelector('.apple-nav-account-btn'),accountMenu=root.querySelector('.apple-nav-account-menu');
  accountBtn?.addEventListener('click',e=>{
    e.stopPropagation();
    const opening=accountMenu.hidden;
    closeMenus(root);
    accountMenu.hidden=!opening;
    accountBtn.setAttribute('aria-expanded',String(opening));
  });
  root.querySelector('.apple-nav-logout')?.addEventListener('click',()=>document.querySelector('#logoutBtn')?.click());
}

let frame=0;
const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(build)};

window.addEventListener('DOMContentLoaded',()=>{
  build();
  const nav=document.querySelector('#nav');
  if(nav)new MutationObserver(schedule).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current']});
  const user=document.querySelector('#userMini');
  if(user)new MutationObserver(schedule).observe(user,{subtree:true,childList:true,characterData:true});
  const app=document.querySelector('#app');
  if(app)new MutationObserver(schedule).observe(app,{attributes:true,attributeFilter:['class']});
});
desktopMedia.addEventListener?.('change',schedule);
document.addEventListener('click',e=>{
  const root=document.querySelector('.apple-navbar');
  if(root&&!root.contains(e.target))closeMenus(root);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const root=document.querySelector('.apple-navbar');
    if(root)closeMenus(root);
  }
});
