import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientIpProxyCandidate} from '../scripts/lib/client-ip-proxy.mjs';
const template=readFileSync(new URL('../nginx.conf',import.meta.url),'utf8');
test('tunnel real-IP candidate trusts exactly one verified peer and overwrites forwarding headers',()=>{
 const candidate=clientIpProxyCandidate(template,'172.26.0.1');
 assert.match(candidate,/set_real_ip_from 172\.26\.0\.1\/32;/);
 assert.match(candidate,/real_ip_header CF-Connecting-IP;/);
 assert.match(candidate,/real_ip_recursive off;/);
 assert.match(candidate,/proxy_set_header X-Real-IP \$remote_addr;/);
 assert.match(candidate,/proxy_set_header X-Forwarded-For \$remote_addr;/);
 assert.doesNotMatch(candidate,/\$proxy_add_x_forwarded_for/);
 assert.match(clientIpProxyCandidate(template,'::1'),/set_real_ip_from ::1\/128;/);
});
test('generator rejects broad trust, injected config and an existing real-IP policy',()=>{
 for(const input of ['0.0.0.0/0','172.26.0.0/16','localhost','172.26.0.1; include bad;',''])assert.throws(()=>clientIpProxyCandidate(template,input));
 assert.throws(()=>clientIpProxyCandidate(clientIpProxyCandidate(template,'172.26.0.1'),'172.26.0.2'));
 assert.throws(()=>clientIpProxyCandidate('server {}','172.26.0.1'));
});
