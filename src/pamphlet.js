// Branded two-page pamphlet built from a dashboard scenario passed in the URL query string.
import {loadBundle,census,TOP_CODE} from './data.js';
import {defaults,calculate,escapeHtml as esc,incomeLabel,compliance,growthProjection,MIN_RECIPIENTS,MIN_GIFT} from './model.js';
import {mapStates} from './map-data.js';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const num=n=>new Intl.NumberFormat('en-US').format(Math.round(n));
const compact=(n,cur=false)=>{const u=n>=1e9?'B':n>=1e6?'M':n>=1e3?'K':'';const d=u==='B'?1e9:u==='M'?1e6:u==='K'?1e3:1;const v=new Intl.NumberFormat('en-US',{maximumFractionDigits:u?(cur?2:1):0}).format(n/d);return `${cur?'$':''}${v}<small>${u}</small>`;};
const moneyWords=n=>n>=1e9?`$${(n/1e9).toFixed(2)} billion`:n>=1e6?`$${(n/1e6).toFixed(1)} million`:money(n);
const words=n=>n>=1e6?`${(n/1e6).toFixed(1).replace(/\.0$/,'')} million`:num(n);
const q=new URLSearchParams(location.search);
const s={...defaults};for(const k of Object.keys(defaults)){if(!q.has(k)) continue;const v=q.get(k);s[k]=typeof defaults[k]==='number'?Number(v):v;}
s.zip=String(s.zip||'').replace(/\D/g,'').slice(0,5);
s.zips=[...new Set(String(s.zips||'').split(',').map(z=>z.replace(/\D/g,'')).filter(z=>z.length===5))].join(',');
const zl=s.zips?s.zips.split(','):[];
if(![5,7,10].includes(s.rate)) s.rate=7;
if(!(Number.isFinite(s.budget)&&s.budget>0&&s.budget<=1e12)) s.budget=0;
const today=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
$('date').textContent=`Prepared ${today}`;$('prepared').textContent=`Prepared ${today} with the Invest America gift planning dashboard · investamerica.org/dashboard`;
$('print').onclick=()=>window.print();
try{
 const {states,rows}=await loadBundle();
 const stateName=a=>states[a]?.name||a;
 const r=calculate(rows,s);
 const zipScope=zl.length?(zl.length===1&&!s.zip?`ZIP ${zl[0]}`:`${zl.length} selected ZIP codes`):s.zip?`ZIP ${s.zip}${s.zip.length<5?' prefix':''}`:'';
 const scope=zipScope||s.city||s.county||(s.state?stateName(s.state):'the United States');
 const inScope=zipScope||(s.city?`${s.city}, ${s.state}`:s.county?`${s.county}, ${s.state}`:scope);
 const limit=s.income>250000?'no income limit':`a ZIP median family income of ${money(s.income)} or less`;
 const ages=s.minAge===0&&s.maxAge===17?'all children under 18':`children ages ${s.minAge}–${s.maxAge}`;
 document.title=`Gift Planning Scenario · ${inScope}`;$('tb-title').textContent=`${inScope} · ${money(s.gift)} gift · ${s.claim}% claim rate`;
 $('headline').innerHTML=`A <em>${esc(money(s.gift))}</em> start for ${esc(words(r.reached))} children in ${esc(inScope)}.`;
 $('lede').textContent=`If every eligible child in ${inScope} received a ${money(s.gift)} gift into their Trump Account, the total commitment would be ${moneyWords(r.funding)}. The estimate covers ${ages} living in ZIP codes with ${limit}, and assumes ${s.claim}% of families claim the gift.`;
 // Section 530A floors: the printed document must not present a below-floor scenario as giftable.
 const c=compliance(s,r);
 if(!c.ok){const why=[];if(!c.classOk)why.push(`the class of ${num(r.eligible)} eligible children is below the ${num(MIN_RECIPIENTS)}-child minimum`);if(!c.giftOk)why.push(`the ${money(s.gift)} gift is below the ${money(MIN_GIFT)}-per-child minimum`);const el=$('compliance');el.hidden=false;el.textContent=`Not a qualified gift: under Section 530A and Treasury Notice 2025-68, this scenario cannot be offered as a Trump Account gift program because ${why.join(', and ')}. It is shown for planning only.`;}
 $('k-reach').innerHTML=compact(r.reached);$('k-reach-note').textContent=`${s.claim}% of ${num(r.eligible)} children in qualifying ZIP codes`;
 $('k-funding').innerHTML=compact(r.funding,true);$('k-funding-note').textContent=`${money(s.gift)} for every child reached`;
 $('k-gift').innerHTML=compact(s.gift,true);$('k-gift-note').textContent=`At a ${s.claim}% expected claim rate`;
 // Map
 const lit=s.state?new Set([s.state]):(s.zip||s.zips)?new Set(r.rows.map(x=>x.state)):new Set();const byFips=Object.fromEntries(Object.entries(states).map(([k,v])=>[v.fips,k]));
 $('map').innerHTML=mapStates.map(m=>{const code=byFips[m.id];return `<path d="${m.path}" class="${lit.has(code)?(s.zip&&!s.state?'zip':'on'):''}"><title>${esc(m.name)}</title></path>`;}).join('');
 $('map-title').textContent=s.state||s.zip||s.zips?(lit.size===1?stateName([...lit][0]):lit.size?`${lit.size} states`:'Geographic reach'):'Across America';
 $('map-sub').textContent=s.zips?`${num(r.zips)} selected ZIP code${r.zips===1?'':'s'}${s.zip?` and ZIP codes matching “${s.zip}”`:''}, highlighted by state.`:s.zip?`ZIP codes matching “${s.zip}” are highlighted by state.`:s.state?`${num(r.zips)} ZIP codes in ${inScope}; ${num(r.eligibleZips)} qualify under the income limit.`:`${num(r.zips)} ZIP Code Tabulation Areas across 50 states, DC and Puerto Rico.`;
 // Poverty
 const tot=r.poverty.reduce((a,b)=>a+b,0),labels=['In poverty','1–5× poverty level','Above 5× poverty level'],descs=['Below the federal poverty level','Between 1× and 5× the poverty level','More than 5× the poverty level'];
 $('pov-total').textContent=num(tot);
 $('stack').innerHTML=r.poverty.map((v,i)=>`<span class="c${i}" style="width:${tot?v/tot*100:0}%"></span>`).join('');
 $('pov-rows').innerHTML=r.poverty.map((v,i)=>`<div class="pov-row"><div><span class="lbl"><i class="c${i}"></i>${labels[i]}</span><strong>${num(v)}<small>${tot?(v/tot*100).toFixed(1):'0.0'}%</small></strong></div><p>${descs[i]}</p></div>`).join('');
 // Facts
 $('f-mfi').textContent=r.medianIncome===null?'—':incomeLabel(r.medianIncome,money);$('f-zips').textContent=num(r.zips);$('f-zips-note').textContent=`${num(r.eligibleZips)} within the income limit`;$('f-limit').textContent=s.income>250000?'None':money(s.income);
 const g=growthProjection(s,r,s.rate/100);
 $('f-growth').textContent=r.reached?money(Math.round(g.perChild)):'—';$('f-growth-note').textContent=`average per child, ${s.rate}% annual growth`;
 // Page 2 header scope
 $('scope-2').textContent=inScope;
 // Histogram
 const BANDS=[0,25e3,50e3,75e3,100e3,125e3,150e3,175e3,200e3,225e3];const bins=BANDS.map(lo=>({lo,ok:0,out:0}));const top={ok:0,out:0},na={ok:0,out:0};
 for(const x of r.rows){const t=x.income===null?na:x.income>=TOP_CODE?top:bins[Math.min(9,Math.floor(x.income/25e3))];t[x.eligible?'ok':'out']+=x.ageChildren;}
 const cols=[...bins,{lo:250001,top:true,...top},{na:true,...na}];
 const W=560,H=200,L=44,R=10,T=22,B=40,w=W-L-R,h=H-T-B,slot=w/cols.length,bw=slot*.7;
 const max=Math.max(1,...cols.map(c=>c.ok+c.out));const nice=v=>{const p=10**Math.floor(Math.log10(v)),m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;};const topV=nice(max/4)*4;const y=v=>T+h-v/topV*h;
 const fmt=v=>v>=1e6?(v/1e6).toFixed(v>=1e7?0:1)+'M':v>=1e3?Math.round(v/1e3)+'K':String(Math.round(v));
 let svg='<defs><linearGradient id="goldgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6d7ad"/><stop offset="1" stop-color="#b9954d"/></linearGradient></defs>'+[0,1,2,3,4].map(i=>{const v=topV/4*i;return `<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${fmt(v)}</text>`;}).join('');
 svg+=cols.map((c,i)=>{const x=L+slot*i+(slot-bw)/2,t=c.ok+c.out,yo=y(c.ok),yt=y(t);const label=c.na?'n/a':c.top?'$250K+':i%2===0?'$'+(c.lo/1e3)+'K':'';return `<rect class="out" x="${x}" y="${yt}" width="${bw}" height="${Math.max(0,yo-yt)}"/><rect class="${c.na?'na':'ok'}" x="${x}" y="${yo}" width="${bw}" height="${Math.max(0,T+h-yo)}" rx="1.5"/>${t?`<text class="val" x="${x+bw/2}" y="${yt-4}" text-anchor="middle">${fmt(t)}</text>`:''}<text x="${x+bw/2}" y="${H-B+14}" text-anchor="middle">${label}</text>`;}).join('');
 svg+=`<line class="axis" x1="${L}" x2="${W-R}" y1="${T+h}" y2="${T+h}"/>`;
 if(s.income<=250000){const idx=Math.min(10,s.income/25e3),lx=L+slot*idx;svg+=`<line class="limit" x1="${lx}" x2="${lx}" y1="${T-6}" y2="${T+h}"/><text class="limit-label" x="${lx+(idx>7?-5:5)}" y="${T-9}" text-anchor="${idx>7?'end':'start'}">Limit ${money(s.income)}</text>`;}
 svg+=`<text x="${L}" y="${H-6}">ZIP median family income</text>`;$('hist').innerHTML=svg;
 // Top ZIPs
 const topRows=r.rows.filter(x=>x.reached>0).sort((a,b)=>b.reached-a.reached).slice(0,10);const mx=topRows[0]?.reached||1;
 $('top').innerHTML=topRows.length?topRows.map(x=>`<li><b>${x.zip}</b><div class="place"><span>${esc(x.city||x.county)}, ${x.state} · ${incomeLabel(x.income,money)}</span><div class="track"><i style="width:${(x.reached/mx*100).toFixed(1)}%"></i></div></div><span class="val">${num(x.reached)}</span></li>`).join(''):'<li>No children reached under these settings.</li>';
 // Assumptions
 const rowsA=[['Geography',inScope],['State',s.state?stateName(s.state):'All states'],['County',s.county||'All counties'],['City',s.city||'All cities'],['ZIP codes',zl.length?(zl.length>10?`${zl.slice(0,10).join(', ')} +${zl.length-10} more`:zl.join(', '))+(s.zip?` and matching “${s.zip}”`:''):s.zip||'All ZIP codes'],['Maximum ZIP median family income',s.income>250000?'No limit':money(s.income)],['Ages',`${s.minAge}–${s.maxAge}`],['Gift per child',money(s.gift)],['Expected claim rate',`${s.claim}%`],['Assumed annual growth',`${s.rate}%`],...(s.budget?[['Total budget',money(s.budget)]]:[]),['Data',`${census.name.replace('U.S. Census Bureau, ','')}`],['Prepared',today]];
 $('assume').innerHTML=rowsA.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
}catch(err){console.error(err);$('headline').textContent='The Census data bundle could not be loaded.';$('lede').textContent=err.message;$('tb-title').textContent='Data unavailable';}
