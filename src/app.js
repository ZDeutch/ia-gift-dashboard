import {source,census,loadBundle} from './data.js?v=mtv3k6l4';
import {defaults,calculate,escapeHtml as esc,incomeLabel,compliance,recommendZips,growthProjection,budgetPlan,zipList as zips,MIN_RECIPIENTS,MIN_GIFT} from './model.js?v=mtv3k6l4';
import {mapStates} from './map-data.js?v=mtv3k6l4';
// The dashboard can run standalone, in an iframe, or inline in another page inside a shadow root.
const root=document.getElementById('ia-dashboard-host')?.shadowRoot||document.getElementById('ia-dashboard')||document;
const $=id=>root.querySelector('#'+id), money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(n), num=n=>new Intl.NumberFormat('en-US').format(n);
const query=new URLSearchParams(location.search);
const fromUrl={};for(const k of Object.keys(defaults)){if(!query.has(k)) continue;const v=query.get(k);fromUrl[k]=typeof defaults[k]==='number'?Number(v):v;}
if(fromUrl.zip) fromUrl.zip=String(fromUrl.zip).replace(/\D/g,'').slice(0,5);
if(fromUrl.zips) fromUrl.zips=[...new Set(String(fromUrl.zips).split(',').map(z=>z.replace(/\D/g,'')).filter(z=>z.length===5))].join(',');
if(Number.isFinite(fromUrl.claim)) fromUrl.claim=Math.max(0,Math.min(100,fromUrl.claim));
if(!(Number.isFinite(fromUrl.gift)&&fromUrl.gift>=MIN_GIFT&&fromUrl.gift<=1e6)) delete fromUrl.gift;
if(![5,7,10].includes(fromUrl.rate)) delete fromUrl.rate;
if(!(Number.isFinite(fromUrl.budget)&&fromUrl.budget>0&&fromUrl.budget<=1e12)) delete fromUrl.budget;
let scenario={...defaults,...fromUrl},toastTimer;
// Keep the scenario in the address bar so the current view can be shared as a link.
function syncUrl(){try{const q=new URLSearchParams(location.search);for(const k of Object.keys(defaults)){if(scenario[k]!==defaults[k]) q.set(k,String(scenario[k])); else q.delete(k);}const qs=q.toString();history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);}catch{}}
let data=null; // {index, states, rows} once the Census bundle has loaded
function compact(n,currency=false,html=false){const unit=n>=1e9?'B':n>=1e6?'M':n>=1e3?'K':'';const divisor=unit==='B'?1e9:unit==='M'?1e6:unit==='K'?1e3:1;const val=new Intl.NumberFormat('en-US',unit?{minimumFractionDigits:1,maximumFractionDigits:1}:{maximumFractionDigits:0}).format(n/divisor);return (currency?'$':'')+val+(html&&unit?`<span>${unit}</span>`:unit);}
function showToast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function fillOptions(id,entries,label,value){$(id).innerHTML=`<option value="">${label}</option>`+entries.map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');$(id).value=value;}
const stateName=abbr=>data?.states[abbr]?.name||abbr;
function syncControls(){
 for(const key of Object.keys(defaults)) if($(key)) $(key).value=scenario[key];
 $('zip-chips').innerHTML=zips(scenario).map(z=>`<button type="button" data-rm="${z}" aria-label="Remove ZIP ${z} from the selection">${z} <span aria-hidden="true">×</span></button>`).join('');
 root.querySelectorAll('#zip-chips [data-rm]').forEach(b=>b.onclick=()=>removeZip(b.dataset.rm));
 $('zip-add').hidden=scenario.zip.length!==5||zips(scenario).includes(scenario.zip);
 const ready=!!data;
 for(const key of ['state','zip','income']) $(key).disabled=!ready;
 if(!ready) return;
 fillOptions('state',Object.entries(data.states).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([k,v])=>[k,v.name]),'All of America',scenario.state);
 root.querySelectorAll('[data-gift]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.gift)===scenario.gift));
}
function setState(state=''){scenario={...scenario,state,county:'',city:'',zip:'',zips:''};syncControls();render();}
// Pinned ZIP selection: the search field finds a ZIP, "Add" pins it as a chip; the
// scenario covers the union of pinned ZIPs and the current search prefix.
function addZips(list){const cur=zips(scenario);for(const z of list) if(!cur.includes(z)) cur.push(z);scenario={...scenario,zips:cur.join(','),state:'',county:'',city:''};syncControls();render();}
function removeZip(z){scenario.zips=zips(scenario).filter(x=>x!==z).join(',');syncControls();render();}
// Toggling a ZIP from the list keeps the current state/county, so unpinning returns to
// the view you were browsing rather than jumping back to the whole country.
function toggleZip(z){const cur=zips(scenario);scenario={...scenario,zips:(cur.includes(z)?cur.filter(x=>x!==z):[...cur,z]).join(',')};syncControls();render();}
function pinSearchedZip(){if(scenario.zip.length!==5||zips(scenario).includes(scenario.zip)) return;const z=scenario.zip;scenario.zip='';addZips([z]);showToast(`ZIP ${z} added to the selection.`);}
// Map: every state in the bundle is selectable once the data has loaded.
$('us-map').innerHTML=mapStates.map(s=>`<path d="${s.path}" data-fips="${s.id}"><title>${s.name}</title></path>`).join('');
function activateMap(){
 const byFips=Object.fromEntries(Object.entries(data.states).map(([k,s])=>[s.fips,k]));
 root.querySelectorAll('#us-map path').forEach(p=>{
  const code=byFips[p.dataset.fips]; if(!code) return;
  p.classList.add('available');p.dataset.state=code;p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',`Filter to ${stateName(code)}`);p.setAttribute('aria-pressed','false');
  const pick=()=>setState(scenario.state===code?'':code);
  p.addEventListener('click',()=>{pick();p.blur();});p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});
  const show=()=>{$('map-tooltip').textContent=`${stateName(code)} · ${compact(lastResult?.byState[code]||0)} children reached`;$('map-tooltip').classList.add('visible');};
  p.addEventListener('mouseenter',show);p.addEventListener('focus',show);p.addEventListener('mouseleave',()=>$('map-tooltip').classList.remove('visible'));p.addEventListener('blur',()=>$('map-tooltip').classList.remove('visible'));
 });
}
let lastResult=null;
// The geography the ZIP list browses, ignoring pinned ZIPs.
const poolLabel=()=>scenario.zip?'ZIP '+scenario.zip+(scenario.zip.length<5?'…':''):scenario.city||scenario.county||(scenario.state?stateName(scenario.state):'');
const scopeLabel=()=>{const zl=zips(scenario);return zl.length?(zl.length===1&&!scenario.zip?'ZIP '+zl[0]:`${zl.length} selected ZIP${zl.length===1?'':'s'}${scenario.zip?' + '+scenario.zip+'…':''}`):scenario.zip?'ZIP '+scenario.zip+(scenario.zip.length<5?'…':''):scenario.city||scenario.county||(scenario.state?stateName(scenario.state):'United States');};
function render(){
 if(!data){renderLoading();return;}
 const r=lastResult=calculate(data.rows,scenario), local=!!(scenario.state||scenario.zip||scenario.zips);
 $('scope-name').textContent=scopeLabel();$('scope-sub').textContent=`Estimated reach of a ${money(scenario.gift)} gift for children ages ${scenario.minAge}–${scenario.maxAge}${local?` · ${num(r.zips)} ZIP code${r.zips===1?'':'s'}`:' nationwide'}`;
 $('reach').innerHTML=compact(r.reached,false,true);$('funding').innerHTML=compact(r.funding,true,true);$('gift-metric').textContent=money(scenario.gift);
 $('reach-note').textContent=`${scenario.claim}% of ${num(r.eligible)} children in qualifying ZIPs`;
 $('funding-note').textContent=`${money(scenario.gift)} for every child reached`;$('claim-note').textContent=`At a ${scenario.claim}% claim rate`;
 const g=growthProjection(scenario,r,scenario.rate/100);
 $('growth').innerHTML=compact(Math.round(g.perChild),true,true);
 $('growth-note').textContent=r.reached?`Average per child at 18 · ${compact(g.total,true)} total at ${scenario.rate}% growth`:`At ${scenario.rate}% annual growth`;
 // Budget-first planning: what the entered budget supports in the current scope.
 const bp=budgetPlan(scenario.budget,r);$('budget-plan').hidden=!bp;
 if(bp){
  if(!r.reached) $('budget-plan').innerHTML=`<strong>Budget ${money(bp.budget)}.</strong> No children are reached under these settings, so there is nothing to fund yet.`;
  else if(bp.funded){
   const over=r.funding>bp.budget;
   $('budget-plan').innerHTML=`<strong>Budget ${money(bp.budget)}.</strong> ${over?`The current ${money(scenario.gift)} gift needs ${money(r.funding)} — ${money(r.funding-bp.budget)} over budget.`:`The current plan uses ${money(r.funding)} of it.`} This budget supports up to ${money(bp.maxGift)} per child for the ${num(r.reached)} children reached.${bp.maxGift!==scenario.gift?` <button type="button" id="apply-budget">Set gift to ${money(bp.maxGift)}</button>`:''}`;
   const ab=$('apply-budget');if(ab) ab.onclick=()=>{scenario.gift=bp.maxGift;syncControls();render();};
  } else $('budget-plan').innerHTML=`<strong>Budget ${money(bp.budget)}.</strong> ${bp.budget<MIN_GIFT*MIN_RECIPIENTS?`A qualified program needs at least ${money(MIN_GIFT*MIN_RECIPIENTS)} — ${money(MIN_GIFT)} for each of ${num(MIN_RECIPIENTS)} children.`:`It cannot fund the ${money(MIN_GIFT)} minimum for all ${num(r.reached)} children reached. Narrow the scenario to at most ${num(bp.maxChildren)} children reached (keeping a class of at least ${num(MIN_RECIPIENTS)} eligible), or raise the budget.`}`;
 }
 // Section 530A floors: never present a scenario below them as a giftable program.
 const c=compliance(scenario,r);$('compliance').hidden=c.ok;
 if(!c.ok){
  const recs=c.classOk?[]:recommendZips(data.rows,scenario,r);
  const why=[];if(!c.classOk) why.push(`it covers ${num(r.eligible)} eligible children and Section 530A requires the gift be offered to at least ${num(MIN_RECIPIENTS)}`);if(!c.giftOk) why.push(`the gift is below the ${money(MIN_GIFT)} minimum per child`);
  const fix=[];if(!c.classOk) fix.push(recs.length?'add nearby ZIP codes below or widen the geography, age range, or income limit':'widen the geography, age range, or income limit');if(!c.giftOk) fix.push(`set the gift to at least ${money(MIN_GIFT)}`);
  const gap=recs.reduce((t,x)=>t+x.children,r.eligible);
  const recHtml=recs.length?`<div class="recs"><p>Nearby ZIP codes that would bring the class to ${num(gap)} children:</p>${recs.map(x=>`<button type="button" data-add="${x.zip}">+ ${x.zip} ${esc(x.city||x.county)}, ${x.state} · ${num(x.children)} children</button>`).join('')}${recs.length>1?`<button type="button" class="rec-all" data-add-all>Add all ${recs.length}</button>`:''}</div>`:'';
  $('compliance').innerHTML=`<strong>Not a qualified gift under these settings.</strong> This scenario cannot be offered as a Trump Account gift program under Section 530A and Treasury Notice 2025-68: ${why.join(', and ')}. To model a qualified gift, ${fix.join(' and ')}.${recHtml}`;
  root.querySelectorAll('#compliance [data-add]').forEach(b=>b.onclick=()=>addZips([b.dataset.add]));
  const all=root.querySelector('#compliance [data-add-all]');if(all) all.onclick=()=>addZips(recs.map(x=>x.zip));
 }
 const lit=scenario.state?new Set([scenario.state]):(scenario.zip||scenario.zips)?new Set(r.rows.map(x=>x.state)):new Set();
 // Choropleth: shade every state by children reached, in five quantile steps.
 const vals=Object.values(r.byState).filter(v=>v>0).sort((x,y)=>x-y);const qs=[.2,.4,.6,.8].map(q=>vals[Math.min(vals.length-1,Math.floor(q*vals.length))]||0);
 const shade=v=>!v?'q1':v<=qs[0]?'q1':v<=qs[1]?'q2':v<=qs[2]?'q3':v<=qs[3]?'q4':'q5';
 root.querySelectorAll('#us-map [data-state]').forEach(p=>{const on=lit.has(p.dataset.state);p.classList.remove('q1','q2','q3','q4','q5');p.classList.add(shade(r.byState[p.dataset.state]||0));p.classList.toggle('active',on);p.classList.toggle('dim',lit.size>0&&!on);p.setAttribute('aria-pressed',String(p.dataset.state===scenario.state));});
 $('map-heading').textContent=scenario.state?stateName(scenario.state):(scenario.zip||scenario.zips)&&lit.size?(lit.size===1?`${stateName([...lit][0])}`:`${lit.size} states`):'Children reached by state';
 $('map-sub').textContent=scenario.state?'Select the state again to return to the national view.':(scenario.zip||scenario.zips)?'States with matching ZIP codes are highlighted.':'Darker states have more children reached under the current settings. Select a state to focus the scenario.';
 // The list stays a picker: it shows every ZIP in the geography you are browsing, with the
 // pinned ones ticked, so several can be toggled in a row. The metrics and map above still
 // reflect the actual scenario, pins included.
 const pool=scenario.zips?calculate(data.rows,{...scenario,zips:''}):r;
 $('table-title').textContent=poolLabel()?`ZIP codes in ${poolLabel()}`:'ZIP codes in the scenario';
 syncUrl();
 if($('confirm-gift')) $('confirm-gift').href='./give.html'+location.search;
 renderLists(pool);
}
// ZIP list, as in the original report: switch between ZIPs that qualify under the income limit and ZIPs that
// do not, sorted by median family income (highest first, unpublished last). "Show more" reveals ten at a time.
const LIST_PAGE=10;let listKey='',listGroup='eligible',listShown=LIST_PAGE;
const byIncome=(x,y)=>(y.income??-1)-(x.income??-1)||x.zip.localeCompare(y.zip);
function renderLoading(){
 $('scope-name').textContent='United States';$('scope-sub').textContent='Loading Census data…';
 for(const id of ['reach','funding','growth']) $(id).textContent='…';
 $('zip-list').innerHTML='<div class="empty">Loading 33,772 ZIP Code Tabulation Areas…</div>';$('zip-more').hidden=true;
}
function renderLists(r){
 // Pagination resets when the browsed geography changes, but not when a ZIP is toggled —
 // pinning one should not throw you back to the first ten.
 const key=JSON.stringify([scenario.state,scenario.county,scenario.city,scenario.zip,scenario.income,scenario.minAge,scenario.maxAge]);
 if(key!==listKey){listKey=key;listShown=LIST_PAGE;}
 const groups={eligible:r.rows.filter(x=>x.eligible),ineligible:r.rows.filter(x=>!x.eligible)};
 $('eligible-count').textContent=num(groups.eligible.length);$('ineligible-count').textContent=num(groups.ineligible.length);
 root.querySelectorAll('.seg').forEach(b=>{const on=b.dataset.group===listGroup;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});
 const rows=groups[listGroup].sort(byIncome),n=Math.min(listShown,rows.length),eligible=listGroup==='eligible';
 const pinned=new Set(zips(scenario));
 const pin=z=>{const on=pinned.has(z);return `<td class="pin"><button type="button" data-pin="${z}" class="${on?'on':''}" aria-pressed="${on}" aria-label="${on?'Remove':'Add'} ZIP ${z} ${on?'from':'to'} your gift">${on?'✓':'+'}</button></td>`;};
 $('zip-list').innerHTML=rows.length?`<table class="zip-table"><thead><tr><th>ZIP code</th><th>Location</th><th class="num">Median family income</th><th class="num">${eligible?'Children reached':'Children'}</th><th><span class="sr-only">Include in gift</span></th></tr></thead><tbody>${rows.slice(0,n).map(x=>`<tr><td>${x.zip}</td><td>${esc(x.city||x.county)}, ${x.state}<small>${esc(x.city?x.county:stateName(x.state))}</small></td><td class="num">${incomeLabel(x.income,money)}</td><td class="num">${num(eligible?x.reached:Math.round(x.ageChildren))}</td>${pin(x.zip)}</tr>`).join('')}</tbody></table>`:`<div class="empty">${eligible?'No ZIP codes qualify under these settings.':'Every ZIP code in this view qualifies.'}</div>`;
 root.querySelectorAll('#zip-list [data-pin]').forEach(b=>b.onclick=()=>toggleZip(b.dataset.pin));
 const more=$('zip-more');more.hidden=n>=rows.length;more.textContent=`Show ${Math.min(LIST_PAGE,rows.length-n)} more · ${num(rows.length-n)} remaining`;
}
root.querySelectorAll('.seg').forEach(b=>b.onclick=()=>{listGroup=b.dataset.group;listShown=LIST_PAGE;if(lastResult)renderLists(lastResult);});
$('zip-more').onclick=()=>{listShown+=LIST_PAGE;if(lastResult)renderLists(lastResult);};
$('state').onchange=e=>setState(e.target.value);
$('zip').oninput=e=>{scenario.zip=e.target.value.replace(/\D/g,'').slice(0,5);scenario.state='';scenario.county='';scenario.city='';syncControls();render();};
$('zip').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();pinSearchedZip();}};
$('zip-add').onclick=pinSearchedZip;
$('income').onchange=e=>{scenario.income=Number(e.target.value);render();};
$('gift').oninput=e=>{const v=Number(e.target.value);if(e.target.value===''||!Number.isFinite(v)||v<MIN_GIFT||v>1000000){e.target.classList.add('invalid');e.target.setAttribute('aria-invalid','true');return;}e.target.classList.remove('invalid');e.target.removeAttribute('aria-invalid');scenario.gift=Math.round(v*100)/100;root.querySelectorAll('[data-gift]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.gift)===scenario.gift));render();};
$('gift').onchange=e=>{if(e.target.classList.contains('invalid')){e.target.value=scenario.gift;e.target.classList.remove('invalid');e.target.removeAttribute('aria-invalid');showToast('Enter a gift between $25 and $1,000,000 — Section 530A gifts give each child at least $25.');}};
root.querySelectorAll('[data-gift]').forEach(b=>b.onclick=()=>{scenario.gift=Number(b.dataset.gift);$('gift').classList.remove('invalid');$('gift').removeAttribute('aria-invalid');syncControls();render();});
$('reset').onclick=()=>{scenario={...defaults};listGroup='eligible';listShown=LIST_PAGE;$('gift').classList.remove('invalid');$('gift').removeAttribute('aria-invalid');syncControls();render();showToast('Scenario reset to the national view.');};
// Phones: the filters live in a full-screen sheet opened from the results header.
const workspace=root.querySelector('.workspace');
const setFilters=open=>{workspace.classList.toggle('filters-open',open);document.body.classList.toggle('ia-filters-open',open);$('filters-toggle').setAttribute('aria-expanded',String(open));if(!open)$('scope-name').scrollIntoView({block:'start'});};
$('filters-toggle').onclick=()=>setFilters(!workspace.classList.contains('filters-open'));
$('filters-done').onclick=()=>setFilters(false);
// Phones: once the masthead scrolls away, a slim bar with both marks pins to the top of the screen.
const mini=root.querySelector('.brandbar-mini'),masthead=root.querySelector('.brandbar');
if(mini&&masthead&&'IntersectionObserver' in window){new IntersectionObserver(([e])=>mini.classList.toggle('show',!e.isIntersecting&&e.boundingClientRect.top<0),{threshold:0}).observe(masthead);}

syncControls();render();
loadBundle().then(b=>{data=b;activateMap();syncControls();render();}).catch(err=>{console.error(err);$('zip-list').innerHTML='<div class="empty">The Census data bundle could not be loaded. Run <code>node scripts/prepare-data.mjs</code> and reload.</div>';});
// Embed mode: keep the host page's iframe sized to our content and ask it to scroll us into view when a dialog opens.
if(document.documentElement.classList.contains('embed')&&self!==top){
 const post=msg=>parent.postMessage({source:'ia-dashboard',...msg},'*');
 const height=()=>post({type:'height',height:document.documentElement.scrollHeight});
 new ResizeObserver(height).observe(document.body);window.addEventListener('load',height);height();
}
