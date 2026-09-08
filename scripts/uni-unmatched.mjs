// READ-ONLY: run every Zoho campus through the APP'S REAL matcher (copied from
// src/app/api/zoho/ticket/route.ts) to find which campuses the app can't resolve.
// Those are the ones that actually need an app entry. No writes.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---- exact copy of the app's matcher ----
const UNI_STOPWORDS = new Set(["university","universities","vishwavidyapeeth","vishwavidyalaya","vidyapeeth","deemed","the","of","and","college","institute","institutes","institution","technology","technologies","campus","school","for","advanced","studies","niat","nxtwave","to","be","is","at","in","an","by","on","or","as","a"]);
function uniTokens(s){return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter((t)=>t.length>1&&!UNI_STOPWORDS.has(t)&&!/^\d+$/.test(t)));}
const PREFIX_FILLER=new Set(["niat","nxtwave","the"]);
const segIsFiller=(seg)=>{const ts=seg.split(/\s+/).filter(Boolean);return ts.length>0&&ts.every((t)=>PREFIX_FILLER.has(t));};
function resolveUniversityId(raw,rows){const q=raw.trim();if(!q)return null;const lc=q.toLowerCase();const byCode=rows.find((r)=>r.code&&r.code.toLowerCase()===lc);if(byCode)return byCode.id;const segs=lc.split(" - ").map((s)=>s.trim()).filter(Boolean);const sig=segs.filter((s)=>!segIsFiller(s));const use=sig.length?sig:segs;const campus=use[0];const city=use.length>1?use[use.length-1]:"";const cityPick=(cands)=>{if(cands.length<=1)return cands[0]??null;if(city){const byCity=cands.find((r)=>(r.city&&r.city.toLowerCase()===city)||r.name.toLowerCase().includes(`(${city})`)||r.name.toLowerCase().includes(city));if(byCity)return byCity;}return cands[0];};const exact=rows.find((r)=>{const n=r.name.toLowerCase();return n===campus||n===lc;});if(exact)return exact.id;const qt=uniTokens(campus);if(qt.size===0)return null;let bestScore=0,bestRows=[];for(const r of rows){const rt=uniTokens(r.name);if(rt.size===0)continue;let inter=0;for(const t of qt)if(rt.has(t))inter++;if(inter===0)continue;const smaller=Math.min(qt.size,rt.size);const union=qt.size+rt.size-inter;const subset=inter===smaller;const jaccard=inter/union;if(!(subset||jaccard>=0.5))continue;const score=subset?1+inter:jaccard;if(score>bestScore){bestScore=score;bestRows=[r];}else if(score===bestScore){bestRows.push(r);}}return bestRows.length?cityPick(bestRows).id:null;}
// ----

const { data: unis } = await db.from("universities").select("id, code, name, city");
const rows = unis ?? [];
const byId = Object.fromEntries(rows.map((r) => [r.id, r.name]));

const cid = process.env.ZOHO_OAUTH_CLIENT_ID;
const accounts="https://accounts.zoho.in",api="https://www.zohoapis.in",owner="nxtwave",app="niat";
const tok=(await (await fetch(`${accounts}/oauth/v2/token?grant_type=refresh_token&client_id=${encodeURIComponent(cid)}&client_secret=${encodeURIComponent(process.env.ZOHO_OAUTH_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(process.env.ZOHO_OAUTH_REFRESH_TOKEN)}`,{method:"POST"})).json()).access_token;
const H={Authorization:`Zoho-oauthtoken ${tok}`};
const zj=await (await fetch(`${api}/creator/v2.1/data/${owner}/${app}/report/All_Campus_Details?field_config=all`,{headers:H})).json();
const names=[...new Set((zj.data||[]).map((c)=>c.Campus_Name||c.Campus_name||"").filter(Boolean))];

console.log(`Zoho campuses (unique): ${names.length}\n`);
const unmatched=[];
for(const zn of names){const id=resolveUniversityId(zn,rows);if(id){/*console.log(`  ✓ "${zn}" → ${byId[id]}`)*/}else unmatched.push(zn);}
console.log(`=== MATCHED by the app: ${names.length-unmatched.length}/${names.length} ===`);
console.log(`\n=== NOT matched (${unmatched.length}) — these need an app entry ===`);
for(const u of unmatched)console.log(`  · ${u}`);
