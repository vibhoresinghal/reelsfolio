const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');

// Run the actual reporting SQL against SQLite, including JSON aggregation.
const sqlite = `import sys,json,sqlite3
d=json.load(sys.stdin)
c=sqlite3.connect(':memory:')
c.row_factory=sqlite3.Row
c.executescript(d['schema'])
for table,rows in d['seed'].items():
 for row in rows:
  keys=list(row)
  c.execute('INSERT INTO '+table+' ('+','.join(keys)+') VALUES ('+','.join('?' for k in keys)+')',[row[k] for k in keys])
print(json.dumps([{'results':[dict(r) for r in c.execute(q['sql'],q['args'])]} for q in d['queries']]))
`;
function worker() {
    const now=Date.now(),day=86400000;
    const records=[
        ['public-a','v1',1,'https://folio.example/',''],
        ['public-b','v1',2,'https://folio.example/','https://google.com/'],
        ['local','v1',1,'HTTP://LOCALHOST:8000/',''],
        ['loopback','v2',1,'http://[::1]:8000/',''],
        ['prefix','v3',1,'http://localhost.example/',''],
        ['mention','v4',1,'https://folio.example/?next=localhost',''],
        ['unknown','v5',1,null,null],
        ['referrer','v6',1,'https://folio.example/','http://127.0.0.1:8000/'],
        ['old-public','v7',10,'https://folio.example/',''],
        ['old-local','v8',10,'https://localhost/','']
    ];
    const sessions=records.map(([id,visitor_id,days,landing_path,referrer])=>({id,visitor_id,started_at:now-days*day,ended_at:now-days*day+10000,landing_path,referrer,device:'desktop',load_ms:id.includes('local')?5000:100}));
    const events=sessions.flatMap(s=>['video_view','video_heartbeat','outbound_click'].map((action,i)=>({session_id:s.id,ts:s.started_at+1000+i,action,payload:JSON.stringify(action==='outbound_click'?{label:'Email'}:{videoId:'t1v1',seconds:['local','loopback','referrer','old-local'].includes(s.id)?100:10})})));
    events.push(...[
        ['public-a',100,'t1v1',true],['public-a',200,'t1v1',false],['public-a',300,'t1v2',true]
    ].map(([session_id,offset,videoId,liked])=>({session_id,ts:now+offset,action:'like_toggle',payload:JSON.stringify({videoId,liked})})));
    const schema=fs.readFileSync(require.resolve('../schema.sql'),'utf8');
    const run=queries=>{
        const result=spawnSync('python',['-c',sqlite],{input:JSON.stringify({schema,seed:{sessions,events},queries}),encoding:'utf8'});
        assert.equal(result.status,0,result.stderr);
        return JSON.parse(result.stdout);
    };
    const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return run([this])[0];},async first(){return run([this])[0].results[0]||null;}};},async batch(queries){return run(queries);}};
    const context=vm.createContext({URL,URLSearchParams,Response,Headers,Date,console,env:{ANALYTICS:db}});
    vm.runInContext(fs.readFileSync(require.resolve('../cloudflare-worker.js'),'utf8').replace('export default','const worker ='),context);
    return async (fn,query)=>{
        const response=await vm.runInContext(`${fn}(new URL('https://test/analytics?range=7d&tz=0&${query}'),env,{})`,context);
        return response.json();
    };
}
test('local exclusion scopes every overview aggregate and its comparison without removing public visits from the same browser',async()=>{
    const call=worker();
    const all=await call('handleOverview','');
    const filtered=await call('handleOverview','excludeLocal=1');
    assert.equal(all.visits,8);
    assert.equal(filtered.localExcluded,true);
    assert.equal(filtered.localVisitCount,3);
    assert.equal(filtered.visits,5);
    assert.equal(filtered.visitors,4);
    assert.equal(filtered.clips[0].n,5);
    assert.equal(filtered.watchSeconds,50);
    assert.equal(filtered.outboundTotal,5);
    assert.equal(filtered.deltas.watch,400);
    assert.equal(filtered.load.load,100);
    assert.equal(filtered.avgSessionMs,10000);
    assert.equal(filtered.sources.reduce((n,s)=>n+s.n,0),5);
    assert.equal(filtered.daily.reduce((n,d)=>n+d.n,0),5);
});
test('session pagination and totals use the same local exclusion with exact host boundaries',async()=>{
    const call=worker();
    const result=await call('handleSessionList','excludeLocal=1');
    assert.equal(result.localExcluded,true);
    assert.equal(result.total,5);
    assert.deepEqual(result.sessions.map(s=>s.id).sort(),['mention','prefix','public-a','public-b','unknown']);
    assert.equal(result.sessions.find(s=>s.id==='public-a').visit_count,2,'excluded local visits do not inflate visitor history');
    const next=await call('handleSessionList','excludeLocal=1&offset=3');
    assert.equal(next.total,5);
    assert.equal(next.sessions.length,2);
});

test('visitor list returns the last recorded reaction per project including unlikes',async()=>{
    const result=await worker()('handleSessionList','excludeLocal=1');
    const reactions=result.sessions.find(s=>s.id==='public-a').reactions;
    assert.equal(reactions.length,2);
    assert.equal(reactions.find(r=>r.videoId==='t1v1').liked,false);
    assert.equal(reactions.find(r=>r.videoId==='t1v2').liked,true);
    assert.deepEqual(result.sessions.find(s=>s.id==='public-b').reactions,[]);
});

test('new likes counts positive events without counting unlikes',async()=>{
    const result=await worker()('handleOverview','excludeLocal=1');
    assert.equal(result.newLikes.find(r=>r.videoId==='t1v1').n,1);
    assert.equal(result.newLikes.find(r=>r.videoId==='t1v2').n,1);
});
