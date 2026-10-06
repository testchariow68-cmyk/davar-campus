import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyPulseSignature} from '../lib/payments/chariow-signature.ts';

test('signature sur les octets du corps original, pas sur le JSON re-sérialisé',async()=>{
  const secret='whsec_test_not_a_real_secret';
  const raw=new TextEncoder().encode('{"url":"https:\\/\\/example.org","name":"\\u00e9"}');
  const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(await verifyPulseSignature(raw,sig,secret),true);
  assert.equal(await verifyPulseSignature(new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(raw)))),sig,secret),false);
  assert.equal(await verifyPulseSignature(raw,sig.replace('sha256=',''),secret),false);
  assert.equal(await verifyPulseSignature(raw,sig,'sk_fake'),false);
});
