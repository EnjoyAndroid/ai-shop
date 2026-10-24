import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes, createCipheriv, pbkdf2Sync, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { isolatedEnvironment, assertIsolated } from './lib/environments.mjs';
if (process.env.APP_ENV !== 'test') Object.assign(process.env, isolatedEnvironment('test'));
const database = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!database.pathname.endsWith('_test')) throw new Error('HTTP smoke tests require a _test database');
const redisUrl = new URL(process.env.TEST_REDIS_URL || process.env.REDIS_URL);
process.env.DATABASE_URL = database.toString();
process.env.REDIS_URL = redisUrl.toString();
assertIsolated(process.env, 'test', process.env.GITHUB_ACTIONS === 'true');
process.env.SMTP_HOST = ''; process.env.TELEGRAM_BOT_TOKEN = '';
const { PrismaClient } = await import('@prisma/client');
const { default: bcrypt } = await import('bcryptjs');
const { SignJWT } = await import('jose');
const db = new PrismaClient();
const { default: Redis } = await import('ioredis');
const redis = new Redis(process.env.REDIS_URL);
const newOrderNo = () => 'AS' + randomBytes(20).toString('hex').slice(0,20).toUpperCase();
const suffix = randomBytes(6).toString('hex');
const password = randomBytes(18).toString('hex');
const username = `smoke-${suffix}`;
const email = `${username}@example.invalid`;
const hashed = await bcrypt.hash(password, 4);
const admin = await db.admin.create({ data: { username, password: hashed, role: 'SUPER_ADMIN' } });
const operator = await db.admin.create({ data: { username: `operator-${suffix}`, password: hashed, role: 'OPERATOR' } });
const user = await db.user.create({ data: { email, password: hashed } });
const orderCategory = await db.category.create({ data: { name: 'Order smoke', slug: `order-smoke-${suffix}` } });
const orderProduct = await db.product.create({ data: { name: 'Order smoke product', slug: `order-smoke-product-${suffix}`, categoryId: orderCategory.id, price: 100 } });
function cardData() {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(process.env.ENCRYPTION_KEY, 'ai-shop-encryption-salt-v1', 100000, 32, 'sha256'), iv);
  const content = Buffer.concat([cipher.update('SYNTHETIC-SMOKE-CARD', 'utf8'), cipher.final()]).toString('base64');
  return { content, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), productId: orderProduct.id };
}
const orderItem = status => ({ create: { productId: orderProduct.id, productName: orderProduct.name, quantity: 1, price: 100, cardKeys: { create: { ...cardData(), status } } } });
const memberOrder = await db.order.create({ data: { orderNo: newOrderNo(), userId: user.id, email, totalAmount: 100, payAmount: 100, status: 'COMPLETED', adminRemark: 'private-audit-note', ip: 'private-ip', queryPasswordHash: hashed, items: orderItem('SOLD') } });
const guestOrder = await db.order.create({ data: { orderNo: newOrderNo(), email, totalAmount: 100, payAmount: 100, queryPasswordHash: hashed, items: orderItem('LOCKED') } });
const rechargeOrder = await db.order.create({ data: { orderNo: 'R' + newOrderNo(), userId: user.id, email, totalAmount: 100, payAmount: 100, status: 'COMPLETED' } });
const base = 'http://localhost:3011';
const log = openSync('/tmp/ai-shop-security-smoke-server.log', 'w', 0o600);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3011'], { env: { ...process.env, NODE_ENV: 'production', NEXTAUTH_URL: base, NEXT_PUBLIC_SITE_URL: base, TRUST_PROXY: 'true', MAX_PENDING_ORDERS: '3', MAX_PENDING_QUANTITY: '100', XUNHU_ALIPAY_APPID: '', XUNHU_ALIPAY_APPSECRET: '', XUNHU_WECHAT_APPID: '', XUNHU_WECHAT_APPSECRET: '', USDT_TRC20_ADDRESS: 'T' + '1'.repeat(33) }, stdio: ['ignore', log, log] });
const jar = new Map();
function capture(response) { for (const c of response.headers.getSetCookie()) { const pair = c.split(';')[0], index = pair.indexOf('='); jar.set(pair.slice(0,index),pair.slice(index+1)); } }
function cookie() { return [...jar].map(([k,v]) => `${k}=${v}`).join('; '); }
async function request(path, opts = {}) {
  const headers = new Headers(opts.headers);
  if (opts.method && !['GET','HEAD','OPTIONS'].includes(opts.method) && !headers.has('Origin')) headers.set('Origin',base);
  return fetch(base + path, { redirect: 'manual', ...opts, headers });
}
async function jsonPost(path, data, headers = {}) { return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) }); }
try {
  for (let i=0; i<40; i++) {
    try { if ((await request('/api/health')).ok) break; } catch {}
    if (i === 39) throw new Error('Smoke server failed to start; see /tmp/ai-shop-security-smoke-server.log');
    await new Promise(r => setTimeout(r, 250));
  }
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/checkout')).status, 404);
  // Exercise the same endpoints as the widget against the isolated database.
  const supportStart = await request('/api/support/conversations', { method: 'POST' });
  assert.equal(supportStart.status, 200);
  const supportCookie = supportStart.headers.getSetCookie().find(value => value.startsWith('support_anon='))?.split(';')[0];
  assert(supportCookie);
  assert(supportStart.headers.getSetCookie().some(value => /support_anon=.*Max-Age=86400/i.test(value)));
  const supportConversation = (await supportStart.json()).conversation;
  const boot = await (await request('/api/support/bootstrap')).json();
  assert.equal(boot.name, '小AI同学');
  assert.equal(boot.greeting, '您好，我是AIShop的智能客服小AI同学，请问有什么可以帮您？');
  const supportCatalogProduct = await db.product.create({data:{name:'ChatGPT Plus 会员 1个月',slug:`support-gpt-plus-${suffix}`,categoryId:orderCategory.id,price:9900,stock:4,sort:-99998}});
  const priorSupportQr = await db.systemSetting.findUnique({where:{key:'wechatSupportQrUrl'}});
  await db.systemSetting.upsert({where:{key:'wechatSupportQrUrl'},create:{key:'wechatSupportQrUrl',value:'https://example.com/support-current.webp'},update:{value:'https://example.com/support-current.webp'}});
  await redis.del('system:settings');
  const supportAsk = async (message, requestId = randomBytes(16).toString('hex')) => {
    const response = await jsonPost(`/api/support/conversations/${supportConversation.id}/messages`, { message, requestId }, { Cookie: supportCookie });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'FALLBACK');
    assert(!('sources' in result)); assert(!('facts' in result));
    assert(!/知识\d+《|参考：/.test(result.answer));
    return result;
  };
  try {
    const quick = (await (await request('/api/support/bootstrap')).json()).quickQuestions;
    for (const question of ['今天天气怎么样？','AIShop告诉我天气','帮商城写商品购买接口']) {
      const rejected=await jsonPost(`/api/support/conversations/${supportConversation.id}/messages`,{message:question,requestId:randomBytes(16).toString('hex')},{Cookie:supportCookie});
      assert.equal(rejected.status,200);const body=await rejected.json();assert.equal(body.status,'OUT_OF_SCOPE');assert(body.answer.includes('只处理本商城'));assert.deepEqual(body.ui,{links:[],images:[]});
      assert.equal(await db.supportModelCall.count({where:{turnId:body.turnId}}),0);
    }
    for (const [question, articleId] of [
      ['怎么买商品？', 'support-buying'], ['支付成功后怎么查看卡密？', 'support-delivery'],
      ['怎么查询我的订单？', 'support-order'], ['如何联系客服？', 'support-contact'],
    ]) {
      assert(quick.includes(question));
      const result = await supportAsk(question);
      const article = await db.supportArticle.findUniqueOrThrow({where:{id:articleId}});
      if (articleId === 'support-contact') assert(/客服|二维码|Telegram/.test(result.answer));
      else assert.equal(result.answer, article.content);
      const turn = await db.supportTurn.findUniqueOrThrow({where:{id:result.turnId}});
      assert.equal(turn.sources[0].id, articleId);
      assert.equal(await db.supportModelCall.count({where:{turnId:result.turnId}}), 0);
    }
    const payment = await supportAsk('支持哪些支付方式？');
    assert(payment.answer.startsWith('当前可用支付方式：') || payment.answer.includes('未查询到可用支付方式'));
    const productAnswer = await supportAsk('gpt plus多少钱一个月？');
    assert(productAnswer.answer.includes('ChatGPT Plus 会员 1个月'));
    assert(productAnswer.answer.includes('¥99.00'));
    const contactAnswer = await supportAsk('如何联系客服？');
    assert(contactAnswer.answer.includes('微信客服二维码已配置'));
    assert.equal(contactAnswer.ui.images[0].url,'https://example.com/support-current.webp');
    assert(!contactAnswer.answer.includes('https://example.com/support-current.webp'));
    assert(productAnswer.ui.links.some(link => link.href === `/product/${supportCatalogProduct.slug}`));
    const restoredUi = await (await request('/api/support/conversations',{headers:{Cookie:supportCookie}})).json();
    assert.deepEqual(restoredUi.conversation.turns.find(turn => turn.id === contactAnswer.turnId).ui,contactAnswer.ui);
    const orderHelp=await supportAsk('怎么查询我的订单？');
    assert(orderHelp.ui.links.some(link => link.href === '/order'));
    // Give this synthetic fixture precedence over products from previous test runs.
    const supportProduct = await db.product.create({data:{name:'客服库存回归商品',slug:`support-stock-${suffix}`,categoryId:orderCategory.id,price:1234,stock:3,sort:-99999}});
    try {
      const requestId = randomBytes(16).toString('hex');
      const first = await supportAsk('哪些商品有库存？', requestId);
      assert(first.answer.includes('客服库存回归商品：有货（3 件），售价 ¥12.34'));
      await db.product.update({where:{id:supportProduct.id},data:{stock:0}});
      const fresh = await supportAsk('哪些商品有库存？');
      assert(fresh.answer.includes('客服库存回归商品：暂时缺货'));
      assert.equal((await supportAsk('哪些商品有库存？', requestId)).answer, first.answer);
      assert.equal((await db.supportTurn.findUniqueOrThrow({where:{id:fresh.turnId}})).facts.products.find(product => product.slug === supportProduct.slug).stock, 0);
    } finally { await db.product.delete({where:{id:supportProduct.id}}); }
    const resumed = await request('/api/support/conversations', {headers:{Cookie:supportCookie}});
    assert.equal(resumed.status,200); assert.equal((await resumed.json()).conversation.id,supportConversation.id);
    assert(resumed.headers.getSetCookie().some(value => /Max-Age=86400/i.test(value)));
    const beforeDelete = await db.supportConversation.findUniqueOrThrow({where:{id:supportConversation.id},include:{turns:true}});
    const removed = await request('/api/support/conversations', {method:'DELETE',headers:{Cookie:supportCookie}});
    assert.equal(removed.status,405);
    assert(!removed.headers.getSetCookie().some(value => value.startsWith('support_anon=')));
    assert.deepEqual(await db.supportConversation.findUniqueOrThrow({where:{id:supportConversation.id},include:{turns:true}}),beforeDelete);
    assert.equal((await request(`/api/support/conversations/${supportConversation.id}`,{headers:{Cookie:supportCookie}})).status,200);
    assert.equal((await (await request('/api/support/conversations',{headers:{Cookie:supportCookie}})).json()).conversation.id,supportConversation.id);
    console.log('Support HTTP: greeting, FAQs, stock, private evidence, 24h renewal and removed DELETE endpoint preserve conversations.');
  } finally {
    if (priorSupportQr) await db.systemSetting.update({where:{key:'wechatSupportQrUrl'},data:{value:priorSupportQr.value}});
    else await db.systemSetting.deleteMany({where:{key:'wechatSupportQrUrl'}});
    await redis.del('system:settings');
    await db.product.delete({where:{id:supportCatalogProduct.id}});
    await db.supportConversation.delete({where:{id:supportConversation.id}});
  }

  const entryHtml = await (await request('/order')).text(); assert(!entryHtml.includes('aria-label="订单列表"'));
  assert.equal((await request('/order/results')).status,200);
  assert.equal((await request('/api/orders?orderNo=anything')).status, 405);
  assert.equal((await jsonPost('/api/orders', {items:[{productId:orderProduct.id,quantity:1}],email,paymentMethod:'BALANCE'})).status,400);
  assert.equal((await request('/api/admin/users')).status, 401);
  const anonymousAdminPage = await request('/admin/dashboard'); assert.equal(anonymousAdminPage.status,307); assert(anonymousAdminPage.headers.get('location').endsWith('/admin/login'));
  const adminLoginHtml = await (await request('/admin/login')).text(); assert(!adminLoginHtml.includes('aria-label="后台侧栏"'));
  assert.equal((await request('/api/admin/contact')).status,401);
  assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:'test'})).status,401);
  assert.equal((await request('/api/upload', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/admin/cardkeys?productId='+orderProduct.id)).status,401);
  for (const method of ['GET','PATCH','DELETE']) assert.equal((await request('/api/admin/cardkeys/test-card',{method})).status,401);
  const disabled = await request('/api/payment/callback/alipay', { method: 'POST', headers: { 'Content-Type':'application/x-www-form-urlencoded' }, body: 'status=OD&hash=invalid' });
  assert.equal(disabled.status,400);
  const leakedKey = await new SignJWT({ id: admin.id, username, sessionVersion: 0 }).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode('admin-secret-key'));
  assert.equal((await request('/api/admin/users',{headers:{Cookie:`admin_token=${leakedKey}`}})).status,401);
  const login = await jsonPost('/api/admin/auth/login', { username, password });
  assert.equal(login.status,200); capture(login);
  const beforeOrigin = await db.systemSetting.findUnique({where:{key:'siteName'}});
  for (const origin of ['https://untrusted.example.invalid','http://sibling.localhost:3011','null','']) {
    const rejected = await jsonPost('/api/admin/settings',{siteName:'SYNTHETIC-REJECTED'}, {Cookie:cookie(),Origin:origin,'Content-Type':'text/plain'});
    assert.equal(rejected.status,403); assert.equal((await rejected.json()).code,'ORIGIN_REJECTED');
  }
  const spoofedHost = await jsonPost('/api/admin/settings',{siteName:'SYNTHETIC-REJECTED'}, {Cookie:cookie(),Origin:'https://untrusted.example.invalid','X-Forwarded-Host':'untrusted.example.invalid'});
  assert.equal(spoofedHost.status,403);
  assert.deepEqual(await db.systemSetting.findUnique({where:{key:'siteName'}}),beforeOrigin);
  const pageA = await request('/login'), pageB = await request('/login');
  const nonce = response => response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
  assert(nonce(pageA)); assert.notEqual(nonce(pageA),nonce(pageB));
  assert(!pageA.headers.get('content-security-policy').includes("'unsafe-eval'"));
  assert(pageA.headers.get('cache-control').includes('no-store'));
  const nonceHtml = await pageA.text();
  const inlineScripts = [...nonceHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(match=>match[2].trim());
  assert(inlineScripts.length); assert(inlineScripts.every(match=>match[1].includes(`nonce="${nonce(pageA)}"`)));
  console.log('HTTP browser security: rejected cross-origin/null/missing-origin writes, preserved settings, unique CSP nonces and noncached HTML: passed');
  const users = await request('/api/admin/users',{headers:{Cookie:cookie()}});
  assert.equal(users.status,200);
  assert((await users.json()).users.every(u => !('password' in u) && !('sessionVersion' in u)));
  const settings = await request('/api/admin/settings',{headers:{Cookie:cookie()}});assert.equal(settings.status,200);
  const adminOrders = await request('/api/admin/orders',{headers:{Cookie:cookie()}}); assert.equal(adminOrders.status,200);
  assert(!(await adminOrders.text()).includes('queryPasswordHash'));
  const adminOrder = await request(`/api/admin/orders/${memberOrder.id}`,{headers:{Cookie:cookie()}}); assert.equal(adminOrder.status,200);
  assert(!(await adminOrder.text()).includes('queryPasswordHash'));
  for (const path of ['/admin/dashboard','/admin/orders','/admin/products','/admin/products/new','/admin/categories','/admin/cardkeys','/admin/users','/admin/announcements','/admin/settings','/admin/contact',`/admin/orders/${memberOrder.id}`]) {
    const page = await request(path,{headers:{Cookie:cookie()}}); assert.equal(page.status,200);
    const html = await page.text();
    assert.equal((html.match(/aria-label="后台侧栏"/g)||[]).length,1,path);
    assert.equal((html.match(/aria-label="后台管理导航"/g)||[]).length,1,path);
    assert.equal((html.match(/<main\b/g)||[]).length,1,path);
    assert(html.includes('id="admin-content"'),path);
  }
  console.log('Admin shared layout: all menu pages and order details render one sidebar/main, anonymous pages redirect, login has no sidebar: passed');

  const category = await db.category.create({ data: { name: `smoke-${suffix}`, slug: `smoke-${suffix}` } });
  const productInput = { name: 'Image save regression', slug: `smoke-product-${suffix}`, categoryId: category.id, price: 19900, originalPrice: 29900, image: null };
  const createdProduct = await jsonPost('/api/admin/products', productInput, {Cookie:cookie()}); assert.equal(createdProduct.status,200);
  const productId = (await createdProduct.json()).product.id;
  for (const cardKeys of [Array(501).fill('SYNTHETIC-KEY').join('\n'), 'x'.repeat(10001)]) {
    assert.equal((await jsonPost('/api/admin/cardkeys/import',{productId,cardKeys},{Cookie:cookie()})).status,400);
  }
  assert.equal(await db.cardKey.count({where:{productId}}),0);
  const imageUrl = 'https://res.cloudinary.com/demo/image/upload/test.webp';
  const productUpdate = await request(`/api/admin/products/${productId}`, { method:'PUT', headers:{'Content-Type':'application/json',Cookie:cookie()}, body:JSON.stringify({...productInput, image:imageUrl, originalPrice:null}) });
  assert.equal(productUpdate.status,200,await productUpdate.clone().text());
  const updatedProduct = (await productUpdate.json()).product;
  assert.equal(updatedProduct.originalPrice,null); assert.equal(updatedProduct.image,imageUrl); assert.equal(updatedProduct.price,19900);
  const storedProduct = await db.product.findUniqueOrThrow({where:{id:productId}});
  assert.equal(storedProduct.originalPrice,null); assert.equal(storedProduct.image,imageUrl);
  console.log('Product image update with cleared original price: passed');

  const imported = await jsonPost('/api/admin/cardkeys/import',{productId,cardKeys:'SYNTHETIC-INVENTORY-A\nSYNTHETIC-INVENTORY-B\nSYNTHETIC-INVENTORY-C',batchNo:'inventory-smoke'},{Cookie:cookie()});
  assert.equal(imported.status,200); assert.equal((await imported.json()).count,3);
  const cardsResponse = await request('/api/admin/cardkeys?productId='+productId,{headers:{Cookie:cookie()}});
  assert.equal(cardsResponse.status,200); assert(cardsResponse.headers.get('cache-control').includes('no-store'));
  const inventory = await cardsResponse.json(); assert.equal(inventory.total,3);
  assert(!JSON.stringify(inventory).includes('SYNTHETIC-INVENTORY'));
  assert(inventory.cards.every(card=>card.canManage && !('content' in card) && !('iv' in card) && !('tag' in card)));
  const inventoryCard = inventory.cards[0];
  const revealedResponse = await request('/api/admin/cardkeys/'+inventoryCard.id,{headers:{Cookie:cookie()}});
  assert(revealedResponse.headers.get('cache-control').includes('no-store'));
  const revealed = (await revealedResponse.json()).card; assert(revealed.content.startsWith('SYNTHETIC-INVENTORY-'));
  const editInput = {content:'SYNTHETIC-INVENTORY-EDITED',batchNo:'edited-smoke',updatedAt:revealed.updatedAt};
  const patchCard = (input)=>request('/api/admin/cardkeys/'+inventoryCard.id,{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie()},body:JSON.stringify(input)});
  assert.equal((await patchCard({...editInput,status:'SOLD'})).status,400);
  assert.equal((await patchCard(editInput)).status,200);
  assert.equal((await patchCard(editInput)).status,409);
  const savedCard = await db.cardKey.findUniqueOrThrow({where:{id:inventoryCard.id}});
  assert.notEqual(savedCard.content,editInput.content); assert.equal(savedCard.batchNo,'edited-smoke');
  const deleteCard = (version)=>request('/api/admin/cardkeys/'+inventoryCard.id,{method:'DELETE',headers:{'Content-Type':'application/json',Cookie:cookie()},body:JSON.stringify({updatedAt:version})});
  assert.equal((await deleteCard(revealed.updatedAt)).status,409);
  assert.equal((await deleteCard(savedCard.updatedAt.toISOString())).status,200);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:productId}})).stock,2);
  assert.equal((await request('/api/admin/cardkeys/'+inventoryCard.id,{headers:{Cookie:cookie()}})).status,404);
  const lockedCard = await db.cardKey.findFirstOrThrow({where:{productId:orderProduct.id,status:'LOCKED'}});
  for (const method of ['GET','PATCH','DELETE']) {
    const body = method==='GET' ? undefined : JSON.stringify(method==='PATCH'?{content:'SYNTHETIC-TAMPER',batchNo:'',updatedAt:lockedCard.updatedAt.toISOString()}:{updatedAt:lockedCard.updatedAt.toISOString()});
    assert.equal((await request('/api/admin/cardkeys/'+lockedCard.id,{method,headers:{Cookie:cookie(),'Content-Type':'application/json'},body})).status,409);
  }
  console.log('Inventory import/list/reveal/edit/delete, stale version protection, locked card protection, encrypted storage and stock update: passed');

  const previousSettings = (await settings.json()).settings;
  const contactResponse = await request('/api/admin/contact',{headers:{Cookie:cookie()}}); assert.equal(contactResponse.status,200);
  const previousContactSettings = (await contactResponse.json()).settings;
  assert(!Object.keys(previousSettings).some(key=>key in previousContactSettings));
  assert.equal((await request('/admin/contact',{headers:{Cookie:cookie()}})).status,200);
  const systemPage = await (await request('/admin/settings',{headers:{Cookie:cookie()}})).text();
  assert(!systemPage.includes('id="telegramUrl"')); assert(!systemPage.includes('id="wechatGroupQrUrl"'));
  const emptyContact = {telegramUrl:'',wechatSupportText:'',wechatSupportQrUrl:''};
  try {
    const publicBefore = await request('/api/settings/contact'); assert.equal(publicBefore.status,200);
    assert(publicBefore.headers.get('cache-control').includes('no-store'));
    assert.deepEqual(Object.keys(await publicBefore.json()), Object.keys(emptyContact));
    const invalidContact = await jsonPost('/api/admin/contact', { telegramUrl: 'javascript:alert(1)' }, {Cookie:cookie()}); assert.equal(invalidContact.status,400);
    assert.equal((await jsonPost('/api/admin/contact',{privateSmokeSetting:'not-for-public-view'},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/settings',{wechatSupportText:'do-not-overwrite'},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/settings',{privateSmokeSetting:'not-for-public-view'},{Cookie:cookie()})).status,200);
    assert.equal((await jsonPost('/api/admin/contact', {...emptyContact,telegramUrl:'@test_support'}, {Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(), {...emptyContact,telegramUrl:'https://t.me/test_support'});
    const text='demo_support\n服务时间：09:00–18:00'; const qr='https://example.com/support.png';
    assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:text,wechatSupportQrUrl:qr},{Cookie:cookie()})).status,200);
    const configured={telegramUrl:'https://t.me/test_support',wechatSupportText:text,wechatSupportQrUrl:qr};
    assert.deepEqual(await (await request('/api/settings/contact')).json(),configured);
    assert((await (await request('/')).text()).includes('微信客服'));
    for(const bad of ['javascript:alert(1)','http://example.com/qr.png','https://user:password@example.com/qr.png']) assert.equal((await jsonPost('/api/admin/contact',{wechatSupportQrUrl:bad},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:'x'.repeat(301)},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:'cross-origin-change'},{Cookie:cookie(),Origin:'https://untrusted.example.invalid'})).status,403);
    assert.deepEqual(await (await request('/api/settings/contact')).json(),configured);
    assert.equal((await jsonPost('/api/admin/contact',{wechatSupportQrUrl:''},{Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(),{...configured,wechatSupportQrUrl:''});
    assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:'',wechatSupportQrUrl:qr},{Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(),{...configured,wechatSupportText:''});
    assert.equal((await jsonPost('/api/admin/contact',emptyContact,{Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(),emptyContact);
    console.log('Standalone contact settings, existing values, public allowlist, WeChat text/QR, validation, clearing and origin protection: passed');
  } finally {
    await jsonPost('/api/admin/contact',previousContactSettings,{Cookie:cookie()});
    await db.systemSetting.deleteMany({where:{key:'privateSmokeSetting'}});
  }

  const previousCommunity = { wechatGroupQrUrl: previousContactSettings.wechatGroupQrUrl || '', wechatGroupExpiresAt: previousContactSettings.wechatGroupExpiresAt || '' };
  try {
    assert.equal((await request('/community')).status,200);
    assert((await (await request('/')).text()).includes('href="/community"'));
    const entryQr = await request('/api/community/entry-qr'); assert.equal(entryQr.status,200);
    assert(entryQr.headers.get('content-type').startsWith('image/png'));
    assert.deepEqual([...new Uint8Array(await entryQr.arrayBuffer()).slice(0,8)], [137,80,78,71,13,10,26,10]);
    const image = 'https://example.com/test-group.png';
    const future = new Date(Date.now()+60000).toISOString();
    assert.equal((await jsonPost('/api/admin/contact',{wechatGroupQrUrl:'javascript:alert(1)'},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/contact',{wechatGroupQrUrl:image,wechatGroupExpiresAt:future},{Cookie:cookie()})).status,200);
    const active = await request('/api/community'); assert.equal(active.status,200);
    assert(active.headers.get('cache-control').includes('no-store'));
    assert.deepEqual(await active.json(), {status:'active',qrCodeUrl:image,expiresAt:future});
    assert.equal((await jsonPost('/api/admin/contact',{wechatGroupQrUrl:'https://example.com/rejected.png',wechatGroupExpiresAt:'tomorrow'},{Cookie:cookie()})).status,400);
    assert.deepEqual(await (await request('/api/community')).json(), {status:'active',qrCodeUrl:image,expiresAt:future});
    assert.equal((await jsonPost('/api/admin/contact',{wechatGroupExpiresAt:new Date(Date.now()-1000).toISOString()},{Cookie:cookie()})).status,200);
    const expired = await (await request('/api/community')).json(); assert.equal(expired.status,'expired'); assert.equal(expired.qrCodeUrl,'');
    const expiredPage = await (await request('/community')).text(); assert(expiredPage.includes('群二维码正在更新')); assert(!expiredPage.includes(image));
    assert.equal((await jsonPost('/api/admin/contact',{wechatGroupQrUrl:'',wechatGroupExpiresAt:''},{Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/community')).json(), {status:'unconfigured',qrCodeUrl:'',expiresAt:''});
    assert((await (await request('/community')).text()).includes('交流群暂未开放'));
    console.log('Community entry, QR response, configuration validation, cache invalidation, expiry and public settings isolation: passed');
  } finally {
    await jsonPost('/api/admin/contact',previousCommunity,{Cookie:cookie()});
  }

  jar.clear();
  const operatorLogin = await jsonPost('/api/admin/auth/login', { username: operator.username, password }); capture(operatorLogin);
  assert.equal((await request('/api/admin/settings',{headers:{Cookie:cookie()}})).status,403);
  assert.equal((await request('/api/admin/contact',{headers:{Cookie:cookie()}})).status,403);
  for (const purpose of ['support','community']) { const form = new FormData(); form.set('purpose',purpose); assert.equal((await request('/api/upload',{method:'POST',headers:{Cookie:cookie()},body:form})).status,403); }
  assert.equal((await jsonPost('/api/admin/contact',{wechatSupportText:'test'},{Cookie:cookie()})).status,403);
  const operatorContactPage = await request('/admin/contact',{headers:{Cookie:cookie()}});
  const operatorContactHtml = await operatorContactPage.text();
  assert(operatorContactPage.status === 307 && operatorContactPage.headers.get('location')?.endsWith('/admin/dashboard') || operatorContactPage.status === 200 && operatorContactHtml.includes('url=/admin/dashboard') && !operatorContactHtml.includes('微信号或联系说明'));
  assert.equal((await jsonPost('/api/admin/settings',{wechatGroupQrUrl:'https://example.com/test-group.png'},{Cookie:cookie()})).status,403);
  assert.equal((await jsonPost(`/api/admin/users/${user.id}/balance`,{amount:100},{Cookie:cookie()})).status,403);
  jar.clear();
  for (const order of [memberOrder, guestOrder, rechargeOrder]) {
    assert.equal((await request(`/api/orders/${order.orderNo}`)).status,403);
    assert.equal((await request(`/api/orders/${order.orderNo}/status`)).status,403);
    assert.equal((await request(`/api/orders/${order.orderNo}/pay`)).status,403);
    assert.equal((await request(`/api/payment/usdt/check?orderNo=${order.orderNo}`)).status,403);
  }
  async function solveCaptcha() {
    const captcha = await jsonPost('/api/captcha/generate',{});
    const challenge = await captcha.json(); assert.equal(challenge.success,true); assert(!('position' in challenge)); assert(challenge.image.startsWith('data:image/png;base64,'));
    const saved = JSON.parse(await redis.get(`captcha:${challenge.token}`));
    await redis.set(`captcha:${challenge.token}`, JSON.stringify({...saved, createdAt:Date.now()-1000}), 'KEEPTTL');
    assert.equal((await jsonPost('/api/captcha/verify',{token:challenge.token,position:saved.position})).status,200);
    return challenge.token;
  }
  const captchaToken = await solveCaptcha();
  const search = await jsonPost('/api/orders/search',{keyword:email.toUpperCase(),captchaToken}); assert.equal(search.status,200);
  const listing = await search.json(); assert.equal(listing.total,2);
  assert.equal((await request(`/order/results?ticket=${listing.queryToken}`)).status,200);
  assert.equal(search.headers.get('cache-control'),'no-store');
  for (const summary of listing.orders) assert.deepEqual(Object.keys(summary).sort(), ['orderNo','createdAt','payAmount','status','items'].sort());
  assert.equal((await jsonPost('/api/orders/search',{keyword:email,captchaToken})).status,403);
  assert.equal((await jsonPost(`/api/orders/${memberOrder.orderNo}/unlock`,{queryToken:listing.queryToken,password:'incorrect-password'})).status,403);
  const unlocked = await jsonPost(`/api/orders/${memberOrder.orderNo}/unlock`,{queryToken:listing.queryToken,password}); assert.equal(unlocked.status,200);
  const {accessToken} = await unlocked.json();
  const accessHeaders = {'x-order-access-token':accessToken};
  const member = await request(`/api/orders/${memberOrder.orderNo}`,{headers:accessHeaders}); assert.equal(member.status,200);
  const view = (await member.json()).order;
  assert(!('adminRemark' in view) && !('ip' in view) && !('queryPasswordHash' in view));
  assert.equal(view.items[0].cardKeys[0].content,'SYNTHETIC-SMOKE-CARD');
  assert.equal(member.headers.get('cache-control'),'no-store');
  assert.equal((await request(`/api/orders/${guestOrder.orderNo}`,{headers:accessHeaders})).status,403);
  assert.equal((await request(`/api/orders/${rechargeOrder.orderNo}`,{headers:accessHeaders})).status,403);
  const guestUnlocked = await jsonPost(`/api/orders/${guestOrder.orderNo}/unlock`,{queryToken:listing.queryToken,password}); assert.equal(guestUnlocked.status,200);
  const guestToken = (await guestUnlocked.json()).accessToken;
  const guest = await request(`/api/orders/${guestOrder.orderNo}`,{headers:{'x-order-access-token':guestToken}}); assert.equal(guest.status,200);
  assert.deepEqual((await guest.json()).order.items[0].cardKeys,[]);
  for(let i=0;i<25;i++) assert.equal((await request(`/api/orders/${memberOrder.orderNo}/status`,{headers:accessHeaders})).status,200);
  const csrf = await request('/api/auth/csrf');capture(csrf);const {csrfToken}=await csrf.json();
  const auth = await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Cookie:cookie()},body:new URLSearchParams({csrfToken,account:email,password,callbackUrl:base+'/dashboard'})});capture(auth);
  const authResponse = await auth.json();assert(!authResponse.url.includes('error='),JSON.stringify(authResponse));
  const session=await request('/api/auth/session',{headers:{Cookie:cookie()}});assert.equal((await session.json()).user.email,email);
  for (const path of ['/dashboard','/orders','/balance','/balance/recharge']) {
    const page = await request(path,{headers:{Cookie:cookie()}}); assert.equal(page.status,200);
    const html = await page.text();
    assert.equal((html.match(/<header\b/g)||[]).length,1);
    assert.equal((html.match(/aria-label="个人中心导航"/g)||[]).length,1);
  }
  assert.equal((await request(`/api/orders/${memberOrder.orderNo}`,{headers:{Cookie:cookie()}})).status,200);
  assert.equal((await request(`/api/orders/${rechargeOrder.orderNo}`,{headers:{Cookie:cookie()}})).status,200);
  assert.equal((await request(`/api/orders/${guestOrder.orderNo}`,{headers:{Cookie:cookie()}})).status,403);

  await db.user.update({where:{id:user.id},data:{balance:1000}});
  await db.systemSetting.upsert({where:{key:'balanceEnabled'},create:{key:'balanceEnabled',value:'true'},update:{value:'true'}});
  await redis.del('system:settings');
  await db.cardKey.create({data:{...cardData(),status:'AVAILABLE'}});
  const purchase = await jsonPost('/api/orders',{productId:orderProduct.id,quantity:1,email,queryPassword:password,paymentMethod:'BALANCE'},{Cookie:cookie()});
  assert.equal(purchase.status,200,await purchase.clone().text());
  const receipt = await purchase.json(); assert(receipt.accessToken); assert(!('queryPassword' in receipt)); assert(!('queryPasswordHash' in receipt));
  assert(/^AS[0-9A-HJKMNP-TV-Z]{20}$/.test(receipt.orderNo));
  const purchaseView = await request(`/api/orders/${receipt.orderNo}`,{headers:{'x-order-access-token':receipt.accessToken}}); assert.equal(purchaseView.status,200);
  assert.equal((await purchaseView.json()).order.status,'DELIVERED');
  // HTTP quota failure is checked before a payment provider is invoked. These
  // synthetic pending orders already exhaust the quota, so no chain or gateway
  // request is made even though USDT is configured for this isolated server.
  const quotaEmail = `quota-${suffix}@example.invalid`;
  for (let i=0;i<3;i++) await db.order.create({data:{orderNo:newOrderNo(),email:quotaEmail,totalAmount:100,payAmount:100,paymentMethod:'USDT_TRC20',status:'PENDING',expiredAt:new Date(Date.now()+600000),items:{create:{productId:orderProduct.id,productName:'Quota smoke',quantity:1,price:100}}}});
  const priorUsdt = await db.systemSetting.findUnique({where:{key:'usdtEnabled'}});
  const priorRate = await redis.get('usdt:exchange_rate');
  await redis.set('usdt:exchange_rate',JSON.stringify({rate:7.2,source:'synthetic-http-test',updatedAt:Date.now()}),'EX',600);
  await db.systemSetting.upsert({where:{key:'usdtEnabled'},create:{key:'usdtEnabled',value:'true'},update:{value:'true'}});
  await redis.del('system:settings');
  try {
    const rejected = await jsonPost('/api/orders',{productId:orderProduct.id,quantity:1,email:quotaEmail,queryPassword:password,paymentMethod:'USDT_TRC20'});
    assert.equal(rejected.status,429); assert.equal((await rejected.json()).code,'PENDING_ORDER_LIMIT');
    assert.equal(await db.order.count({where:{email:quotaEmail}}),3);
  } finally {
    if (priorUsdt) await db.systemSetting.update({where:{key:'usdtEnabled'},data:{value:priorUsdt.value}});
    else await db.systemSetting.delete({where:{key:'usdtEnabled'}});
    await redis.del('system:settings');
    if (priorRate) await redis.set('usdt:exchange_rate',priorRate,'EX',300);
    else await redis.del('usdt:exchange_rate');
  }
  const resetUser = await db.user.findUniqueOrThrow({where:{id:user.id}});
  const resetTokens = [randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
  const resetKey = token => 'reset_password:v2:' + createHash('sha256').update(token).digest('hex');
  for (const token of resetTokens) await redis.setex(resetKey(token),600,JSON.stringify({userId:user.id,sessionVersion:resetUser.sessionVersion}));
  assert.equal((await (await jsonPost('/api/auth/verify-reset-token',{token:resetTokens[0]})).json()).valid,true);
  assert.equal((await jsonPost('/api/auth/reset-password',{token:resetTokens[1],password:'中'.repeat(24)+'x'})).status,400);
  assert.equal((await jsonPost('/api/auth/reset-password',{token:resetTokens[1],password})).status,200);
  assert.equal((await (await jsonPost('/api/auth/verify-reset-token',{token:resetTokens[0]})).json()).valid,false);
  assert.equal((await jsonPost('/api/auth/reset-password',{token:resetTokens[0],password})).status,400);
  assert.equal((await jsonPost('/api/auth/reset-password',{token:resetTokens[1],password})).status,400);
  assert.equal(await (await request('/api/auth/session',{headers:{Cookie:cookie()}})).json(),null);
  console.log('HTTP hardening checks passed: import limits, pending order quota, password byte limits, reset-token revocation and session revocation.');
  await db.user.update({where:{id:user.id},data:{sessionVersion:{increment:1}}});
  const revoked=await request('/api/auth/session',{headers:{Cookie:cookie()}});assert.equal(await revoked.json(),null);
  console.log('HTTP smoke checks passed: pages, real user/admin sign-in, session revocation, role restrictions, anonymous upload rejection, disabled payment rejection, and captcha/password/token/ownership order authorization.');
} finally {
  child.kill('SIGTERM');closeSync(log);
  await db.$disconnect();
  await redis.quit();
}
