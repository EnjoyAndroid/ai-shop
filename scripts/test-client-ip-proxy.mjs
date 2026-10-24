import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {clientIpProxyCandidate} from './lib/client-ip-proxy.mjs';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const name=`ai-shop-ip-test-${randomBytes(4).toString('hex')}`;
const dir=mkdtempSync(resolve(tmpdir(),'ai-shop-ip-test-'));
const source=readFileSync('.deploy/nginx.production.conf','utf8');
const candidate=readFileSync('.deploy/client-ip/nginx.candidate.conf','utf8');
const meta=JSON.parse(readFileSync('.deploy/client-ip/candidate.json','utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(sha(source),meta.sourceSha256,'production snapshot changed');
assert.equal(sha(candidate),meta.candidateSha256,'candidate changed');
const productionNames=['ai-shop-app','ai-shop-nginx','ai-shop-db','ai-shop-redis'];
function baseline(){return JSON.parse(docker(['inspect',...productionNames])).map(c=>({name:c.Name,id:c.Id,image:c.Image,startedAt:c.State.StartedAt}));}
const before=baseline(),image=before.find(c=>c.name==='/ai-shop-nginx').image;
const nodeImage=docker(['image','inspect','node:22-slim','--format','{{.Id}}']);
let network=false,container=false;
const report={at:new Date().toISOString(),checks:[],nginxImage:image};
try{
 docker(['network','create','--internal',name]);network=true;
 const net=JSON.parse(docker(['network','inspect',name]))[0];
 const subnet=net.IPAM.Config[0].Subnet;
 assert.match(subnet,/^\d+\.\d+\.\d+\.0\/(16|24)$/);
 const prefix=subnet.split('.').slice(0,3).join('.');
 const proxy=`${prefix}.2`,trusted=`${prefix}.3`,untrusted=`${prefix}.4`;
 const sourcePath=resolve(dir,'candidate.conf'),backendPath=resolve(dir,'backend.conf');
 writeFileSync(sourcePath,candidate);
 writeFileSync(backendPath,`server { listen 3000; access_log off; location / { default_type application/json; return 200 '{"ip":"$http_x_real_ip","forwarded":"$http_x_forwarded_for","cf":"$http_cf_connecting_ip"}'; } }\n`);
 docker(['run','--rm','--pull','never','--network',name,'--add-host',`app:${proxy}`,'-v',`${sourcePath}:/etc/nginx/conf.d/default.conf:ro`,'-v',`${backendPath}:/etc/nginx/conf.d/backend.conf:ro`,image,'nginx','-t']);
 report.checks.push({name:'exact production candidate nginx -t',passed:true});
 // Only substitute the immediate peer address to match the isolated topology.
 writeFileSync(sourcePath,clientIpProxyCandidate(source,trusted));
 docker(['run','-d','--pull','never','--name',name,'--network',name,'--ip',proxy,'--add-host',`app:${proxy}`,'-v',`${sourcePath}:/etc/nginx/conf.d/default.conf:ro`,'-v',`${backendPath}:/etc/nginx/conf.d/backend.conf:ro`,image]);container=true;
 const scenarios=[
  {name:'trusted IPv4',peer:trusted,headers:{'CF-Connecting-IP':'8.8.8.8'},expect:'8.8.8.8'},
  {name:'trusted IPv6',peer:trusted,headers:{'CF-Connecting-IP':'2001:4860:4860::8888'},expect:'2001:4860:4860::8888'},
  {name:'visitor forwarded headers cannot override Cloudflare identity',peer:trusted,headers:{'CF-Connecting-IP':'8.8.4.4','X-Real-IP':'1.1.1.1','X-Forwarded-For':'9.9.9.9','Forwarded':'for=1.1.1.1'},expect:'8.8.4.4'},
  {name:'untrusted peer cannot spoof Cloudflare or forwarded IP',peer:untrusted,headers:{'CF-Connecting-IP':'8.8.8.8','X-Real-IP':'1.1.1.1','X-Forwarded-For':'9.9.9.9'},expect:untrusted},
  {name:'missing Cloudflare IP does not accept arbitrary forwarded headers',peer:trusted,headers:{'X-Real-IP':'1.1.1.1','X-Forwarded-For':'9.9.9.9'},expect:trusted},
  {name:'malformed Cloudflare IP falls back to peer',peer:trusted,headers:{'CF-Connecting-IP':'not-an-ip'},expect:trusted},
 ];
 for(const test of scenarios){
  const code=`const r=await fetch(${JSON.stringify(`http://${proxy}/probe`)},{headers:${JSON.stringify(test.headers)},signal:AbortSignal.timeout(5000)}); if(!r.ok)throw new Error('HTTP '+r.status);console.log(await r.text());`;
  const result=JSON.parse(docker(['run','--rm','--pull','never','--network',name,'--ip',test.peer,nodeImage,'node','--input-type=module','-e',code]));
  assert.equal(result.ip,test.expect,test.name);assert.equal(result.forwarded,test.expect,test.name);assert.equal(result.cf,'',test.name);
  report.checks.push({name:test.name,passed:true});
 }
 assert.deepEqual(baseline(),before);assert.equal(sha(readFileSync('.deploy/nginx.production.conf','utf8')),meta.sourceSha256);
 report.productionUnchanged=true;report.status='passed';
}catch(e){report.status='failed';report.error=e instanceof assert.AssertionError?e.message:e.constructor.name;throw e;}
finally{
 if(container)docker(['rm','-f',name]);if(network)docker(['network','rm',name]);rmSync(dir,{recursive:true,force:true});
 mkdirSync('.deploy/client-ip',{recursive:true});writeFileSync('.deploy/client-ip/verification.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
}
