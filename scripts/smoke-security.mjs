import { existsSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes, createCipheriv, pbkdf2Sync } from 'node:crypto';
import assert from 'node:assert/strict';
if (existsSync('.env')) process.loadEnvFile('.env');
const database = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) database.pathname = '/ai_shop_order_query_test';
if (!database.pathname.endsWith('_test')) throw new Error('HTTP smoke tests require a _test database');
const redisUrl = new URL(process.env.TEST_REDIS_URL || process.env.REDIS_URL);
redisUrl.pathname = '/15';
process.env.DATABASE_URL = database.toString();
process.env.REDIS_URL = redisUrl.toString();
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
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3011'], { env: { ...process.env, NODE_ENV: 'production', NEXTAUTH_URL: base, NEXT_PUBLIC_SITE_URL: base, TRUST_PROXY: 'true', XUNHU_ALIPAY_APPID: '', XUNHU_ALIPAY_APPSECRET: '', XUNHU_WECHAT_APPID: '', XUNHU_WECHAT_APPSECRET: '' }, stdio: ['ignore', log, log] });
const jar = new Map();
function capture(response) { for (const c of response.headers.getSetCookie()) { const pair = c.split(';')[0], index = pair.indexOf('='); jar.set(pair.slice(0,index),pair.slice(index+1)); } }
function cookie() { return [...jar].map(([k,v]) => `${k}=${v}`).join('; '); }
async function request(path, opts = {}) { return fetch(base + path, { redirect: 'manual', ...opts }); }
async function jsonPost(path, data, headers = {}) { return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) }); }
try {
  for (let i=0; i<40; i++) {
    try { if ((await request('/api/health')).ok) break; } catch {}
    if (i === 39) throw new Error('Smoke server failed to start; see /tmp/ai-shop-security-smoke-server.log');
    await new Promise(r => setTimeout(r, 250));
  }
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/checkout')).status, 404);
  const entryHtml = await (await request('/order')).text(); assert(!entryHtml.includes('aria-label="订单列表"'));
  assert.equal((await request('/order/results')).status,200);
  assert.equal((await request('/api/orders?orderNo=anything')).status, 405);
  assert.equal((await jsonPost('/api/orders', {items:[{productId:orderProduct.id,quantity:1}],email,paymentMethod:'BALANCE'})).status,400);
  assert.equal((await request('/api/admin/users')).status, 401);
  assert.equal((await request('/api/upload', { method: 'POST' })).status, 401);
  const disabled = await request('/api/payment/callback/alipay', { method: 'POST', headers: { 'Content-Type':'application/x-www-form-urlencoded' }, body: 'status=OD&hash=invalid' });
  assert.equal(disabled.status,400);
  const leakedKey = await new SignJWT({ id: admin.id, username, sessionVersion: 0 }).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode('admin-secret-key'));
  assert.equal((await request('/api/admin/users',{headers:{Cookie:`admin_token=${leakedKey}`}})).status,401);
  const login = await jsonPost('/api/admin/auth/login', { username, password });
  assert.equal(login.status,200); capture(login);
  const users = await request('/api/admin/users',{headers:{Cookie:cookie()}});
  assert.equal(users.status,200);
  assert((await users.json()).users.every(u => !('password' in u) && !('sessionVersion' in u)));
  const settings = await request('/api/admin/settings',{headers:{Cookie:cookie()}});assert.equal(settings.status,200);
  const adminOrders = await request('/api/admin/orders',{headers:{Cookie:cookie()}}); assert.equal(adminOrders.status,200);
  assert(!(await adminOrders.text()).includes('queryPasswordHash'));
  const adminOrder = await request(`/api/admin/orders/${memberOrder.id}`,{headers:{Cookie:cookie()}}); assert.equal(adminOrder.status,200);
  assert(!(await adminOrder.text()).includes('queryPasswordHash'));

  const category = await db.category.create({ data: { name: `smoke-${suffix}`, slug: `smoke-${suffix}` } });
  const productInput = { name: 'Image save regression', slug: `smoke-product-${suffix}`, categoryId: category.id, price: 19900, originalPrice: 29900, image: null };
  const createdProduct = await jsonPost('/api/admin/products', productInput, {Cookie:cookie()}); assert.equal(createdProduct.status,200);
  const productId = (await createdProduct.json()).product.id;
  const imageUrl = 'https://res.cloudinary.com/demo/image/upload/test.webp';
  const productUpdate = await request(`/api/admin/products/${productId}`, { method:'PUT', headers:{'Content-Type':'application/json',Cookie:cookie()}, body:JSON.stringify({...productInput, image:imageUrl, originalPrice:null}) });
  assert.equal(productUpdate.status,200,await productUpdate.clone().text());
  const updatedProduct = (await productUpdate.json()).product;
  assert.equal(updatedProduct.originalPrice,null); assert.equal(updatedProduct.image,imageUrl); assert.equal(updatedProduct.price,19900);
  const storedProduct = await db.product.findUniqueOrThrow({where:{id:productId}});
  assert.equal(storedProduct.originalPrice,null); assert.equal(storedProduct.image,imageUrl);
  console.log('Product image update with cleared original price: passed');

  const previousSettings = (await settings.json()).settings;
  const previousContact = previousSettings.telegramUrl || '';
  try {
    const publicBefore = await request('/api/settings/contact'); assert.equal(publicBefore.status,200);
    assert.deepEqual(Object.keys(await publicBefore.json()), ['telegramUrl']);
    const invalidContact = await jsonPost('/api/admin/settings', { telegramUrl: 'javascript:alert(1)' }, {Cookie:cookie()});
    assert.equal(invalidContact.status,400);
    const updatedContact = await jsonPost('/api/admin/settings', { telegramUrl: '@test_support', privateSmokeSetting: 'not-for-public-view' }, {Cookie:cookie()});
    assert.equal(updatedContact.status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(), {telegramUrl:'https://t.me/test_support'});
    const clearedContact = await jsonPost('/api/admin/settings', {telegramUrl:''}, {Cookie:cookie()}); assert.equal(clearedContact.status,200);
    assert.deepEqual(await (await request('/api/settings/contact')).json(), {telegramUrl:''});
  } finally {
    await jsonPost('/api/admin/settings', {telegramUrl:previousContact}, {Cookie:cookie()});
    await db.systemSetting.deleteMany({where:{key:'privateSmokeSetting'}});
  }

  const previousCommunity = { wechatGroupQrUrl: previousSettings.wechatGroupQrUrl || '', wechatGroupExpiresAt: previousSettings.wechatGroupExpiresAt || '' };
  try {
    assert.equal((await request('/community')).status,200);
    assert((await (await request('/')).text()).includes('href="/community"'));
    const entryQr = await request('/api/community/entry-qr'); assert.equal(entryQr.status,200);
    assert(entryQr.headers.get('content-type').startsWith('image/png'));
    assert.deepEqual([...new Uint8Array(await entryQr.arrayBuffer()).slice(0,8)], [137,80,78,71,13,10,26,10]);
    const image = 'https://example.com/test-group.png';
    const future = new Date(Date.now()+60000).toISOString();
    assert.equal((await jsonPost('/api/admin/settings',{wechatGroupQrUrl:'javascript:alert(1)'},{Cookie:cookie()})).status,400);
    assert.equal((await jsonPost('/api/admin/settings',{wechatGroupQrUrl:image,wechatGroupExpiresAt:future},{Cookie:cookie()})).status,200);
    const active = await request('/api/community'); assert.equal(active.status,200);
    assert(active.headers.get('cache-control').includes('no-store'));
    assert.deepEqual(await active.json(), {status:'active',qrCodeUrl:image,expiresAt:future});
    assert.equal((await jsonPost('/api/admin/settings',{wechatGroupQrUrl:'https://example.com/rejected.png',wechatGroupExpiresAt:'tomorrow'},{Cookie:cookie()})).status,400);
    assert.deepEqual(await (await request('/api/community')).json(), {status:'active',qrCodeUrl:image,expiresAt:future});
    assert.equal((await jsonPost('/api/admin/settings',{wechatGroupExpiresAt:new Date(Date.now()-1000).toISOString()},{Cookie:cookie()})).status,200);
    const expired = await (await request('/api/community')).json(); assert.equal(expired.status,'expired'); assert.equal(expired.qrCodeUrl,'');
    const expiredPage = await (await request('/community')).text(); assert(expiredPage.includes('群二维码正在更新')); assert(!expiredPage.includes(image));
    assert.equal((await jsonPost('/api/admin/settings',{wechatGroupQrUrl:'',wechatGroupExpiresAt:''},{Cookie:cookie()})).status,200);
    assert.deepEqual(await (await request('/api/community')).json(), {status:'unconfigured',qrCodeUrl:'',expiresAt:''});
    assert((await (await request('/community')).text()).includes('交流群暂未开放'));
    console.log('Community entry, QR response, configuration validation, cache invalidation, expiry and public settings isolation: passed');
  } finally {
    await jsonPost('/api/admin/settings',previousCommunity,{Cookie:cookie()});
  }

  jar.clear();
  const operatorLogin = await jsonPost('/api/admin/auth/login', { username: operator.username, password }); capture(operatorLogin);
  assert.equal((await request('/api/admin/settings',{headers:{Cookie:cookie()}})).status,403);
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
  await db.user.update({where:{id:user.id},data:{sessionVersion:{increment:1}}});
  const revoked=await request('/api/auth/session',{headers:{Cookie:cookie()}});assert.equal(await revoked.json(),null);
  console.log('HTTP smoke checks passed: pages, real user/admin sign-in, session revocation, role restrictions, anonymous upload rejection, disabled payment rejection, and captcha/password/token/ownership order authorization.');
} finally {
  child.kill('SIGTERM');closeSync(log);
  await db.$disconnect();
  await redis.quit();
}
