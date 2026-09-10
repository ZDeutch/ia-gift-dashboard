// Share-card page: three controls in, one social-ready graphic out. The card is rendered
// on canvas so the download is pixel-identical to the preview. Scenarios arrive via the
// same URL parameters as the dashboard, so its Share link hands a full scenario over;
// only place and gift are editable here — fine-tuning lives in the full dashboard.
import {loadBundle} from './data.js';
import {defaults,calculate,compliance,growthProjection,zipList,MIN_RECIPIENTS} from './model.js';
const $=id=>document.getElementById(id);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const num=n=>n.toLocaleString('en-US');
const heroNum=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,'')+' million':num(n);
const NAVY='#102b52',GOLD='#c9a25a',WHITE='#ffffff',DIM='rgba(255,255,255,.72)',FAINT='rgba(255,255,255,.45)';
let toastTimer;const toast=t=>{$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2500);};

// Scenario from the URL (all dashboard keys honored; only state/zip/zips/gift editable here)
const q=new URLSearchParams(location.search);
const s={...defaults};for(const k of Object.keys(defaults)){if(!q.has(k)) continue;const v=q.get(k);s[k]=typeof defaults[k]==='number'?Number(v):v;}
s.zip=String(s.zip||'').replace(/\D/g,'').slice(0,5);
s.zips=[...new Set(String(s.zips||'').split(',').map(z=>z.replace(/\D/g,'')).filter(z=>z.length===5))].join(',');
if(!(Number.isFinite(s.gift)&&s.gift>=25&&s.gift<=1e6)) s.gift=defaults.gift;
if(![5,7,10].includes(s.rate)) s.rate=7;
const syncUrl=()=>{try{const p=new URLSearchParams();for(const k of Object.keys(defaults)) if(s[k]!==defaults[k]) p.set(k,String(s[k]));const qs=p.toString();history.replaceState(null,'',location.pathname+(qs?'?'+qs:''));}catch{}};

let data=null,result=null,ok=false;
const stateName=a=>data?.states[a]?.name||a;
function placeName(){
 const zl=zipList(s);
 if(zl.length===1&&!s.zip) return 'ZIP '+zl[0];
 if(zl.length) return `${zl.length} ZIP codes`;
 if(s.zip) return 'ZIP '+s.zip+(s.zip.length<5?'…':'');
 return s.city||s.county||(s.state?stateName(s.state):'');
}

// ---- Card rendering ----
const logos=['./public/assets/invest-america-white.svg','./public/assets/trumpaccounts-gov-white.svg'].map(src=>{const i=new Image();i.src=src;return i;});
const logosReady=Promise.all(logos.map(i=>i.decode().catch(()=>{})));
function draw(cv,W,H){
 const x=cv.getContext('2d');cv.width=W;cv.height=H;
 const u=Math.min(W,H)/1080,cx=W/2,tall=H>W,wide=W>H;
 x.fillStyle=NAVY;x.fillRect(0,0,W,H);
 x.fillStyle=GOLD;x.fillRect(cx-56*u,H*(tall?.13:.105),112*u,4*u);
 x.textAlign='center';
 const fit=(t,weight,size,max)=>{for(;size>18;size-=4){x.font=`${weight} ${size}px Cooper, Georgia, serif`;if(x.measureText(t).width<=max) break;}return size;};
 const g=growthProjection(s,result,s.rate/100);
 const place=placeName();
 const hero=heroNum(result.reached);
 // Hero number, gold — the one thing a feed sees.
 fit(hero,700,(wide?190:220)*u,W-140*u);
 x.fillStyle=GOLD;x.fillText(hero,cx,H*(tall?.335:wide?.40:.36));
 // Who and where, white.
 const sub1=place?`children in ${place}`:'children across America';
 fit(sub1,600,52*u,W-160*u);x.fillStyle=WHITE;x.fillText(sub1,cx,H*(tall?.405:wide?.505:.445));
 x.font=`400 ${40*u}px Cooper, Georgia, serif`;x.fillStyle=DIM;x.fillText('could start life invested',cx,H*(tall?.445:wide?.575:.50));
 // The hook: what today's gift becomes at 18, value in gold.
 const hookSize=fit(`A ${money(s.gift)} gift today  ≈  ${money(g.perChild)} by age 18`,600,44*u,W-140*u);
 const parts=[[`A ${money(s.gift)} gift today  ≈  `,WHITE],[money(g.perChild),GOLD],[' by age 18',WHITE]];
 x.font=`600 ${hookSize}px Cooper, Georgia, serif`;
 const hookW=parts.reduce((t,p)=>t+x.measureText(p[0]).width,0);
 let px=cx-hookW/2;x.textAlign='left';const hy=H*(tall?.545:wide?.70:.60);
 for(const [t,c] of parts){x.fillStyle=c;x.fillText(t,px,hy);px+=x.measureText(t).width;}
 x.textAlign='center';
 // Totals, faint.
 x.font=`400 ${26*u}px Cooper, Georgia, serif`;x.fillStyle=FAINT;
 x.fillText(`${money(result.funding)} total commitment · ${s.claim}% claimed · ${s.rate}% annual growth`,cx,H*(tall?.585:wide?.765:.655));
 // Brand marks.
 const lh=34*u,gap=26*u,ly=H*(tall?.86:wide?.855:.82);
 const ws=logos.map(i=>i.naturalWidth?lh*i.naturalWidth/i.naturalHeight:0);
 if(ws.every(Boolean)){
  let lx=cx-(ws[0]+ws[1]+gap+8*u)/2;
  x.drawImage(logos[0],lx,ly-lh,ws[0],lh);lx+=ws[0]+gap;
  x.fillStyle=FAINT;x.beginPath();x.arc(lx,ly-lh/2,3*u,0,7);x.fill();lx+=gap-8*u;
  x.drawImage(logos[1],lx,ly-lh,ws[1],lh);
 } else {x.font=`600 ${28*u}px Cooper, Georgia, serif`;x.fillStyle=WHITE;x.fillText('Invest America · TrumpAccounts.gov',cx,ly);}
 x.font=`400 ${21*u}px Cooper, Georgia, serif`;x.fillStyle=FAINT;
 x.fillText(`U.S. Census ACS 2020–2024 · ${location.host}${location.pathname.replace(/give\.html$/,'')}`,cx,H*(tall?.905:wide?.925:.885));
 // A card below the Section 530A floors never ships without saying so.
 if(!ok){
  x.save();x.translate(cx,H/2);x.rotate(-.22);
  x.font=`700 ${64*u}px Cooper, Georgia, serif`;x.fillStyle='rgba(204,48,29,.55)';
  x.fillText('Not a qualified gift — planning only',0,0);x.restore();
 }
}
function redraw(){draw($('card'),1080,1080);}
function download(W,H,tag){
 const cv=document.createElement('canvas');draw(cv,W,H);
 cv.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`invest-america-${(placeName()||'america').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${tag}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);},'image/png');
}

// ---- State and controls ----
function update(){
 if(!data) return;
 result=calculate(data.rows,s);
 const c=compliance(s,result);ok=c.ok;
 for(const id of ['dl-sq','dl-ls','dl-st']) $(id).disabled=!ok;
 $('notice').hidden=ok;
 if(!ok) $('notice').innerHTML=`<strong>Not a qualified gift yet.</strong> ${c.classOk?'':`This scenario covers ${num(result.eligible)} eligible children; Section 530A and Treasury Notice 2025-68 require a class of at least ${num(MIN_RECIPIENTS)}. `}${c.giftOk?'':'The gift is below the $25 minimum. '}<a href="./index.html${location.search}">Open the full dashboard</a> for nearby-ZIP suggestions and fine-tuning.`;
 syncUrl();redraw();
}
$('state').onchange=e=>{s.state=e.target.value;s.county='';s.city='';s.zip='';s.zips='';$('zip').value='';update();};
$('zip').oninput=e=>{const z=e.target.value.replace(/\D/g,'').slice(0,5);e.target.value=z;s.zips=z.length===5?z:'';s.zip='';if(z){s.state='';s.county='';s.city='';$('state').value='';}update();};
$('gift').oninput=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=25&&v<=1e6){s.gift=Math.round(v);syncGift();update();}};
document.querySelectorAll('[data-gift]').forEach(b=>b.onclick=()=>{s.gift=Number(b.dataset.gift);$('gift').value=s.gift;syncGift();update();});
const syncGift=()=>document.querySelectorAll('[data-gift]').forEach(b=>b.classList.toggle('on',Number(b.dataset.gift)===s.gift));
$('dl-sq').onclick=()=>download(1080,1080,'1080x1080');
$('dl-ls').onclick=()=>download(1200,675,'1200x675');
$('dl-st').onclick=()=>download(1080,1920,'1080x1920');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link copied.');}catch{toast(location.href);}};

// ---- Boot ----
try{
 const [b]=await Promise.all([loadBundle(),logosReady,document.fonts.load('700 100px Cooper'),document.fonts.load('600 50px Cooper'),document.fonts.load('400 40px Cooper')]);
 data=b;
 $('state').innerHTML='<option value="">All of America</option>'+Object.entries(data.states).sort((a,c)=>a[1].name.localeCompare(c[1].name)).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');
 $('state').value=s.state;$('state').disabled=false;$('zip').disabled=false;
 const zl=zipList(s);if(zl.length===1&&!s.zip) $('zip').value=zl[0];
 $('gift').value=s.gift;syncGift();
 update();
}catch(err){console.error(err);$('notice').hidden=false;$('notice').textContent='The Census data bundle could not be loaded.';}
