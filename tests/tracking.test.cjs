const {test} = require("node:test");
const assert = require("node:assert/strict");
const {handler} = require("../netlify/functions/parcel-status.js");

test("carrier lookup checks membership and returns only the matching parcel status", async t => {
  const request = {httpMethod:"POST",headers:{authorization:"Bearer synthetic"},body:'{"code":"TEST123"}'};
  const oldKey = process.env.EASYPOST_API_KEY;
  process.env.EASYPOST_API_KEY = "mock-key";
  t.after(() => { if(oldKey === undefined) delete process.env.EASYPOST_API_KEY; else process.env.EASYPOST_API_KEY = oldKey; });
  let role = null, returnedCode = "TEST123", calls = 0;
  t.mock.method(global,"fetch",async (url,options) => {
    if(url.includes("/rpc/")) return Response.json(role);
    calls++;
    assert.deepEqual(JSON.parse(options.body),{tracker:{tracking_code:"TEST123"}});
    return Response.json({tracking_code:returnedCode,carrier:"Test post",status:"in_transit",private_field:"hidden"});
  });
  assert.equal((await handler(request)).statusCode,403);
  assert.equal(calls,0);
  role = "viewer";
  const result = await handler(request);
  assert.deepEqual(JSON.parse(result.body),{carrier:"Test post",status:"in_transit"});
  returnedCode = "OTHER";
  assert.equal((await handler(request)).statusCode,502);
});
