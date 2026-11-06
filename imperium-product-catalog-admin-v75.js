const money=v=>{const n=Number(v);return Number.isFinite(n)?`R$ ${n.toFixed(2).replace('.',',')}`:'—'};

function ensureStyle(){
  if(document.getElementById('ipAdmin75Style'))return;
  const s=document.createElement('style');
  s.id='ipAdmin75Style';
  s.textContent=`
    .ipa75{display:grid;gap:14px}.ipa75-info{padding:16px;border:1px solid #b2ddff;border-radius:14px;background:#eff8ff}.ipa75-info b{display:block;margin-bottom:4px}.ipa75-info p{margin:0;color:#344054;font-size:12px}
    .ipa75-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 160px 180px auto;gap:10px;align-items:end}.ipa75-field span{display:block;margin-bottom:5px;font-size:10px;font-weight:800;color:#667085;text-transform:uppercase}.ipa75-field input,.ipa75-field select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid #d0d5dd;border-radius:10px;padding:8px 10px;background:#fff;color:#101828}
    .ipa75-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ipa75-kpi{padding:14px;border:1px solid #e4e7ec;border-radius:13px;background:#fff}.ipa75-kpi small{display:block;color:#667085;font-size:10px;font-weight:800;text-transform:uppercase}.ipa75-kpi strong{display:block;margin-top:5px;font-size:22px}
    .ipa75-list{border:1px solid #e4e7ec;border-radius:14px;background:#fff;overflow:hidden}.ipa75-head,.ipa75-row{display:grid;grid-template-columns:90px minmax(260px,1.8fr) minmax(150px,.8fr) 100px 90px 160px;gap:10px;align-items:center;padding:11px 14px}.ipa75-head{background:#f9fafb;border-bottom:1px solid #e4e7ec;font-size:10px;font-weight:800;color:#667085;text-transform:uppercase}.ipa75-row{border-bottom:1px solid #eef2f6}.ipa75-row:last-child{border-bottom:0}.ipa75-name b{display:block;font-size:12px}.ipa75-name small{display:block;margin-top:3px;color:#667085}.ipa75-pill{display:inline-flex;width:max-content;padding:4px 7px;border-radius:999px;background:#ecfdf3;color:#027a48;font-size:10px;font-weight:800}.ipa75-base{font-size:11px;font-weight:800;text-transform:uppercase}.ipa75-toggle{min-height:34px}.ipa75-toggle.on{background:#067647;color:#fff;border-color:#067647}.ipa75-toggle.off{background:#fff;color:#b42318;border-color:#fda29b}.ipa75-empty{padding:28px;text-align:center;color:#667085}.ipa75-loading{padding:28px;text-align:center;color:#667085}
    [data-theme="dark"] .ipa75-info{background:#101828;border-color:#175cd3}[data-theme="dark"] .ipa75-info p{color:#d0d5dd}[data-theme="dark"] .ipa75-kpi,[data-theme="dark"] .ipa75-list{background:#11151b;border-color:#2a313b}[data-theme="dark"] .ipa75-head{background:#171c23;border-color:#2a313b}[data-theme="dark"] .ipa75-row{border-color:#252d37}[data-theme="dark"] .ipa75-field input,[data-theme="dark"] .ipa75-field select{background:#11151b;border-color:#344054;color:#f2f4f7}[data-theme="dark"] .ipa75-toggle.off{background:#11151b}
    @media(max-width:900px){.ipa75-toolbar{grid-template-columns:1fr 1fr}.ipa75-toolbar .ipa75-field:first-child{grid-column:1/-1}.ipa75-head{display:none}.ipa75-row{grid-template-columns:1fr auto;gap:8px}.ipa75-row>div:not(.ipa75-name):not(.ipa75-action){font-size:11px}.ipa75-name{grid-column:1/2}.ipa75-action{grid-column:2/3;grid-row:1/3}.ipa75-kpis{grid-template-columns:1fr 1fr 1fr}}
    @media(max-width:560px){.ipa75-toolbar{grid-template-columns:1fr}.ipa75-toolbar .ipa75-field:first-child{grid-column:auto}.ipa75-kpis{grid-template-columns:1fr}.ipa75-row{grid-template-columns:1fr}.ipa75-action{grid-column:auto;grid-row:auto}.ipa75-toggle{width:100%}}
  `;
  document.head.appendChild(s);
}

async function rpc(sb,name,args){const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

export async function renderAdminImperiumCatalog(ctx){
  const {sb,content,profile,setTitle,toast,escapeHtml:esc}=ctx;
  if(profile?.role!=='admin')throw new Error('Apenas o administrador pode configurar o catálogo de produtos.');
  ensureStyle();
  setTitle('Produtos Imperium','Catálogo ativo autorizado para uso no TechNET');
  const state={base:'',filter:'all',search:''};
  let debounce=0;
  content.innerHTML=`<section class="ipa75">
    <div class="ipa75-info"><b>Somente produtos ATIVOS do Imperium</b><p>Marque “Usar no TechNET” apenas nos produtos que podem ser vendidos. Produtos inativos, históricos ou não selecionados deixam de aparecer na Nova Venda e nas correções do BackOffice. Vendas antigas não são alteradas.</p></div>
    <div class="card ipa75-toolbar">
      <label class="ipa75-field"><span>Buscar produto</span><input id="ipa75Search" placeholder="Nome, grupo ou IdProduto"></label>
      <label class="ipa75-field"><span>Base</span><select id="ipa75Base"><option value="">Todas</option><option value="natal">Natal</option><option value="fortaleza">Fortaleza</option><option value="mossoro">Mossoró</option><option value="recife">Recife</option></select></label>
      <label class="ipa75-field"><span>Exibição</span><select id="ipa75Filter"><option value="all">Todos os ativos</option><option value="enabled">Usados no TechNET</option><option value="disabled">Fora do TechNET</option></select></label>
      <button type="button" class="ghost" id="ipa75Refresh">↻ Atualizar</button>
    </div>
    <div class="ipa75-kpis" id="ipa75Kpis"></div>
    <section class="ipa75-list"><div class="ipa75-head"><div>Base</div><div>Produto oficial</div><div>Grupo</div><div>Tabela</div><div>Status</div><div>Uso no TechNET</div></div><div id="ipa75Rows"><div class="ipa75-loading">Carregando catálogo oficial…</div></div></section>
  </section>`;

  async function load(){
    const rowsEl=document.getElementById('ipa75Rows'),kpis=document.getElementById('ipa75Kpis');
    if(!rowsEl||!kpis)return;
    rowsEl.innerHTML='<div class="ipa75-loading">Carregando produtos ATIVOS do Imperium…</div>';
    try{
      const d=await rpc(sb,'tv_admin_imperium_product_catalog',{p_base:state.base,p_search:state.search,p_filter:state.filter});
      const summary=d?.summary||{},rows=Array.isArray(d?.products)?d.products:[];
      kpis.innerHTML=`<div class="ipa75-kpi"><small>Produtos ativos</small><strong>${Number(summary.active_total||0)}</strong></div><div class="ipa75-kpi"><small>Usados no TechNET</small><strong>${Number(summary.enabled_total||0)}</strong></div><div class="ipa75-kpi"><small>Fora do TechNET</small><strong>${Number(summary.disabled_total||0)}</strong></div>`;
      rowsEl.innerHTML=rows.length?rows.map(p=>`<div class="ipa75-row" data-base="${esc(p.base_key)}" data-id="${Number(p.imperium_id)}">
        <div class="ipa75-base">${esc(p.base_key)}</div>
        <div class="ipa75-name"><b>${esc(p.imperium_name)}</b><small>IdProduto ${Number(p.imperium_id)} · ${esc(p.brand||'NET')}${p.price!=null?' · '+money(p.price):''}</small></div>
        <div>${esc(p.product_group||'—')}</div>
        <div>${esc(p.product_table||'—')}</div>
        <div><span class="ipa75-pill">ATIVO</span></div>
        <div class="ipa75-action"><button type="button" class="ghost ipa75-toggle ${p.enabled?'on':'off'}" data-enabled="${p.enabled?'1':'0'}">${p.enabled?'✓ Usar no TechNET':'Fora do TechNET'}</button></div>
      </div>`).join(''):'<div class="ipa75-empty">Nenhum produto ATIVO encontrado com esses filtros.</div>';
      rowsEl.querySelectorAll('.ipa75-toggle').forEach(btn=>btn.onclick=()=>toggle(btn));
    }catch(e){rowsEl.innerHTML=`<div class="ipa75-empty">${esc(e?.message||e)}</div>`;toast(e?.message||String(e))}
  }

  async function toggle(btn){
    const row=btn.closest('.ipa75-row');if(!row)return;
    const next=btn.dataset.enabled!=='1';
    btn.disabled=true;btn.textContent=next?'Liberando…':'Removendo…';
    try{
      await rpc(sb,'tv_admin_set_imperium_product_enabled',{p_base:row.dataset.base,p_product_id:Number(row.dataset.id),p_enabled:next});
      toast(next?'Produto liberado para uso no TechNET.':'Produto retirado do catálogo do TechNET.');
      await load();
    }catch(e){toast(e?.message||String(e));btn.disabled=false;btn.textContent=next?'Fora do TechNET':'✓ Usar no TechNET'}
  }

  document.getElementById('ipa75Base').onchange=e=>{state.base=e.target.value;load()};
  document.getElementById('ipa75Filter').onchange=e=>{state.filter=e.target.value;load()};
  document.getElementById('ipa75Refresh').onclick=()=>load();
  document.getElementById('ipa75Search').oninput=e=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.search=e.target.value.trim();load()},280)};
  await load();
}
