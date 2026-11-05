import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupportMessageTime, SupportMessageUi } from '../src/components/shop/support-message-ui';
import { buildSupportUi, readSupportUi, modelToolResult, cleanSupportAnswer, isSupportPath } from '../src/lib/support/ui';
import { executeSupportTool } from '../src/lib/support/tools';
import redis from '../src/lib/redis';
const qr = 'https://res.cloudinary.com/demo/image/upload/test.webp';

test('real contact tool exposes QR to server renderer but not to model; text contains no raw image link', async t => {
  t.mock.method(redis,'get',async()=>JSON.stringify({wechatSupportQrUrl:qr}));
  const result=await executeSupportTool('get_contacts',{});
  const model=modelToolResult('get_contacts',result) as any;
  assert.equal(model.wechatQrConfigured,true);assert(!JSON.stringify(model).includes(qr));
  const ui=buildSupportUi([{tool:'get_contacts',result}],'请扫描下方二维码');
  assert.equal(ui.images[0].url,qr);
  const html=renderToStaticMarkup(createElement(SupportMessageUi,{value:ui}));
  assert(html.includes('<img'));assert(html.includes('alt="微信客服二维码"'));assert(html.includes('放大查看二维码'));
  assert.equal(cleanSupportAnswer(`扫描 [二维码](${qr})`,ui),'扫描 微信客服二维码见下方');
  assert(!cleanSupportAnswer(`扫描 ![二维码](${qr})`,ui).includes(qr));
  assert.equal(cleanSupportAnswer('当前支持**账户余额**支付，`仅限登录用户`。', { links: [], images: [] }), '当前支持账户余额支付，仅限登录用户。');
});

test('only relevant successful tools create attachments and safe navigation',async()=>{
  const products={exactMatches:[{name:'Cursor Pro',url:'/product/cursor-pro'}],relatedProducts:[{name:'GPT Plus',url:'/product/gpt-plus'},{name:'bad',url:'javascript:alert(1)'}]};
  const ui=buildSupportUi([{tool:'search_products',result:products},{tool:'get_my_orders',result:{requiresLogin:true}}],'Cursor Pro有货');
  assert.deepEqual(ui.links.map(l=>l.href),['/product/cursor-pro','/order']);assert.equal(ui.images.length,0);
  assert(!JSON.stringify(modelToolResult('search_products',products)).includes('/product/'));
  const navigation=await executeSupportTool('get_navigation',{page:'products'});
  assert.equal(buildSupportUi([{tool:'get_navigation',result:navigation}],'').links[0].href,'/');
  await assert.rejects(executeSupportTool('get_navigation',{page:'https://evil.invalid'}));
  await assert.rejects(executeSupportTool('get_navigation',{page:'products',href:'//evil.invalid'}));
  assert.deepEqual(buildSupportUi([{tool:'get_my_orders',result:{}}],'','member').links.map(l=>l.href),['/order','/orders']);
  assert.equal(buildSupportUi([{tool:'get_contacts',result:{error:'QUERY_FAILED'}}],'').images.length,0);
});

test('no QR card without a contact query or after removal; unsafe attachment URLs cannot render',()=>{
  assert.deepEqual(buildSupportUi([],'hello'),{links:[],images:[]});
  assert.equal(buildSupportUi([{tool:'get_contacts',result:{wechatSupportQrUrl:qr}},{tool:'get_contacts',result:{wechatSupportQrUrl:''}}],'').images.length,0);
  for(const href of ['//evil.invalid','/admin','/api/orders','/product/..','/product/%2f..','/product/%5Cbad','javascript:alert(1)','/order?redirect=https://evil.invalid'])assert.equal(isSupportPath(href),false,href);
  assert.deepEqual(readSupportUi({links:[{label:'x',href:'//evil.invalid'}],images:[]}),{links:[],images:[]});
  for(const url of ['data:image/png,hi','javascript:alert(1)','http://example.com/qr.png','https://user:password@example.com/qr.png'])assert.equal(readSupportUi({links:[],images:[{alt:'微信客服二维码',url}]}).images.length,0);
});

test('public order lookup stays login-free and guest navigation cannot become a member-only destination',async()=>{
  const guest=await executeSupportTool('get_my_orders',{}) as any;
  assert.equal(guest.identity,'guest');assert.equal(guest.canReadMyOrders,false);assert.equal(guest.publicOrderQuery.requiresAccountLogin,false);
  assert(!('requiresLogin' in guest));assert(!('orders' in guest));
  for(const name of ['order_query','my_orders']) {
    const result=await executeSupportTool('get_navigation',{page:name}) as any;
    assert.equal(result.page,'order_query');assert.equal(result.href,'/order');
    assert.equal((modelToolResult('get_navigation',result) as any).publicOrderQuery.requiresAccountLogin,false);
    const ui=buildSupportUi([{tool:'get_navigation',result}],'去查询订单');
    const html=renderToStaticMarkup(createElement(SupportMessageUi,{value:ui}));assert(html.includes('href="/order"'));assert(!html.includes('href="/login"'));
  }
  assert.deepEqual(buildSupportUi([{tool:'get_navigation',result:{page:'my_orders'}}],'').links.map(l=>l.href),['/order']);
  const member=await executeSupportTool('get_navigation',{page:'my_orders'},'current-member');
  assert.deepEqual(buildSupportUi([{tool:'get_navigation',result:member}],'','current-member').links.map(l=>l.href),['/order','/orders']);
});

test('tool presentation preserves explicit query failures without inventing empty products',()=>{
  const failure={error:'QUERY_FAILED',message:'unavailable'};
  assert.deepEqual(modelToolResult('search_products',failure),failure);
  assert.deepEqual(modelToolResult('get_navigation',failure),failure);
  assert.deepEqual(buildSupportUi([{tool:'search_products',result:failure}],'有货'),{links:[],images:[]});
});

test('support timestamps shorten today and this year using Beijing calendar boundaries', () => {
  const cases = [
    ['2026-11-05T16:03:59.999Z', '2026-11-05T18:02:00Z', '00:03'],
    ['2026-11-05T15:59:59Z', '2026-11-05T16:00:00Z', '11-05 23:59'],
    ['2026-01-01T00:00:00Z', '2026-11-05T18:02:00Z', '01-01 08:00'],
    ['2025-12-31T15:59:00Z', '2025-12-31T16:00:00Z', '2025-12-31 23:59'],
    ['2025-12-31T16:01:00Z', '2025-12-31T16:02:00Z', '00:01'],
  ];
  for (const [value, now, label] of cases) {
    const html = renderToStaticMarkup(createElement(SupportMessageTime, { value, now: new Date(now) }));
    assert.equal(html.match(/>([^<]*)<\/time>/)?.[1], label);
    assert(html.includes(`dateTime="${new Date(value).toISOString()}"`));
    assert(html.includes('北京时间'));
  }
  const full = renderToStaticMarkup(createElement(SupportMessageTime, { value: '2026-11-05T16:03:59.999Z', now: new Date('2026-11-05T18:02:00Z') }));
  assert(full.includes('title="2026-11-06 00:03（北京时间）"'));
  for (const value of ['invalid', undefined]) assert.equal(renderToStaticMarkup(createElement(SupportMessageTime, { value })), '');
});
