const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const n=v=>Number(v||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dec=v=>n(v).toLocaleString('pt-BR',{minimumFractionDigits:Number.isInteger(n(v))?0:1,maximumFractionDigits:1});
const pct=(value,target)=>target>0?Math.min(999,Math.round(value*100/target)):0;

function goalCell(label,value,sub='',cls=''){
  return `<div class="stp113-goal-cell ${cls}"><span>${label}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`;
}

function consultantRows(rows,money){
  if(!rows.length)return '<tr><td colspan="8"><div class="stp113-empty">Nenhuma venda instalada encontrada para os filtros selecionados.</div></td></tr>';
  return rows.map((row,index)=>{
    const trend=n(row.trend_virtua),daily=n(row.daily_virtua),virtua=n(row.virtua);
    return `<tr>
      <td class="stp113-consultant"><i>${index+1}</i><span><b>${esc(row.consultant||'Sem consultor')}</b><small>${n(row.installed_sales)} venda${n(row.installed_sales)===1?'':'s'} instalada${n(row.installed_sales)===1?'':'s'}</small></span></td>
      <td class="stp113-money">${money(n(row.revenue))}</td>
      <td><strong>${virtua}</strong></td>
      <td>${n(row.mobile)}</td>
      <td>${n(row.tv)}</td>
      <td>${n(row.phone)}</td>
      <td><span class="stp113-rate">${dec(daily)}</span></td>
      <td><span class="stp113-trend ${trend>virtua?'up':''}">${dec(trend)}</span></td>
    </tr>`;
  }).join('');
}

export async function renderSupervisorTeamPulse(ctx={}){
  const {sb,host,profile,money,filters={}}=ctx;
  if(!host||profile?.role!=='supervisor')return;
  host.innerHTML='<section class="stp113-shell"><div class="stp113-loading">Carregando acompanhamento da equipe…</div></section>';

  const args={
    p_base:filters.base||null,
    p_sale_type:filters.saleType||null,
    p_month:Number(filters.month)||null,
    p_year:Number(filters.year)||null,
    p_day_from:Number(filters.dayFrom)||1,
    p_day_to:Number(filters.dayTo)||31
  };

  let data;
  try{
    const result=await sb.rpc('tv_supervisor_team_pulse',args);
    if(result.error)throw result.error;
    data=result.data||{};
  }catch(error){
    console.warn('supervisor team pulse',error);
    host.innerHTML='<section class="stp113-shell"><div class="stp113-empty">Não foi possível carregar o acompanhamento detalhado da equipe agora.</div></section>';
    return;
  }

  const team=data.team||{},period=data.period||{},goal=data.goal||{},summary=data.summary||{},consultants=Array.isArray(data.consultants)?data.consultants:[];
  const virtua=n(summary.virtua),virtuaTarget=n(goal.virtua_target),revenue=n(summary.revenue),revenueTarget=n(goal.revenue_target);
  const virtuaPct=pct(virtua,virtuaTarget),revenuePct=pct(revenue,revenueTarget),monthName=MONTHS[Math.max(0,n(period.month)-1)]||'Período';
  const periodLabel=`${String(period.day_from||1).padStart(2,'0')}–${String(period.day_to||31).padStart(2,'0')} · ${monthName} / ${n(period.year)}`;
  const goalConfigured=virtuaTarget>0||revenueTarget>0;

  host.innerHTML=`<section class="stp113-shell">
    <header class="stp113-head">
      <div>
        <span class="stp113-kicker">ACOMPANHAMENTO DA EQUIPE</span>
        <h2>${esc(team.team_name||team.supervisor_name||'Minha equipe')}</h2>
        <p>Vendas instaladas e produtos reais no período filtrado. Escopo restrito à sua supervisão.</p>
      </div>
      <div class="stp113-period"><b>${esc(periodLabel)}</b><small>${n(period.workdays_elapsed)} dias úteis considerados · ${n(period.workdays_remaining)} restantes</small></div>
    </header>

    <div class="stp113-scoreboard">
      <div class="stp113-score-labels"><span></span><b>META</b><b>REAL</b><b>RESTA</b><b>NEC./DIA</b></div>
      <div class="stp113-score-row">
        <strong>VIRTUA</strong>
        ${goalCell('Meta',virtuaTarget?virtuaTarget.toLocaleString('pt-BR'):'—',goalConfigured?`${virtuaPct}% realizado`:'Meta não definida','target')}
        ${goalCell('Real',virtua.toLocaleString('pt-BR'),`${n(summary.installed_sales)} vendas instaladas`,'real')}
        ${goalCell('Resta',virtuaTarget?n(summary.virtua_remaining).toLocaleString('pt-BR'):'—','','remaining')}
        ${goalCell('Nec./dia',virtuaTarget?dec(summary.virtua_need_day):'—',`ritmo atual: ${dec(summary.daily_virtua)}/dia`,'need')}
      </div>
      <div class="stp113-score-row revenue">
        <strong>RECEITA</strong>
        ${goalCell('Meta',revenueTarget?money(revenueTarget):'—',goalConfigured?`${revenuePct}% realizado`:'Meta não definida','target')}
        ${goalCell('Real',money(revenue),'receita das instaladas','real')}
        ${goalCell('Resta',revenueTarget?money(summary.revenue_remaining):'—','','remaining')}
        ${goalCell('Nec./dia',revenueTarget?money(summary.revenue_need_day):'—','até o fechamento do mês','need')}
      </div>
    </div>

    <div class="stp113-mix" aria-label="Mix de produtos instalados da equipe">
      <div><span>Banda larga</span><b>${virtua}</b><small>Virtua</small></div>
      <div><span>Telefonia móvel</span><b>${n(summary.mobile)}</b><small>chips</small></div>
      <div><span>TV</span><b>${n(summary.tv)}</b><small>produtos</small></div>
      <div><span>Fone</span><b>${n(summary.phone)}</b><small>produtos</small></div>
      <div class="trend"><span>Tendência Virtua</span><b>${dec(summary.trend_virtua)}</b><small>projeção para ${n(period.workdays_total)} dias úteis</small></div>
    </div>

    <div class="stp113-table-head">
      <div><span>PRODUÇÃO POR CONSULTOR</span><h3>Desempenho individual</h3></div>
      <small>Ordenado por Virtua instalada e receita</small>
    </div>
    <div class="stp113-table-wrap">
      <table class="stp113-table">
        <thead><tr><th>Consultor</th><th>Receita</th><th>Virtua</th><th>Móvel</th><th>TV</th><th>Fone</th><th>Prod. diária</th><th>Tendência</th></tr></thead>
        <tbody>${consultantRows(consultants,money)}</tbody>
        <tfoot><tr><td><b>TOTAL DA EQUIPE</b></td><td><b>${money(revenue)}</b></td><td><b>${virtua}</b></td><td><b>${n(summary.mobile)}</b></td><td><b>${n(summary.tv)}</b></td><td><b>${n(summary.phone)}</b></td><td><b>${dec(summary.daily_virtua)}</b></td><td><b>${dec(summary.trend_virtua)}</b></td></tr></tfoot>
      </table>
    </div>
  </section>`;
}
