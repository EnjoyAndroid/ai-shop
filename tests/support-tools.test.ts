import test from 'node:test';
import assert from 'node:assert/strict';
import { productQuerySchema, supportTools, validateSupportTool, supportToolFailure } from '../src/lib/support/tool-contract';
import { buildProductToolPage, buildKnowledgeSearchResult, buildKnowledgePage, boundedSupportResult, toolResultBytes } from '../src/lib/support/tool-results';
import { modelToolResult, buildSupportUi } from '../src/lib/support/ui';

test('tool contracts share strict schema, defaults and monetary bounds', () => {
  const args = validateSupportTool('search_products', { query: '  测试  ' });
  assert.deepEqual(args, {query:'测试',minPriceCny:null,maxPriceCny:null,inStockOnly:false,limit:5,offset:0});
  for (const extra of [{maxPriceCny:99.999},{maxPriceCny:-1},{minPriceCny:100,maxPriceCny:99},{limit:21},{offset:-1},{inStockOnly:'true'},{userId:'other'}]) {
    assert.throws(() => validateSupportTool('search_products',{query:'',...extra}));
  }
  assert.equal(validateSupportTool('search_products',{query:'',maxPriceCny:0}).maxPriceCny,0);
  assert.equal(validateSupportTool('search_products',{query:'',maxPriceCny:19.99}).maxPriceCny,19.99);
  for (const tool of supportTools) {
    assert.deepEqual([...tool.parameters.required!].sort(),Object.keys(tool.parameters.properties!).sort());
    assert.equal(tool.parameters.additionalProperties,false);
    assert(!JSON.stringify(tool.parameters).includes('"default"'));
  }
});

test('whole product rows fit the model budget and pagination neither drops nor repeats items', () => {
  const rows=Array.from({length:21},(_,i)=>({name:`商品${i}`,slug:`product-${i}`,price:9900,stock:3,minQuantity:1,maxQuantity:10,description:'含限制条件。'.repeat(100)}));
  const seen:string[]=[];
  let offset:number|null=0;
  while(offset!==null){
    const args=productQuerySchema.parse({query:'',offset,limit:20});
    const page=buildProductToolPage(rows.slice(offset,offset+21),args,'fixed-time');
    assert(toolResultBytes(modelToolResult('search_products',page))<=6000);
    assert(page.returned>0);
    for(const p of page.relatedProducts){assert.equal(p.description,rows[0].description);seen.push(p.productRef);}
    offset=page.nextOffset;
  }
  assert.deepEqual(seen,rows.map(p=>p.slug));
  const empty=buildProductToolPage([],productQuerySchema.parse({query:''}));
  assert.equal(empty.truncated,false);assert.equal(empty.nextOffset,null);
});

test('knowledge pages preserve every original character and qualifiers through multi-byte boundaries', () => {
  const article={id:'policy',title:'退款条件',category:'refund',version:7,content:('第一段🙂说明。\n\n'.repeat(700))+'例外：已激活后不能退款。'};
  const search=buildKnowledgeSearchResult([article]);
  assert(search.truncated);assert(!search.articles[0].contentComplete);
  let cursor=search.articles[0].nextCursor;
  let content=search.articles[0].content;
  while(cursor!==null){
    const page=buildKnowledgePage(article,cursor);
    assert(toolResultBytes(page)<=6000);assert(page.end>cursor);assert(!page.contentComplete);
    content+=page.content;cursor=page.nextCursor;
  }
  assert.equal(content,article.content);
  assert(content.endsWith('例外：已激活后不能退款。'));
  assert.throws(()=>buildKnowledgePage(article,article.content.length+1));
  assert.equal(buildKnowledgePage({...article,content:'不可自动退款。'}).contentComplete,true);
  const many=buildKnowledgeSearchResult(Array.from({length:4},(_,i)=>({...article,id:`policy-${i}`})));
  assert(toolResultBytes(many)<=6000);assert.equal(many.articles.length,4);
});

test('presentation shows only delivered evidence; final bound failures cannot leave product buttons', () => {
  const result={exactMatches:[],relatedProducts:[{name:'甲',productRef:'a',url:'/product/a'},{name:'乙',productRef:'b',url:'/product/b'}]};
  const visible={...result,relatedProducts:[result.relatedProducts[0]]};
  assert.deepEqual(buildSupportUi([{tool:'search_products',result,modelResult:visible}],'推荐甲').links,[{label:'查看 甲',href:'/product/a'}]);
  assert.equal(buildSupportUi([{tool:'search_products',result,modelResult:boundedSupportResult({content:'中'.repeat(3000)})}],'').links.length,0);
  assert.equal(buildSupportUi([{tool:'search_products',result,modelResult:null}],'').links.length,0);
  const knowledge=modelToolResult('search_knowledge',{articles:[],sources:[{id:'internal'}]});
  assert.deepEqual(knowledge,{articles:[]});
});

test('actionable errors distinguish unavailable data and invalid inputs without leaking driver details', () => {
  let error:unknown;try{validateSupportTool('search_products',{query:'x',limit:50});}catch(e){error=e;}
  assert.equal(supportToolFailure(error).error,'INVALID_ARGUMENTS');
  try{validateSupportTool('refund_order',{});}catch(e){assert.equal(supportToolFailure(e).error,'UNKNOWN_TOOL');}
  assert.equal(supportToolFailure(new SyntaxError()).error,'INVALID_ARGUMENTS');
  const failure=supportToolFailure(new Error('password=private SQL SELECT FROM Order'));
  assert.equal(failure.error,'QUERY_FAILED');assert(!JSON.stringify(failure).includes('private'));
});
