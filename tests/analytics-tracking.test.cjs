const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const source=html.slice(html.indexOf('        function trackEvent('),html.indexOf('        function flushWatch('));
function tracker(beacon){
    const sent=[],fallback=[];
    const ctx=vm.createContext({Date,JSON,_analyticsWorkerUrl:'https://test.invalid',
        getAnalyticsSessionId:()=> 'session-test',getAnalyticsVisitorId:()=> 'visitor-test',
        navigator:{sendBeacon(url,body){sent.push(JSON.parse(body));return beacon();}},
        fetch(url,options){fallback.push(options);return Promise.resolve({ok:true});}});
    vm.runInContext(source,ctx);
    return {sent,fallback,send:(action,data)=>{ctx.action=action;ctx.data=data;vm.runInContext('trackEvent(action,data)',ctx);}};
}
test('visit, playback, reactions, and outbound events are queued immediately with stable identity',()=>{
    const t=tracker(()=>true);
    for(const [action,data] of [['session_start',{session:{landingPath:'http://localhost/'}}],['video_view',{videoId:'landing-video'}],['video_heartbeat',{videoId:'landing-video',seconds:9}],['like_toggle',{videoId:'landing',liked:true}],['like_toggle',{videoId:'landing',liked:false}],['outbound_click',{label:'linkedin'}]])t.send(action,data);
    assert.equal(t.sent.length,6);
    assert.ok(t.sent.every(e=>e.sessionId==='session-test'&&e.visitorId==='visitor-test'));
    assert.equal(t.sent[2].seconds,9);
    assert.equal(t.sent[3].liked,true);
    assert.equal(t.sent[4].liked,false);
    assert.equal(t.fallback.length,0);
});
test('refused or unavailable beacon falls back to a keepalive request without dropping the payload',()=>{
    for(const beacon of [()=>false,()=>{throw new Error('Unavailable');}]){
        const t=tracker(beacon);t.send('outbound_click',{label:'email'});
        assert.equal(t.fallback.length,1);
        assert.equal(t.fallback[0].keepalive,true);
        assert.equal(JSON.parse(t.fallback[0].body).label,'email');
    }
});
