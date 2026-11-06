/* TechNET • Claro Command Center v120
   UX shell only. Uses existing navigation/buttons; does not bypass permissions. */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const pageMeta={
    dashboard:{area:'Visão executiva',desc:'Indicadores comerciais e operacionais'},
    map:{area:'Inteligência territorial',desc:'Distribuição geográfica das vendas'},
    'new-sale':{area:'Comercial',desc:'Cadastro guiado de nova venda Claro'},
    'my-sales':{area:'Comercial',desc:'Carteira e produção individual'},
    team:{area:'Gestão comercial',desc:'Produção, equipe e acompanhamento'},
    location:{area:'Operação de campo',desc:'Posição e atividade da equipe'},
    backoffice:{area:'BackOffice',desc:'Validação e tratamento de vendas'},
    'imperium-products':{area:'Produtos Claro',desc:'Catálogo e conferência no Imperium'},
    territories:{area:'Planejamento',desc:'Territórios, cobertura e distribuição'},
    command:{area:'Gestão operacional',desc:'Ações prioritárias e exceções'},
    goals:{area:'Performance',desc:'Metas e acompanhamento de resultado'},
    health:{area:'Tecnologia',desc:'Saúde, erros e versões do sistema'},
    admin:{area:'Administração',desc:'Usuários, permissões e parâmetros'}
  };

  function currentPage(){
    return $('#nav .nav-btn.active')?.dataset.page || localStorage.getItem('tv_last_page') || 'dashboard';
  }
  function userRole(){
    return $('#userMini .mini-role')?.textContent?.trim() || 'Acesso corporativo';
  }
  function navMap(){
    const map=new Map();
    $$('#nav .nav-btn').forEach(btn=>map.set(btn.dataset.page,btn));
    return map;
  }
  function go(page){
    const btn=navMap().get(page);
    if(btn){ btn.click(); closeDialog(); }
  }

  function ensureStrip(){
    const app=$('#app');
    if(!app || app.classList.contains('hidden')) return;
    const main=$('.main');
    const topbar=$('.main .topbar');
    if(!main || !topbar) return;
    let strip=$('#cc120Strip');
    if(!strip){
      strip=document.createElement('section');
      strip.id='cc120Strip';
      strip.className='cc120-strip';
      strip.setAttribute('aria-label','Contexto operacional');
      strip.innerHTML='<div class="cc120-strip-inner"><div class="cc120-context"><i class="cc120-brand-dot" aria-hidden="true"></i><div><b>TechNET • Operação Claro</b><span id="cc120Area">Central comercial e telecom</span></div></div><div class="cc120-meta"><span class="cc120-chip cc120-role" id="cc120Role"></span><span class="cc120-chip" id="cc120Online"></span><span class="cc120-chip cc120-clock" id="cc120Clock"></span><button type="button" class="ghost cc120-open" id="cc120Open"><span>Central de atalhos</span></button></div></div>';
      topbar.insertAdjacentElement('afterend',strip);
      $('#cc120Open')?.addEventListener('click',openDialog);
    }
    updateStrip();
  }

  function updateStrip(){
    const page=currentPage();
    const meta=pageMeta[page]||{area:'Operação',desc:'Central integrada TechNET'};
    const area=$('#cc120Area');
    const role=$('#cc120Role');
    const online=$('#cc120Online');
    if(area) area.textContent=meta.area+' · '+meta.desc;
    if(role) role.textContent=userRole();
    if(online){
      online.dataset.online=String(navigator.onLine);
      online.textContent=navigator.onLine?'Online':'Offline';
    }
    document.body.dataset.ccPage=page;
  }

  function tick(){
    const el=$('#cc120Clock');
    if(!el) return;
    const now=new Date();
    el.textContent=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function routeLabel(page){
    const labels={
      dashboard:'Dashboard',map:'Mapa de vendas','new-sale':'Nova venda','my-sales':'Minhas vendas',
      team:'Equipe',location:'Localização',backoffice:'BackOffice','imperium-products':'Produtos Imperium',
      territories:'Territórios',command:'Central de Ação',goals:'Metas',health:'Saúde do sistema',admin:'Administração'
    };
    return labels[page]||page;
  }

  function routeButton(page,help){
    const exists=navMap().has(page);
    return '<button class="cc120-link" type="button" data-route="'+esc(page)+'" '+(exists?'':'disabled')+'><span>'+esc(routeLabel(page))+'</span><small>'+esc(exists?help:'Sem acesso neste perfil')+'</small></button>';
  }

  function ensureDialog(){
    let dialog=$('#cc120Dialog');
    if(dialog) return dialog;
    dialog=document.createElement('dialog');
    dialog.id='cc120Dialog';
    dialog.className='cc120-dialog';
    dialog.innerHTML=
      '<div class="cc120-head"><div><span>TECHNET • CLARO</span><h2>Central de atalhos</h2><p>Acesse os principais fluxos sem procurar no menu.</p></div><button type="button" class="ghost cc120-close" aria-label="Fechar">×</button></div>'+
      '<div class="cc120-grid">'+
        '<section class="cc120-group"><div class="cc120-group-title">Comercial</div>'+
          routeButton('dashboard','Visão geral')+routeButton('new-sale','Registrar venda')+routeButton('my-sales','Produção individual')+routeButton('team','Equipe e produção')+routeButton('goals','Metas')+
        '</section>'+
        '<section class="cc120-group"><div class="cc120-group-title">Telecom & campo</div>'+
          routeButton('map','Mapa comercial')+routeButton('location','Equipe em campo')+routeButton('territories','Cobertura e territórios')+routeButton('imperium-products','Produtos e planos')+
        '</section>'+
        '<section class="cc120-group"><div class="cc120-group-title">Operação & gestão</div>'+
          routeButton('backoffice','Validar vendas')+routeButton('command','Pendências e ações')+routeButton('health','Estabilidade do sistema')+routeButton('admin','Usuários e permissões')+
        '</section>'+
      '</div>'+
      '<div class="cc120-footer"><span>Somente opções permitidas ao seu perfil ficam disponíveis.</span><span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd></span></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.cc120-close')?.addEventListener('click',closeDialog);
    dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog()});
    dialog.querySelectorAll('[data-route]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.route)));
    return dialog;
  }

  function rebuildDialog(){
    const old=$('#cc120Dialog');
    if(old) old.remove();
    return ensureDialog();
  }
  function openDialog(){
    if($('#app')?.classList.contains('hidden') || !$('#nav .nav-btn')) return;
    const dialog=rebuildDialog();
    try{dialog.showModal()}catch{dialog.setAttribute('open','')}
  }
  function closeDialog(){
    const dialog=$('#cc120Dialog');
    if(!dialog) return;
    try{dialog.close()}catch{dialog.removeAttribute('open')}
  }

  function brand(){
    const textMap=[
      ['.sidebar .brand b','TechNET • Claro'],
      ['.sidebar .brand span','Operações & Vendas'],
      ['.apple-nav-brand-copy strong','TechNET • Claro'],
      ['.apple-nav-brand-copy small','Operações & Vendas'],
      ['.login-brand-head b','TECHNET • CLARO'],
      ['.login-brand-head span','Operações & Vendas'],
      ['.login-mobile-identity b','TECHNET • CLARO'],
      ['.login-mobile-identity span','Operações & Vendas']
    ];
    textMap.forEach(([sel,value])=>{const el=$(sel);if(el&&el.textContent!==value)el.textContent=value});
    const kicker=$('.topbar-kicker');
    if(kicker&&kicker.textContent!=='TECHNET • CLARO')kicker.textContent='TECHNET • CLARO';
  }

  function semanticPolish(){
    brand();
    ensureStrip();
    updateStrip();

    $$('.table-wrap table,.stp113-table').forEach(table=>{
      if(!table.getAttribute('aria-label')) table.setAttribute('aria-label','Dados operacionais');
    });
    $$('button').forEach(btn=>{
      if(btn.disabled) btn.setAttribute('aria-disabled','true');
      else btn.removeAttribute('aria-disabled');
    });
    $$('.card,.dashboard-panel,.sales-list-panel').forEach(card=>{
      if(!card.dataset.cc120Ready) card.dataset.cc120Ready='true';
    });
  }

  let scheduled=false;
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;semanticPolish()});
  }

  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='k'){
      e.preventDefault();
      openDialog();
    }
    if(e.key==='Escape')closeDialog();
  });
  window.addEventListener('online',updateStrip);
  window.addEventListener('offline',updateStrip);

  window.addEventListener('DOMContentLoaded',()=>{
    semanticPolish();
    tick();
    setInterval(tick,30000);
    const nav=$('#nav');
    const content=$('#content');
    const app=$('#app');
    if(nav)new MutationObserver(schedule).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current']});
    if(content)new MutationObserver(schedule).observe(content,{subtree:false,childList:true});
    if(app)new MutationObserver(schedule).observe(app,{attributes:true,attributeFilter:['class']});
  });
})();