import { existsSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if (existsSync('.env')) process.loadEnvFile('.env');
const database = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) database.pathname = '/ai_shop_security_test';
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
const suffix = randomBytes(6).toString('hex');
const password = randomBytes(18).toString('hex');
const username = `smoke-${suffix}`;
const email = `${username}@example.invalid`;
const hashed = await bcrypt.hash(password, 4);
const admin = await db.admin.create({ data: { username, password: hashed, role: 'SUPER_ADMIN' } });
const operator = await db.admin.create({ data: { username: `operator-${suffix}`, password: hashed, role: 'OPERATOR' } });
const user = await db.user.create({ data: { email, password: hashed } });
const memberOrder = await db.order.create({ data: { orderNo: `smoke-member-${suffix}`, userId: user.id, totalAmount: 100, payAmount: 100, status: 'COMPLETED', adminRemark: 'private-audit-note', ip: 'private-ip', queryPassword: 'private-query' } });
const guestOrder = await db.order.create({ data: { orderNo: `smoke-guest-${suffix}`, totalAmount: 100, payAmount: 100, queryPassword: password } });
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

  const previousContact = (await settings.json()).settings.telegramUrl || '';
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

  jar.clear();
  const operatorLogin = await jsonPost('/api/admin/auth/login', { username: operator.username, password }); capture(operatorLogin);
  assert.equal((await request('/api/admin/settings',{headers:{Cookie:cookie()}})).status,403);
  assert.equal((await jsonPost(`/api/admin/users/${user.id}/balance`,{amount:100},{Cookie:cookie()})).status,403);
  jar.clear();
  const member = await request(`/api/orders?orderNo=${memberOrder.orderNo}`);assert.equal(member.status,200);
  const view = (await member.json()).order;
  assert(!('adminRemark' in view) && !('ip' in view) && !('queryPassword' in view));
  assert.equal((await request(`/api/orders?orderNo=${guestOrder.orderNo}`)).status,403);
  assert.equal((await request(`/api/orders?orderNo=${guestOrder.orderNo}&password=${password}`)).status,200);
  const captcha = await jsonPost('/api/captcha/generate',{});
  const challenge = await captcha.json();assert.equal(challenge.success,true);assert(!('position' in challenge));assert(challenge.image.startsWith('data:image/png;base64,'));
  const csrf = await request('/api/auth/csrf');capture(csrf);const {csrfToken}=await csrf.json();
  const auth = await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Cookie:cookie()},body:new URLSearchParams({csrfToken,account:email,password,callbackUrl:base+'/dashboard'})});capture(auth);
  const authResponse = await auth.json();assert(!authResponse.url.includes('error='),JSON.stringify(authResponse));
  const session=await request('/api/auth/session',{headers:{Cookie:cookie()}});assert.equal((await session.json()).user.email,email);
  await db.user.update({where:{id:user.id},data:{sessionVersion:{increment:1}}});
  const revoked=await request('/api/auth/session',{headers:{Cookie:cookie()}});assert.equal(await revoked.json(),null);
  console.log('HTTP smoke checks passed: pages, real user/admin sign-in, session revocation, role restrictions, anonymous upload rejection, disabled payment rejection, and preserved member/guest query behavior.');
} finally {
  child.kill('SIGTERM');closeSync(log);
  await db.$disconnect();
}
