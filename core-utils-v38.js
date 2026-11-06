export const ROLE_LABEL={consultant:'Consultor',supervisor:'Supervisor',backoffice:'BackOffice',admin:'Administrador'};
export const STATUS_LABEL={draft:'Rascunho',submitted:'Enviada',under_review:'Em análise',pending_correction:'Pendência',approved:'Aprovada',rejected:'Reprovada',sync_pending:'Aguardando sincronização',synced:'Sincronizada',cancelled:'Cancelada'};
export const escapeHtml=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
export const normalizeText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export const formatMoney=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const formatDateTime=v=>{if(!v)return '-';const raw=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const [y,m,d]=raw.split('-');return `${d}/${m}/${y}`}const dt=new Date(v);if(Number.isNaN(dt.getTime()))return raw;const parts=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(dt);const get=t=>parts.find(x=>x.type===t)?.value||'';const date=`${get('day')}/${get('month')}/${get('year')}`,time=`${get('hour')}:${get('minute')}:${get('second')}`;return time==='00:00:00'?date:`${date}, ${time}`};
export const formatDateOnly=v=>{if(!v)return '-';const raw=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const [y,m,d]=raw.split('-');return `${d}/${m}/${y}`}const dt=new Date(v);if(Number.isNaN(dt.getTime()))return raw;return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(dt)};
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const statusClass=s=>['approved','synced'].includes(s)?'green':['rejected','cancelled'].includes(s)?'red':['submitted','under_review','pending_correction','sync_pending'].includes(s)?'amber':'';
export function safeErrorMessage(err,fallback='Não foi possível concluir a operação'){
 const m=String(err?.message||err||'').replace(/\s+/g,' ').trim();
 return m.slice(0,220)||fallback;
}
