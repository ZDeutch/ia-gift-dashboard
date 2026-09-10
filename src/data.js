// Loads the static Census bundle written by scripts/prepare-data.mjs (public/data/).
// Every demographic value in the app comes from that bundle: U.S. Census Bureau,
// American Community Survey 5-Year Estimates 2020-2024, tables B01001, B17024 and B19113
// at the ZIP Code Tabulation Area (ZCTA) level, joined to counties and places with the
// 2020 ZCTA relationship files. Nothing here is invented or sampled.
export const source={url:'https://investamerica.org/dashboard/',observed:'September 7, 2026'};
export const census={name:'U.S. Census Bureau, American Community Survey 5-Year Estimates, 2020–2024',tables:'B01001, B17024, B19113',url:'https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html'};
// ACS publishes children in age bands, not single years. B01001 population bands are kept in
// the bundle for reference; the app reports the B17024 poverty universe, like the public dashboard.
export const AGE_BANDS=[[0,4],[5,9],[10,14],[15,17]];
export const POVERTY_BANDS=[[0,5],[6,11],[12,17]];
export const TOP_CODE=250001; // Census reports "$250,000 or more" as 250001
// Resolved against this module's own URL so the app works from any page that loads it (standalone, iframe, or inline in WordPress).
export const APP_BASE=new URL('../',import.meta.url).href;
const DATA_BASE=APP_BASE+'public/data/';

export async function loadBundle(fetcher=(p=>fetch(p)),base=DATA_BASE){
 const index=await (await fetcher(base+'index.json')).json();
 const files=await Promise.all(index.states.map(s=>fetcher(`${base}states/${s.abbr}.json`).then(r=>r.json())));
 const rows=[],states={};
 for(const f of files){
  states[f.state]={name:f.name,fips:f.fips};
  for(const r of f.rows) rows.push({zip:r[0],state:f.state,county:f.counties[r[1]],city:r[2]>=0?f.cities[r[2]]:'',income:r[3],ages:r.slice(4,8),poverty:r.slice(8,17)});
 }
 return {index,states,rows};
}
