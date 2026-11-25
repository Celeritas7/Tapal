// The browser supplies the signed-in user's token. PostgREST checks Tapal membership.
const rolesURL = "https://wylxvmkcrexwfpjpbhyy.supabase.co/rest/v1/rpc/tapal_my_role";
const publishableKey = "sb_publishable_e3pDOuxIdstaC7s0a680kQ_R10TrAyv";
const reply = (statusCode, data) => ({
  statusCode, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}, body:JSON.stringify(data)
});

exports.handler = async event => {
  if(event.httpMethod !== "POST") return reply(405,{error:"Use POST."});
  const authorization = event.headers?.authorization;
  if(!authorization?.startsWith("Bearer ")) return reply(401,{error:"Sign in to look up a parcel."});
  let code;
  try{ code = JSON.parse(event.body).code; }catch{}
  if(typeof code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 -]{0,47}$/.test(code))
    return reply(400,{error:"Enter a valid consignment number (up to 48 letters, digits, spaces or hyphens)."});
  try{
    const role = await fetch(rolesURL,{method:"POST",headers:{authorization,apikey:publishableKey,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(5000)});
    if(!role.ok || !["admin","operator","viewer"].includes(await role.json())) return reply(403,{error:"Tapal membership is required."});
    const key = process.env.EASYPOST_API_KEY;
    if(!key) return reply(503,{error:"Live tracking has not been configured."});
    const response = await fetch("https://api.easypost.com/v2/trackers",{
      method:"POST",signal:AbortSignal.timeout(8000),headers:{
        Authorization:"Basic " + Buffer.from(key + ":").toString("base64"),"Content-Type":"application/json"
      },body:JSON.stringify({tracker:{tracking_code:code}})
    });
    if(!response.ok) return reply(response.status === 422 ? 422 : 502,{error:response.status === 422 ? "Carrier or tracking number could not be identified." : "Tracking provider unavailable. Try again later."});
    const tracker = await response.json();
    if(!tracker.status || tracker.tracking_code?.toUpperCase() !== code.toUpperCase())
      return reply(502,{error:"Tracking provider returned an incomplete result."});
    return reply(200,{status:tracker.status,carrier:tracker.carrier,updated:tracker.updated_at});
  }catch{ return reply(503,{error:"Tracking service unavailable. Try again later."}); }
};
