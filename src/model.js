import {source,census,POVERTY_BANDS,TOP_CODE} from './data.js?v=mtv3k6l4';
export const defaults={state:'',county:'',city:'',zip:'',zips:'',income:250000,minAge:0,maxAge:17,claim:100,gift:250,rate:7,budget:0};
// `zip` is the search prefix; `zips` is a comma-separated set of exact ZIP codes the user
// has pinned. When either is present the scenario covers their union.
export const zipList=s=>s.zips?String(s.zips).split(',').filter(Boolean):[];
// Section 530A and Treasury Notice 2025-68 set two floors for a charitable
// gift program into Trump Accounts: the gift must be offered to a class of at least
// 5,000 eligible children, and each child must receive at least $25. The class test
// applies to eligible children (who the gift is offered to), not the claim-rate estimate.
export const MIN_RECIPIENTS=5000,MIN_GIFT=25;
export const compliance=(s,r)=>{const classOk=r.eligible>=MIN_RECIPIENTS,giftOk=(Number(s.gift)||0)>=MIN_GIFT;return {classOk,giftOk,ok:classOk&&giftOk};};
// ZCTAs whose median family income the Census suppressed (null) stay in the scenario,
// matching the public dashboard's reconciled default. Top-coded ZCTAs ($250,000 or more)
// only qualify when the limit is above $250,000.
export const withinIncome=(income,limit)=>income===null||income<=limit;
// Ages: the ACS poverty table publishes children in three bands (under 6, 6-11, 12-17). A
// single-year age range takes an even share of each band it overlaps. The public dashboard
// spreads its total evenly over all 18 years; this is the same idea applied per band.
export const bandShare=(b,minAge,maxAge)=>{const lo=Math.max(b[0],minAge),hi=Math.min(b[1],maxAge);return hi<lo?0:(hi-lo+1)/(b[1]-b[0]+1);};
export const bandShares=(minAge,maxAge)=>POVERTY_BANDS.map(b=>bandShare(b,minAge,maxAge));
// Children in a ZIP for the age range: the poverty-universe count (children for whom poverty
// status is determined), which is the universe the public dashboard reports.
export const childrenIn=(r,shares)=>shares.reduce((t,s,i)=>s?t+(r.poverty[i*3]+r.poverty[i*3+1]+r.poverty[i*3+2])*s:t,0);
// Split a rounded total into three integers that sum exactly to it, proportional to weights.
export const splitExact=(total,w)=>{const sum=w[0]+w[1]+w[2];if(!sum||!total) return [0,0,0];const raw=w.map(x=>total*x/sum);const out=raw.map(Math.floor);let left=total-out[0]-out[1]-out[2];const order=raw.map((x,i)=>[x-out[i],i]).sort((a,b)=>b[0]-a[0]);for(let k=0;left>0;k++,left--) out[order[k%3][1]]++;return out;};
export function calculate(rows,s){
 const claim=Math.max(0,Math.min(100,Number(s.claim)||0))/100;
 const gift=Math.max(0,Number(s.gift)||0);
 const shares=bandShares(s.minAge,s.maxAge);
 const out=[],byState={},incomes=[];const pov=[0,0,0],ageBands=[0,0,0];
 const zipSet=s.zips?new Set(zipList(s)):null;
 let eligible=0,reached=0,eligibleZips=0;
 for(const r of rows){
  if((s.state&&r.state!==s.state)||(s.county&&r.county!==s.county)||(s.city&&r.city!==s.city)) continue;
  if((s.zip||zipSet)&&!((zipSet&&zipSet.has(r.zip))||(s.zip&&r.zip.startsWith(s.zip)))) continue;
  const ageChildren=childrenIn(r,shares);
  const ok=withinIncome(r.income,s.income);
  const rc=ok?Math.round(ageChildren*claim):0;
  out.push({...r,eligible:ok,ageChildren,reached:rc});
  if(!ok) continue;
  eligible+=ageChildren;reached+=rc;eligibleZips++;
  byState[r.state]=(byState[r.state]||0)+rc;
  if(r.income!==null) incomes.push(r.income);
  shares.forEach((sh,i)=>{if(!sh) return;let t=0;for(let b=0;b<3;b++){pov[b]+=r.poverty[i*3+b]*sh;t+=r.poverty[i*3+b];}ageBands[i]+=t*sh;});
 }
 const poverty=splitExact(reached,pov);
 incomes.sort((a,b)=>a-b);
 const medianIncome=incomes.length?incomes[Math.floor(incomes.length/2)]:null; // median of ZIP medians
 return {eligible:Math.round(eligible),reached,funding:reached*gift,poverty,rows:out,byState,medianIncome,zips:out.length,eligibleZips,ageBands};
}
// Compound the gift to each child's 18th birthday. Children are weighted by the
// scenario's per-band totals spread evenly over the single ages in range (the same
// even-share convention the reach model uses), so the factor is the weighted average
// of (1+rate)^(years to 18). The growth rate is a labeled assumption, like the claim rate.
export function growthProjection(s,r,rate){
 const gift=Number(s.gift)||0;
 if(!r.reached||gift<=0) return {factor:1,perChild:0,total:0};
 let w=0,f=0;
 POVERTY_BANDS.forEach((b,i)=>{
  const lo=Math.max(b[0],s.minAge),hi=Math.min(b[1],s.maxAge);
  if(hi<lo||!r.ageBands[i]) return;
  const per=r.ageBands[i]/(hi-lo+1);
  for(let a=lo;a<=hi;a++){w+=per;f+=per*Math.pow(1+rate,18-a);}
 });
 const factor=w?f/w:1;
 return {factor,perChild:gift*factor,total:r.funding*factor};
}
// Budget-first planning: the largest whole-dollar gift the budget funds for every child
// reached, and the most children a qualified $25 gift could cover. null when no budget.
export const budgetPlan=(budget,r)=>{
 const b=Math.floor(Math.max(0,Number(budget)||0));if(!b) return null;
 const maxGift=r.reached?Math.min(1e6,Math.floor(b/r.reached)):0;
 return {budget:b,maxGift,maxChildren:Math.floor(b/MIN_GIFT),funded:maxGift>=MIN_GIFT};
};
// Nearby ZIP codes that would lift a too-small ZIP scenario to the Section 530A class
// minimum. The bundle carries no coordinates, so "nearby" prefers ZIPs in a county the
// scenario already touches, then the smallest numeric ZIP distance to a selected ZIP —
// ZIP numbering clusters geographically, which is close enough for a recommendation.
// Candidates must meet the income limit and have children in the selected ages. Capped
// at 20 so the UI stays usable; a still-short total just leaves the scenario flagged.
export function recommendZips(rows,s,r){
 if(r.eligible>=MIN_RECIPIENTS) return [];
 const anchors=[...zipList(s),...(s.zip?[s.zip.padEnd(5,'0')]:[])].map(Number).filter(Number.isFinite);
 if(!anchors.length) return [];
 const inScope=new Set(r.rows.map(x=>x.zip)),counties=new Set(r.rows.map(x=>x.county)),states=new Set(r.rows.map(x=>x.state));
 const shares=bandShares(s.minAge,s.maxAge),cands=[];
 for(const row of rows){
  if(inScope.has(row.zip)||!withinIncome(row.income,s.income)) continue;
  const kids=Math.round(childrenIn(row,shares));if(!kids) continue;
  const dist=Math.min(...anchors.map(a=>Math.abs(Number(row.zip)-a)));
  cands.push({zip:row.zip,city:row.city,county:row.county,state:row.state,children:kids,key:(counties.has(row.county)&&states.has(row.state)?0:1e6)+dist});
 }
 cands.sort((a,b)=>a.key-b.key||b.children-a.children);
 const out=[];let total=r.eligible;
 for(const c of cands){if(total>=MIN_RECIPIENTS||out.length>=20) break;out.push(c);total+=c.children;}
 return out;
}
export const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const incomeLabel=(v,fmt=n=>'$'+n.toLocaleString('en-US'))=>v===null?'Not published':v>=TOP_CODE?fmt(250000)+'+':fmt(v);
export function toCsv(s,result){
 const row=arr=>arr.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
 const c=compliance(s,result);
 const g=growthProjection(s,result,(Number(s.rate)||7)/100);
 const lines=[['Invest America gift planning scenario'],['Data source',`${census.name} (tables ${census.tables}), ZIP Code Tabulation Area level`],['Source documentation',census.url],['Reference dashboard',source.url],['State',s.state||'All'],['County',s.county||'All'],['City',s.city||'All'],['ZIP prefix',s.zip||'All'],['Selected ZIP codes',s.zips?zipList(s).join(' '):'None'],['Minimum age',s.minAge],['Maximum age',s.maxAge],['Maximum ZIP median family income',s.income],['Gift per child',s.gift],['Claim rate percent',s.claim],['Assumed annual growth rate percent',s.rate??7],['Total budget',s.budget||'None'],['Meets Section 530A minimum class of 5,000 eligible children',c.classOk?'Yes':'No'],['Meets Section 530A minimum gift of $25 per child',c.giftOk?'Yes':'No'],['Children in qualifying ZIPs',result.eligible],['Estimated children reached',result.reached],['Estimated funding',result.funding],['Projected average value per child at 18',Math.round(g.perChild)],['Projected total value at 18',Math.round(g.total)],['Below poverty level',result.poverty[0]],['1 to 5 times poverty level',result.poverty[1]],['Above 5 times poverty level',result.poverty[2]]];
 lines.push([],['ZIP code','State','City','County','ZIP median family income','Children in age range','Meets income threshold','Estimated children reached'],...result.rows.map(r=>[r.zip,r.state,r.city,r.county,r.income===null?'Not published':r.income>=TOP_CODE?'250000+':r.income,Math.round(r.ageChildren),r.eligible?'Yes':'No',r.reached]));
 return lines.map(row).join('\r\n');
}
