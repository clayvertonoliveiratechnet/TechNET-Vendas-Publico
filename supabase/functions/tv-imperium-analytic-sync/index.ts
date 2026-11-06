import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const HOST='www.sistemaimperium.com.br';
const BASES=['natal','fortaleza','mossoro','recife'] as const;
const PORTS:Record<string,number>={natal:212,fortaleza:596,mossoro:579,recife:599};
const CITY:Record<string,[string,string]>={
  natal:['Natal / Parnamirim','RN'],
  fortaleza:['Fortaleza','CE'],
  mossoro:['Mossoró','RN'],
  recife:['Recife','PE']
};
const COMPANY:Record<string,string>={natal:'VNA',fortaleza:'RDT',mossoro:'',recife:''};
const te=new TextEncoder(),td=new TextDecoder(),cp=new TextDecoder('windows-1252');
const ascii=(s:string)=>te.encode(s);
const concat=(...parts:Uint8Array[])=>{const n=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;for(const b of parts){out.set(b,p);p+=b.length}return out};
const u32=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b};
const i32=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,n,true);return b};
const f64=(n:number)=>{const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,n,true);return b};
const be16=(n:number)=>Uint8Array.of((n>>8)&255,n&255);
function utf16(s:string){const b=new Uint8Array(s.length*2),v=new DataView(b.buffer);for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);return b}
const vu=(s:string)=>concat(u32(8),u32(s.length),utf16(s));
const vi=(n:number)=>concat(u32(3),i32(n));
function ole(v:string){const d=new Date(v.replace(' ','T')+'Z'),base=Date.UTC(1899,11,30);if(Number.isNaN(d.getTime()))throw new Error('bad_date');return(d.getTime()-base)/86400000}
const vd=(s:string)=>concat(u32(7),f64(ole(s)));
const RP=Uint8Array.from([12,32,0,0,1,0,0,0]);
const ROW=Uint8Array.from([12,32,0,0,1,0,0,0,0,0,0,0,6,0,0,0]);
const TAIL=Uint8Array.from([16,0,5,2,0,0,0,0,192]);
const FETCH=Uint8Array.from([33,1,96,97,1,32]);
type Param={name:string,type:1|36,value:string};
function pvalue(p:Param){return p.type===36?vd(p.value):vu(p.value)}
function prow(p:Param){return concat(ROW,vu(p.name),pvalue(p),vi(p.type),vi(1),vi(0),vi(0),vi(0))}
function packet(provider:string,params:Param[]){const pr=ascii(provider),rows=params.map(prow),body=concat(RP,u32(0),u32(Math.max(0,params.length-1)),...rows),logical=concat(body,TAIL),declared=logical.length-8;return concat(Uint8Array.of(0x20+pr.length),pr,FETCH,Uint8Array.of(16),be16(declared),Uint8Array.of(2),logical)}
function wire(v:any):Uint8Array{if(v instanceof Uint8Array)return concat(ascii(`{\"data\":[${v.length},`),v,ascii(']}'));if(Array.isArray(v)){const a=[ascii('[')];v.forEach((x,i)=>{if(i)a.push(ascii(','));a.push(wire(x))});a.push(ascii(']'));return concat(...a)}if(v&&typeof v==='object'){const a=[ascii('{')];let i=0;for(const[k,x]of Object.entries(v)){if(i++)a.push(ascii(','));a.push(ascii(JSON.stringify(k)+':'),wire(x))}a.push(ascii('}'));return concat(...a)}return ascii(JSON.stringify(v))}
function push(a:number[],b:Uint8Array){for(const x of b)a.push(x)}
function replace(v:any,m:Map<string,Uint8Array>):any{if(typeof v==='string'&&m.has(v))return m.get(v);if(Array.isArray(v))return v.map(x=>replace(x,m));if(v&&typeof v==='object')for(const k of Object.keys(v))v[k]=replace(v[k],m);return v}
function decode(data:Uint8Array):{end:number,value:any}|null{const out:number[]=[],blobs=new Map<string,Uint8Array>();let started=false,depth=0,str=false,esc=false,i=0;while(i<data.length){const b=data[i];if(!started){if([32,9,10,13].includes(b)){out.push(b);i++;continue}if(b!==123)throw new Error('wire_invalid');started=true}if(str){out.push(b);if(esc)esc=false;else if(b===92)esc=true;else if(b===34)str=false;i++;continue}if(b===34){const txt=String.fromCharCode(...data.slice(i,Math.min(data.length,i+90))),m=txt.match(/^\"data\"\s*:\s*\[\s*(-?\d+)\s*,/);if(m){const len=Math.abs(Number(m[1])),s=i+m[0].length,e=s+len;if(e>data.length)return null;const mark=`__b${blobs.size}__`;blobs.set(mark,data.slice(s,e));for(let j=i;j<s;j++)out.push(data[j]);push(out,ascii(JSON.stringify(mark)));depth++;i=e;continue}}out.push(b);if(b===34)str=true;else if(b===123||b===91)depth++;else if(b===125||b===93){depth--;if(started&&depth===0)return{end:i+1,value:replace(JSON.parse(td.decode(Uint8Array.from(out))),blobs)}}i++}return null}
class Reader{pending=new Uint8Array(0);async read(c:Deno.Conn){for(;;){const d=decode(this.pending);if(d){this.pending=this.pending.slice(d.end);return d.value}const b=new Uint8Array(65536),n=await c.read(b);if(n===null)throw new Error('upstream_closed');this.pending=concat(this.pending,b.slice(0,n));if(this.pending.length>128*1024*1024)throw new Error('upstream_large')}}}
async function writeAll(c:Deno.Conn,b:Uint8Array){let p=0;while(p<b.length)p+=await c.write(b.slice(p))}
async function exact(c:Deno.Conn,n:number){const b=new Uint8Array(n);let p=0;while(p<n){const x=await c.read(b.subarray(p));if(x===null)throw new Error('upstream_closed');p+=x}return b}
async function req(c:Deno.Conn,r:Reader,method:string,params:any[]){await writeAll(c,wire({method,params}));return r.read(c)}
async function rawQuery(base:string,user:string,pass:string,start:string,end:string,timeout=45000){let c:Deno.Conn|undefined,t:any;try{c=await Deno.connect({hostname:HOST,port:PORTS[base],transport:'tcp'});t=setTimeout(()=>{try{c?.close()}catch{}},timeout);await writeAll(c,Uint8Array.of(5,5,5,5,5));const hello=await exact(c,5);if(hello.join(',')!=='6,0,0,0,0')throw new Error('bad_handshake');const r=new Reader();const connected=await req(c,r,'connect',[{DriverName:'DataSnap',DriverUnit:'Data.DBXDataSnap',Port:String(PORTS[base]),CommunicationProtocol:'tcp/ip',DatasnapContext:'datasnap/',DriverAssemblyLoader:'Borland.Data.TDBXClientDriverLoader,Borland.Data.DbxClientDriver,Version=24.0.0.0,Culture=neutral,PublicKeyToken=91d62ebb5b0d1b1b',HostName:HOST,DSAuthenticationUser:user,DSAuthenticationPassword:pass,UNLICENSED_DRIVERS:'0'}]);if(connected?.result?.[0]!==0)throw new Error('connect_rejected');const prepared=await req(c,r,'prepare',[-1,false,'DataSnap.ServerMethod','TDtmVendasServer.AS_GetRecords']),handle=Number(prepared?.result?.[0]?.handle?.[0]);if(!Number.isFinite(handle))throw new Error('prepare_failed');const any='%';const params:Param[]=[{name:'@DataIni',type:36,value:start},{name:'@DataFim',type:36,value:end},{name:'@IdParceira',type:1,value:any},{name:'@Setor',type:1,value:any},{name:'@Status',type:1,value:any},{name:'@Usuario',type:1,value:any},{name:'@Instalador',type:1,value:any},{name:'@Time',type:1,value:any},{name:'@IdCliente',type:1,value:any},{name:'@Proposta',type:1,value:any},{name:'@Contrato',type:1,value:any}];const executed=await req(c,r,'execute',[{handle:[handle]},packet('DspConPropostas',params)]);let blob=executed?.result?.[1]?.data?.[1];if(!(blob instanceof Uint8Array))throw new Error('dataset_missing');let expected=0;if(blob.length>=24&&blob[0]===0xc0&&blob[1]===0xc0&&blob[2]===0x62)expected=new DataView(blob.buffer,blob.byteOffset,blob.byteLength).getUint32(20,true)+28;let pieces=0;while(expected&&blob.length<expected){if(++pieces>96)throw new Error('fragmented_dataset');const more=await req(c,r,'more_blob',[handle,1,0,7,true,0]),chunk=more?.result?.[0]?.data?.[1];if(!(chunk instanceof Uint8Array)||!chunk.length)break;blob=concat(blob,chunk)}return blob}finally{if(t)clearTimeout(t);try{c?.close()}catch{}}}
function magic(b:Uint8Array){for(let i=0;i<=b.length-4;i++)if(b[i]===0x96&&b[i+1]===0x19&&b[i+2]===0xe0&&b[i+3]===0xbd)return i;return-1}
class MR{constructor(public b:Uint8Array,public p=0){}take(n:number){if(this.p+n>this.b.length)throw new Error('midas_truncated');const x=this.b.slice(this.p,this.p+n);this.p+=n;return x}u8(){return this.take(1)[0]}u16(){const x=this.take(2);return new DataView(x.buffer,x.byteOffset,2).getUint16(0,true)}u32(){const x=this.take(4);return new DataView(x.buffer,x.byteOffset,4).getUint32(0,true)}short(){return cp.decode(this.take(this.u8())).trim()}}
function sized(r:MR,s:number){return s===1?r.u8():s===2?r.u16():r.u32()}
function skipVal(r:MR,s:number,t:number){const vary=!!(t&64),arr=!!(t&128);if(arr){const n=r.u32();for(let i=0;i<n;i++)r.take(vary?sized(r,s):s)}else r.take(vary?sized(r,s):s)}
function skipProps(r:MR,n:number){for(let i=0;i<n;i++){r.short();const s=r.u16(),t=r.u16();skipVal(r,s,t)}}
function fieldInfo(b:Uint8Array){const m=magic(b);if(m<0)throw new Error('midas_magic');const dv=new DataView(b.buffer,b.byteOffset,b.byteLength),fc=dv.getUint16(m+12,true),decl=dv.getUint32(m+14,true),meta=dv.getUint16(m+22,true),r=new MR(b,m+24),f:any[]=[];for(let i=0;i<fc;i++){const name=r.short(),size=r.u16(),type=r.u16(),attr=r.u16(),pc=r.u16();skipProps(r,pc);f.push({name,size,type,base:type&63,vary:!!(type&64),array:!!(type&128),attr})}skipProps(r,r.u16());return{fc,decl,off:m+meta,f}}
function bcd(x:Uint8Array){if(x.length!==18)return 0;const precision=x[0],scale=x[1]&0x3f,neg=!!(x[1]&0x80);let digits='';for(const b of x.slice(2,18))digits+=String(b>>4)+String(b&15);digits=(precision?digits.slice(0,precision):'0')||'0';const n=Number(digits)/(10**scale);return neg?-n:n}
function one(r:MR,f:any){const size=f.base===5?18:f.base===17?16:(f.vary?sized(r,f.size):f.size),x=r.take(size),dv=new DataView(x.buffer,x.byteOffset,x.byteLength);if(f.base===1)return Number(BigInt.asIntN(size*8,BigInt('0x'+[...x].reverse().map(v=>v.toString(16).padStart(2,'0')).join('')||'0')));if([2,6,7].includes(f.base)){let n=0;for(let i=0;i<x.length;i++)n+=x[i]*2**(8*i);return n}if(f.base===3)return x.some(v=>v!==0);if(f.base===4)return size===4?dv.getFloat32(0,true):dv.getFloat64(0,true);if(f.base===5)return bcd(x);if(f.base===8&&size===8)return dv.getFloat64(0,true);if(f.base===9)return cp.decode(x).replace(/\0+$/,'').trim();if(f.base===10)return new TextDecoder('utf-16le').decode(x).replace(/\0+$/,'').trim();if(f.base===17){const y=dv.getUint16(0,true),mo=dv.getUint16(2,true),d=dv.getUint16(4,true),h=dv.getUint16(6,true),mi=dv.getUint16(8,true),s=dv.getUint16(10,true),ms=dv.getUint32(12,true);try{return new Date(Date.UTC(y,mo-1,d,h,mi,s,ms)).toISOString()}catch{return null}}return null}
function parseMidas(b:Uint8Array,max=20000){const x=fieldInfo(b),r=new MR(b,x.off),nb=Math.ceil(x.fc*2/8),rows:any[]=[];while(r.p<b.length&&rows.length<Math.min(x.decl,max)){const checkpoint=r.p;try{r.u8();const blanks=r.take(nb),row:any={};for(let i=0;i<x.f.length;i++){const blank=(blanks[Math.floor((i*2)/8)]>>((i*2)%8))&3;row[x.f[i].name]=blank?null:one(r,x.f[i])}rows.push(row)}catch{r.p=checkpoint;break}}return rows}
function clean(v:any){return String(v??'').replace(/�/g,'').replace(/\0/g,'').replace(/\s+/g,' ').trim()}
function key(v:any){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
function saleType(v:any){const k=key(v);if(k==='NOVA'||k==='NV'||k.includes('NOVA'))return'NV';if(k==='UP-PE'||k.includes('UP-PE'))return'UP-PE';if(k==='UP'||k==='UP-PN'||k.includes('UP-PN'))return'UP-PN';return clean(v).slice(0,40)||null}
function statusValue(v:any){const k=key(v);if(k.includes('CANCEL'))return'cancelled';if(k.includes('INSTAL'))return'synced';if(k.includes('REPROV'))return'rejected';if(k.includes('PENDENTE'))return'approved';if(k.includes('TRAT'))return'under_review';if(k.includes('NAO UTILIZAR'))return'cancelled';return'under_review'}
function ordinalDate(v:any){const n=Number(v);if(!Number.isFinite(n)||n<700000||n>900000)return null;const d=new Date((n-719163)*86400000);return d.toISOString().slice(0,10)}
function totalFromProducts(v:any){const s=clean(v);let total=0,m:RegExpExecArray|null;const re=/R\$\s*([0-9.]+(?:,[0-9]{1,2})?)/gi;while((m=re.exec(s))){const n=Number(m[1].replace(/\./g,'').replace(',','.'));if(Number.isFinite(n)&&n>0&&n<10000)total+=n}return Math.round(total*100)/100}
function officialSaleValue(v:any,products:any){if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<100000)return Math.round(v*100)/100;const raw=clean(v).replace(/R\$/gi,'').trim();if(raw){const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const n=Number(normalized);if(Number.isFinite(n)&&n>=0&&n<100000)return Math.round(n*100)/100}return totalFromProducts(products)}
function groupsFromProducts(v:any){const k=key(v),g:string[]=[];if(k.includes('VIRTUA')||k.includes('FIBRA')||k.includes('BANDA LARGA'))g.push('BANDA LARGA');if(k.includes('CHIP'))g.push('TELEFONIA MÓVEL');if(k.includes('TV'))g.push('TV');if(k.includes('FONE')||k.includes('TELEFONIA FIXA'))g.push('TELEFONIA FIXA');return [...new Set(g)].join(' + ')||null}
function payment(v:any){const k=key(v),raw=clean(v);if(k.includes('DCC')||k.includes('DEBIT'))return'DCC';if(k.includes('BOLETO'))return'BOLETO';return raw||null}
async function sha(s:string){const h=await crypto.subtle.digest('SHA-256',te.encode(s));return[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function localYmd(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),o:any={};for(const x of p)if(x.type!=='literal')o[x.type]=x.value;return`${o.year}-${o.month}-${o.day}`}
function shiftYmd(ymd:string,days:number){const[y,m,d]=ymd.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)}
function range(mode:string){const today=localYmd(),start=mode==='deep'?shiftYmd(today,-120):today.slice(0,8)+'01';return{start:start+' 00:00:00',end:today+' 23:59:59'}}
function normalize(base:string,r:any){const id=Number(r.IdVenda),contract=clean(r.Contrato),customer=clean(r.Nome);if(!Number.isFinite(id)||id<=0||!contract||!customer)return null;const install=ordinalDate(r.DataInstalacao),sold=install?`${install}T03:00:00.000Z`:(typeof r.DataCadastro==='string'?r.DataCadastro:(typeof r.DataStatus==='string'?r.DataStatus:null)),products=clean(r.Produtos),ptype=saleType(r.DescTipo||r.Tipo),total=officialSaleValue(r.ValorTotalVenda,products),[city,state]=CITY[base],now=new Date().toISOString();return{
 source_key:`${base}:${id}`,
 status:statusValue(r.Status),
 customer_name:customer,
 city_name:city,
 state,
 product_summary:ptype,
 total_value:total,
 notes:clean(r.Observacao)||null,
 imperium_sale_id:id,
 imperium_proposal:clean(r.Proposta)||null,
 imperium_contract:contract,
 imperium_status:clean(r.Status)||null,
 imperium_base_key:base,
 imperium_customer_id:Number.isFinite(Number(r.IdPessoaCliente))?Number(r.IdPessoaCliente):null,
 imperium_consultant_id:Number.isFinite(Number(r.IdPessoaUsuario))?Number(r.IdPessoaUsuario):null,
 imperium_consultant_name:clean(r.NomeAbreviado)||null,
 imperium_team_id:Number.isFinite(Number(r.IdTime))?Number(r.IdTime):null,
 imperium_team_name:clean(r.NomeTime)||null,
 imperium_raw:{analytic_direct:true,DataInstalacao:r.DataInstalacao,DataCadastro:r.DataCadastro,DataStatus:r.DataStatus,IdStatus:r.IdStatus,Setor:r.Setor,Tipo:r.Tipo,DescTipo:r.DescTipo,TipoValor:r.TipoValor,ValorTotalVenda:r.ValorTotalVenda,VIRTUA:r.VIRTUA,CHIP:r.CHIP,TV:r.TV,FONE:r.FONE,DCC:r.DCC,Produtos:r.Produtos,FormaPagamento:r.FormaPagamento,EnderecoCompleto:r.EnderecoCompleto,Bairro:r.Bairro,CPF:r.CPF,CNPJ:r.CNPJ,TelCel:r.TelCel,TelRes:r.TelRes,DiaVencimento:r.DiaVencimento,IdMarca:r.IdMarca},
 sold_at:sold,
 synced_at:now,
 real_product_summary:products||null,
 product_group_summary:groupsFromProducts(products),
 payment_method:payment(r.FormaPagamento),
 commercial_company:COMPANY[base]||null,
 commercial_leader:clean(r.NomeTime)||null,
 commercial_seller_name:clean(r.NomeAbreviado)||null,
 sale_type:ptype
}}
async function logRun(sb:any,status:string,start:number,base:string,read=0,written=0,error?:any){await sb.from('tv_imperium_cloud_runs').insert({worker:'analytic_direct',status,base_key:base,status_id:null,rows_read:read,rows_written:written,duration_ms:Date.now()-start,error_message:error?String(error?.message||error).slice(0,800):null})}
async function syncBase(sb:any,cred:any,base:string,mode:string){const started=Date.now(),rg=range(mode);try{const raw=await rawQuery(base,cred.username,cred.password,rg.start,rg.end,mode==='deep'?52000:45000),rows=parseMidas(raw);await sb.from('tv_imperium_cloud_state').upsert({state_key:`analytic_schema_${base}`,state_value:{fields:Object.keys(rows[0]||{}),updated_at:new Date().toISOString()},updated_at:new Date().toISOString()});const normalized=rows.map(r=>normalize(base,r)).filter(Boolean),totals={inserted:0,direct_updated:0,enriched:0,deleted:0,users:0};for(let i=0;i<normalized.length;i+=500){const q=await sb.rpc('tv_cloud_upsert_imperium_analytic_batch',{p_rows:normalized.slice(i,i+500)});if(q.error)throw q.error;const d=q.data||{};totals.inserted+=Number(d.inserted||0);totals.direct_updated+=Number(d.direct_updated||0);totals.enriched+=Number(d.enriched||0);totals.deleted+=Number(d.analytic_placeholders_deleted||0);totals.users+=Number(d.users||0)}const written=totals.inserted+totals.direct_updated+totals.enriched+totals.deleted;await logRun(sb,'ok',started,base,rows.length,written);return{ok:true,base,mode,range:rg,rows:rows.length,normalized:normalized.length,...totals}}catch(e){await logRun(sb,'error',started,base,0,0,e);return{ok:false,base,mode,error:String((e as any)?.message||e)}}}
async function authorized(req:Request,sb:any){const token=req.headers.get('x-technet-cloud-token')||'';if(!token)return false;const q=await sb.from('tv_imperium_cloud_state').select('state_value').eq('state_key','scheduler').maybeSingle(),want=String(q.data?.state_value?.cron_token_hash||'');return!!want&&(await sha(token))===want}
Deno.serve(async req0=>{if(req0.method!=='POST')return new Response('method',{status:405});const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!service)return new Response('config',{status:500});const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});if(!await authorized(req0,sb))return new Response('unauthorized',{status:401});let body:any={};try{body=await req0.json()}catch{}const mode=String(body.mode||'fast')==='deep'?'deep':'fast';const stateQ=await sb.from('tv_imperium_cloud_state').select('state_value').eq('state_key','scheduler').maybeSingle(),state=stateQ.data?.state_value||{};if(state.enabled!==true)return new Response(JSON.stringify({ok:true,skipped:'disabled'}),{headers:{'content-type':'application/json'}});const cr=await sb.rpc('tv_cloud_get_imperium_credential');if(cr.error||!cr.data?.username||!cr.data?.password)return new Response(JSON.stringify({ok:false,error:'credential_missing'}),{status:500,headers:{'content-type':'application/json'}});let bases:string[];if(mode==='deep'){const base=String(body.base||'').toLowerCase();if(!BASES.includes(base as any))return new Response('base',{status:400});bases=[base]}else bases=[...BASES];const results=await Promise.all(bases.map(b=>syncBase(sb,cr.data,b,mode)));return new Response(JSON.stringify({ok:results.every(x=>x.ok),mode,results}),{status:results.every(x=>x.ok)?200:207,headers:{'content-type':'application/json','cache-control':'no-store'}})});