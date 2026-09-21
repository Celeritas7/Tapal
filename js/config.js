/* Parcel labels — config, auth, Supabase REST
   Loaded in order from index.html; plain scripts sharing one global scope. */

/* ---------- config ---------- */
const SUPABASE_URL = "https://wylxvmkcrexwfpjpbhyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_e3pDOuxIdstaC7s0a680kQ_R10TrAyv";

/* Talks to PostgREST directly — no SDK, no CDN import, one less thing to fail. */
const REST = SUPABASE_URL + "/rest/v1/";
const AUTH = SUPABASE_URL + "/auth/v1/";

/* ---------- auth (magic link, no SDK) ---------- */
const SKEY = "tapal-session";
let session = null;
let role = null;   /* admin | operator | viewer, from authentication_mode_user_roles */
const canWrite = () => !online || role === "admin" || role === "operator";
try{ session = JSON.parse(localStorage.getItem(SKEY)); }catch(e){}

/* The magic link lands back here with tokens in the URL hash. */
if(location.hash.includes("access_token=")){
  const p = new URLSearchParams(location.hash.slice(1));
  session = { access_token:p.get("access_token"), refresh_token:p.get("refresh_token"),
              expires_at: Math.floor(Date.now()/1000) + (parseInt(p.get("expires_in"),10) || 3600) };
  try{ localStorage.setItem(SKEY, JSON.stringify(session)); }catch(e){}
  history.replaceState(null, "", location.pathname + location.search);
}

const saveSession = s => { session = s;
  try{ s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); }catch(e){} };

async function authFetch(path, body, bearer){
  const res = await fetch(AUTH + path, { method: body !== undefined ? "POST" : "GET",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json",
               ...(bearer && session ? { Authorization: "Bearer " + session.access_token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if(!res.ok){ const err = new Error(txt || ("HTTP " + res.status)); err.status = res.status; throw err; }
  return txt ? JSON.parse(txt) : null;
}

async function ensureSession(){
  if(!session) return null;
  if(Math.floor(Date.now()/1000) > (session.expires_at || 0) - 60){
    try{
      const j = await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token }, false);
      saveSession({ ...session, access_token: j.access_token, refresh_token: j.refresh_token,
                    expires_at: Math.floor(Date.now()/1000) + (j.expires_in || 3600),
                    user_id: (j.user && j.user.id) || session.user_id,
                    email: (j.user && j.user.email) || session.email });
    }catch(e){ saveSession(null); return null; }
  }
  if(!session.user_id){
    try{ const u = await authFetch("user", undefined, true); saveSession({ ...session, user_id: u.id, email: u.email }); }
    catch(e){ saveSession(null); return null; }
  }
  return session;
}

/* Signed in → the user's JWT (RLS scopes rows to them); signed out → the
   publishable key, which the owner-only policies reject for table access. */
function restHeaders(){
  return { apikey: SUPABASE_KEY,
           Authorization: "Bearer " + (session ? session.access_token : SUPABASE_KEY),
           "Content-Type": "application/json" };
}
async function rest(path, opts = {}, retried){
  /* Tokens die after ~1h; a tab left open needs a refresh before each call. */
  if(session) await ensureSession();
  const res  = await fetch(REST + path, { ...opts, headers: { ...restHeaders(), ...(opts.headers || {}) } });
  const body = await res.text();
  if(!res.ok){
    /* Expired mid-flight (PGRST303 / 401): force one refresh and retry. */
    if(!retried && session && (res.status === 401 || body.includes("PGRST303") || body.includes("JWT expired"))){
      session.expires_at = 0;
      await ensureSession();
      if(session) return rest(path, opts, true);
      const err = new Error("Signed out — your session expired. Sign in again to save."); err.status = 401; throw err;
    }
    const err = new Error(body || ("HTTP " + res.status)); err.status = res.status; throw err;
  }
  return body ? JSON.parse(body) : null;
}
const RETURN = { Prefer: "return=representation" };
const UPSERT = { Prefer: "resolution=merge-duplicates,return=representation" };

const STATES=["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli and Daman & Diu","Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry"];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say = m => { $("status").textContent = m; };

let online = false;
let senders = [], activeSenderId = null, addresses = [], shipments = [];
const AKEY = "tapal-active-sender";
const activeSender = () => senders.find(s => s.id === activeSenderId) || {};
let editingSenderId = null;
/* per-sender print state, so one of your own addresses can be today's recipient */
let sui = {};
/* dial codes for cross-border parcels; stored as part of the phone text */
const DIAL = [["+91","India"],["+81","Japan"],["+1","US / Canada"],["+44","UK"],["+65","Singapore"],["+61","Australia"],["+971","UAE"]];

