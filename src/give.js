// The confirmed-gift card: the dashboard's Confirm Gift button lands here with the full
// scenario in the query string, and this page renders it as one social-ready graphic —
// a navy card with the US map ghosted behind the numbers and the chosen states lit in
// gold. Canvas-rendered so downloads are pixel-identical to the preview.
import {loadBundle} from './data.js?v=mtv3k6l4';
import {defaults,calculate,compliance,growthProjection,zipList,MIN_RECIPIENTS} from './model.js?v=mtv3k6l4';
import {mapStates} from './map-data.js?v=mtv3k6l4';
const $=id=>document.getElementById(id);
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const num=n=>n.toLocaleString('en-US');
const heroNum=n=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,'')+' million':num(n);
const compactMoney=n=>n>=1e9?'$'+(n/1e9).toFixed(2).replace(/\.?0+$/,'')+'B':n>=1e6?'$'+(n/1e6).toFixed(1).replace(/\.0$/,'')+'M':money(n);
const NAVY='#102b52',GOLD='#c9a25a',GOLD_HI='#e6d7ad',WHITE='#ffffff',DIM='rgba(255,255,255,.75)',FAINT='rgba(255,255,255,.42)';
let toastTimer;const toast=t=>{$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2500);};

// Scenario from the URL — every dashboard key is honored; nothing is editable here.
const q=new URLSearchParams(location.search);
const s={...defaults};for(const k of Object.keys(defaults)){if(!q.has(k)) continue;const v=q.get(k);s[k]=typeof defaults[k]==='number'?Number(v):v;}
s.zip=String(s.zip||'').replace(/\D/g,'').slice(0,5);
s.zips=[...new Set(String(s.zips||'').split(',').map(z=>z.replace(/\D/g,'')).filter(z=>z.length===5))].join(',');
if(!(Number.isFinite(s.gift)&&s.gift>=25&&s.gift<=1e6)) s.gift=defaults.gift;
if(![5,7,10].includes(s.rate)) s.rate=7;

let data=null,result=null,ok=false,lit=new Set();
const stateName=a=>data?.states[a]?.name||a;
function placeName(){
 const zl=zipList(s);
 if(zl.length===1&&!s.zip) return 'ZIP '+zl[0];
 if(zl.length) return `${zl.length} ZIP codes`;
 if(s.zip) return 'ZIP '+s.zip+(s.zip.length<5?'…':'');
 return s.city||s.county||(s.state?stateName(s.state):'');
}

// ---- Card rendering ----
const logos=['./public/assets/trumpaccounts-gov-white.svg','./public/assets/invest-america-white.svg'].map(src=>{const i=new Image();i.src=src;return i;});
const logosReady=Promise.all(logos.map(i=>i.decode().catch(()=>{})));
// Layout: y positions as fractions of the card height, font sizes in px per format.
const LAYOUTS={
 sq:{W:1080,H:1080,inset:34,logoH:30,logos:.102,mapTop:.145,mapH:.385,hero:.468,heroSize:236,sub1:.535,sub1Size:54,sub2:.578,sub2Size:36,rule:.617,hook:.688,hookSize:44,hookValSize:66,meta:.738,metaSize:25,foot:.925,footSize:20},
 ls:{W:1200,H:675,inset:26,logoH:24,logos:.128,mapTop:.17,mapH:.50,hero:.50,heroSize:172,sub1:.60,sub1Size:42,sub2:.662,sub2Size:28,rule:.712,hook:.795,hookSize:36,hookValSize:52,meta:.858,metaSize:20,foot:.945,footSize:16},
 st:{W:1080,H:1920,inset:34,logoH:32,logos:.066,mapTop:.10,mapH:.225,hero:.298,heroSize:240,sub1:.336,sub1Size:54,sub2:.361,sub2Size:36,rule:.385,hook:.428,hookSize:44,hookValSize:68,meta:.457,metaSize:25,foot:.955,footSize:20},
};
function draw(cv,L){
 const {W,H}=L;const x=cv.getContext('2d');cv.width=W;cv.height=H;const cx=W/2;
 const F=n=>`400 ${n}px Cooper, Georgia, serif`,S=n=>`600 ${n}px Cooper, Georgia, serif`,B=n=>`700 ${n}px Cooper, Georgia, serif`;
 // Ground: deep navy gradient with a soft gold glow behind the hero figure.
 const bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0a1f3d');bg.addColorStop(.55,NAVY);bg.addColorStop(1,'#0b2242');
 x.fillStyle=bg;x.fillRect(0,0,W,H);
 const heroY=H*L.hero;
 const gl=x.createRadialGradient(cx,heroY-40,0,cx,heroY-40,W*.52);gl.addColorStop(0,'rgba(201,162,90,.16)');gl.addColorStop(1,'rgba(201,162,90,0)');
 x.fillStyle=gl;x.fillRect(0,0,W,H);
 // The country, ghosted; the chosen states lit in gold.
 const mapH=H*L.mapH,sc=mapH/610,mw=975*sc,ox=cx-mw/2,oy=H*L.mapTop;
 x.save();x.translate(ox,oy);x.scale(sc,sc);
 for(const m of mapStates){const p=new Path2D(m.path);x.fillStyle=lit.has(m.id)?'rgba(201,162,90,.42)':'rgba(255,255,255,.055)';x.fill(p);x.strokeStyle=lit.has(m.id)?'rgba(230,215,173,.55)':'rgba(255,255,255,.08)';x.lineWidth=(lit.has(m.id)?2:1)/sc;x.stroke(p);}
 x.restore();
 // Hairline frame.
 x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=2;
 x.beginPath();x.roundRect(L.inset,L.inset,W-2*L.inset,H-2*L.inset,18);x.stroke();
 x.textAlign='center';
 // Brand marks up top, where a masthead belongs.
 const lh=L.logoH,gap=22,ly=H*L.logos;
 const ws=logos.map(i=>i.naturalWidth?lh*i.naturalWidth/i.naturalHeight:0);
 if(ws.every(Boolean)){
  let lx=cx-(ws[0]+ws[1]+gap+10)/2;
  x.drawImage(logos[0],lx,ly-lh,ws[0],lh);lx+=ws[0]+gap;
  x.fillStyle=FAINT;x.beginPath();x.arc(lx,ly-lh/2,2.6,0,7);x.fill();lx+=gap-10;
  x.drawImage(logos[1],lx,ly-lh,ws[1],lh);
 } else {x.font=S(24);x.fillStyle=WHITE;x.fillText('TrumpAccounts.gov · Invest America',cx,ly);}
 const fit=(t,font,size,max)=>{for(;size>18;size-=4){x.font=font(size);if(x.measureText(t).width<=max) break;}return size;};
 const g=growthProjection(s,result,s.rate/100);
 const place=placeName();
 // Hero: children reached, gold, with a soft shadow lifting it off the map.
 const hero=heroNum(result.reached);
 fit(hero,B,L.heroSize,W-2*L.inset-90);
 x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=26;x.shadowOffsetY=6;
 const hg=x.createLinearGradient(0,heroY-L.heroSize,0,heroY);hg.addColorStop(0,GOLD_HI);hg.addColorStop(1,GOLD);
 x.fillStyle=hg;x.fillText(hero,cx,heroY);x.restore();
 // Who and where.
 fit(place?`children in ${place}`:'children across America',S,L.sub1Size,W-2*L.inset-110);
 x.fillStyle=WHITE;x.fillText(place?`children in ${place}`:'children across America',cx,H*L.sub1);
 x.font=F(L.sub2Size);x.fillStyle=DIM;x.fillText('could start life invested',cx,H*L.sub2);
 x.fillStyle=GOLD;x.fillRect(cx-46,H*L.rule,92,3);
 // What the money turns into — the value carries the line.
 const hookY=H*L.hook,val=money(g.perChild);
 const parts=[[`Your ${money(s.gift)} gift becomes `,S(L.hookSize),WHITE],[val,B(L.hookValSize),GOLD],[` by age 18`,S(L.hookSize),WHITE]];
 let hw=0;for(const [t,f] of parts){x.font=f;hw+=x.measureText(t).width;}
 let px=cx-hw/2;x.textAlign='left';
 for(const [t,f,c] of parts){x.font=f;x.fillStyle=c;x.fillText(t,px,hookY);px+=x.measureText(t).width;}
 x.textAlign='center';
 x.font=F(L.metaSize);x.fillStyle=FAINT;
 x.fillText(`${compactMoney(result.funding)} total commitment · ${s.claim}% claimed · ${s.rate}% annual growth`,cx,H*L.meta);
 // Footer rule + attribution.
 x.strokeStyle='rgba(255,255,255,.12)';x.lineWidth=1;
 x.beginPath();x.moveTo(cx-160,H*L.foot-34);x.lineTo(cx+160,H*L.foot-34);x.stroke();
 x.font=F(L.footSize);x.fillStyle=FAINT;
 x.fillText(`U.S. Census ACS 2020–2024 · ${location.host}${location.pathname.replace(/give\.html$/,'')}`,cx,H*L.foot);
 // A card below the Section 530A floors never ships without saying so.
 if(!ok){
  x.save();x.translate(cx,H/2);x.rotate(-.2);
  x.font=B(Math.min(64,W/17));x.fillStyle='rgba(204,48,29,.6)';
  x.fillText('Not a qualified gift — planning only',0,0);x.restore();
 }
}
function download(L,tag){
 const cv=document.createElement('canvas');draw(cv,L);
 cv.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`invest-america-${(placeName()||'america').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${tag}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);},'image/png');
}
$('dl-sq').onclick=()=>download(LAYOUTS.sq,'1080x1080');
$('dl-ls').onclick=()=>download(LAYOUTS.ls,'1200x675');
$('dl-st').onclick=()=>download(LAYOUTS.st,'1080x1920');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link copied.');}catch{toast(location.href);}};

// ---- Boot ----
try{
 const [b]=await Promise.all([loadBundle(),logosReady,document.fonts.load('700 100px Cooper'),document.fonts.load('600 50px Cooper'),document.fonts.load('400 40px Cooper')]);
 data=b;
 result=calculate(data.rows,s);
 if(s.state) lit=new Set([data.states[s.state]?.fips].filter(Boolean));
 else if(s.zip||s.zips) lit=new Set([...new Set(result.rows.map(r=>r.state))].map(a=>data.states[a]?.fips).filter(Boolean));
 const c=compliance(s,result);ok=c.ok;
 const place=placeName();
 $('g-sub').textContent=`A ${money(s.gift)} gift for every eligible child in ${place||'all of America'}.`;
 for(const id of ['dl-sq','dl-ls','dl-st']) $(id).disabled=!ok;
 $('notice').hidden=ok;
 if(!ok) $('notice').innerHTML=`<strong>Not a qualified gift yet.</strong> ${c.classOk?'':`This scenario covers ${num(result.eligible)} eligible children; Section 530A and Treasury Notice 2025-68 require a class of at least ${num(MIN_RECIPIENTS)}. `}${c.giftOk?'':'The gift is below the $25 minimum. '}<a href="./index.html${location.search}">Adjust your gift</a> — the dashboard suggests nearby ZIP codes to close the gap.`;
 draw($('card'),LAYOUTS.sq);
}catch(err){console.error(err);$('notice').hidden=false;$('notice').textContent='The Census data bundle could not be loaded.';}
