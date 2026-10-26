const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('browser badges use recognized local artwork and escape unknown browser names',()=>{
    const app=dashboard();
    for(const [name,key] of [['Chrome','chrome'],['Google Chrome 124','chrome'],['Microsoft Edge','edge'],['Firefox','firefox'],['Mobile Safari','safari'],['Opera','opera']]) {
        assert.equal(app.run(`browserInfo(${JSON.stringify(name)}).key`),key);
        assert.match(app.run(`browserBadge(${JSON.stringify(name)})`),new RegExp(`assets/analytics/browsers/${key}\\.png`));
    }
    assert.equal(app.run("browserInfo('Other').name"),'Browser not reported');
    assert.doesNotMatch(app.run("browserBadge('ChromeImposter')"),/<img/);
    assert.doesNotMatch(app.run(`browserBadge('<script>bad</script>')`),/<script>/);
    assert.equal(app.run("channelKind('Local')"),'local');
    assert.equal(app.run("channelKind('Source not shared')"),'unknown');
    assert.equal(app.run("channelKind('Figma Community')"),'figma');
    assert.equal(app.run("channelKind('Resume')"),'document');
    assert.equal(app.run("channelKind('acv.example.com')"),'website');
    for(const [name,key] of [['Windows 11','windows'],['iOS','ios'],['macOS','macos'],['Android 15','android']]) {
        assert.equal(app.run(`osInfo(${JSON.stringify(name)}).key`),key);
        assert.match(app.run(`browserBadge('Chrome',${JSON.stringify(name)})`),new RegExp('platform-'+key));
    }
    assert.equal(app.run("osInfo('unknown')"),null);
    assert.doesNotMatch(app.run("browserBadge('Chrome','unknown')"),/browser-corner/);
});

test('visitor browser artwork follows the matching visit instead of another visit in the group',()=>{
    const app=dashboard();
    app.run(`sessions=[
        {id:'new',visitor_id:'a',guest_number:20,started_at:30,device:'desktop',browser:'Chrome',os:'Windows',path:[]},
        {id:'old',visitor_id:'a',guest_number:20,started_at:20,device:'phone',browser:'Safari',os:'iOS',path:[]}
    ];`);
    app.element('deviceFilter').value='phone';
    app.run('renderVisits()');
    assert.match(app.element('visits').innerHTML,/browsers\/safari\.png/);
    assert.doesNotMatch(app.element('visits').innerHTML,/browsers\/chrome\.png/);
    assert.match(app.element('visits').innerHTML,/platform-ios/);
    assert.doesNotMatch(app.element('visits').innerHTML,/platform-windows/);
    assert.match(app.element('visits').innerHTML,/Visitor 20/,'visitor identity stays readable outside the icon');
});

function dashboard(href = 'http://localhost/analytics.html') {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, { value: id === 'projectSort' ? 'seconds' : '', children: [], hidden: false,
            textContent: '', innerHTML: '', dataset: {}, attributes: {},
            setAttribute(key,value) { this.attributes[key]=value; }, removeAttribute(key) { delete this.attributes[key]; },
            querySelectorAll() { return []; }, focus() {} });
        return elements.get(id);
    }
    const links = ['overview','projects','visits','traffic'].map(view=>Object.assign(element('nav-'+view),{dataset:{view}}));
    element('viewNav').querySelectorAll=()=>links;
    const location = new URL(href);
    const history = {state:null,entries:[],pushState(state,unused,url){this.state=state;this.entries.push(String(url));location.href=String(url);},replaceState(state,unused,url){this.state=state;location.href=String(url);}};
    const context = vm.createContext({URL, URLSearchParams, Intl, Date, AbortController, setTimeout, clearTimeout,
        location, history, navigator:{onLine:true},
        localStorage:{getItem(){return null;}},sessionStorage:{getItem(){return null;}},
        document:{getElementById:element,querySelectorAll:selector=>selector==='[data-view]'?links:[]},
        window:{scrollTo(){}}, fetch:async()=>{throw new Error('Unexpected fetch');}});
    const source=fs.readFileSync(require.resolve('../analytics-dashboard.js'),'utf8');
    vm.runInContext(source.slice(0,source.indexOf("$('gateForm').onsubmit")),context);
    return { run:code=>vm.runInContext(code,context), element, location, history, context };
}

test('traffic drill-down uses the same buckets as the analytics service',()=>{
    const app=dashboard();
    for(const [referrer,path,label] of [
        ['https://x.com/profile','https://folio.example','Twitter'],
        ['https://t.co/abc','https://folio.example','Twitter'],
        ['','https://folio.example/?utm_source=Twitter-newsletter','Twitter'],
        ['https://google.com','https://folio.example/?src=LinkedIn-profile','LinkedIn'],
        ['','https://folio.example/?utm_source=NEWSLETTER','newsletter'],
        ['','https://folio.example/','Direct / unknown'],
        ['','http://localhost:8000/','Local'],
        ['https://www.google.com/search?q=test','https://folio.example/','google.com']
    ]) assert.equal(app.run(`sourceLabel(${JSON.stringify(referrer)},${JSON.stringify(path)})`),label);
});

test('combined visitor filters match a single visit and preserve the complete visitor history',()=>{
    const app=dashboard();
    app.run(`sessions=[
        {id:'a1',visitor_id:'a',started_at:30,device:'phone',path:['t1v1'],referrer:'https://linkedin.com',visit_number:2},
        {id:'a2',visitor_id:'a',started_at:20,device:'desktop',path:['t1v2'],referrer:'https://google.com',visit_number:1},
        {id:'b1',visitor_id:'b',started_at:10,device:'desktop',path:['t1v1'],referrer:'https://linkedin.com',visit_number:1}
    ];projectFilter='t1v1';sourceFilter='LinkedIn';`);
    app.element('deviceFilter').value='desktop';
    assert.equal(app.run('filteredGuests().map(g=>g.key).join()'),'b','must not combine one visit’s device with another visit’s project');
    app.element('deviceFilter').value='phone';
    assert.equal(app.run('filteredGuests()[0].visits.length'),2,'drawer retains the whole period history');
    assert.equal(app.run('matchingVisits(filteredGuests()[0])[0].id'),'a1');
    app.element('visitType').value='returning';
    assert.equal(app.run('filteredGuests().length'),1);
    app.element('visitorSearch').value='UNICORN';
    assert.equal(app.run('filteredGuests().length'),0);
    app.element('visitorSearch').value='acquisition';
    assert.equal(app.run('filteredGuests().length'),1);
});

test('project aliases and returning visitors are not confused with an extra browser tab',()=>{
    const app=dashboard();
    app.run(`sessions=[{id:'a',started_at:20,path:['landing-video'],visit_number:2,is_tab:1},{id:'b',started_at:10,path:['landing'],visit_number:3,is_tab:0}];projectFilter='landing';`);
    assert.equal(app.run('filteredGuests().length'),2);
    app.element('visitType').value='returning';
    assert.equal(app.run('filteredGuests().map(g=>g.key).join()'),'b');
});

test('URL navigation restores the section, date range, search, filters and sort',()=>{
    const app=dashboard('http://localhost/analytics.html?range=30d&device=phone&type=returning&q=payzapp&project=t1v1&source=LinkedIn&sort=views#visits');
    app.run('readRoute()');
    assert.equal(app.element('pageTitle').textContent,'Visitors');
    assert.equal(app.element('deviceFilter').value,'phone');
    assert.equal(app.element('visitorSearch').value,'payzapp');
    assert.equal(app.run('range'),'30d');
    app.run("setView('projects')");
    assert.equal(app.location.hash,'#projects');
    assert.equal(app.location.searchParams.get('range'),'30d');
    assert.equal(app.location.searchParams.get('source'),'LinkedIn');
    assert.equal(app.element('nav-projects').attributes['aria-current'],'page');
    assert.equal(app.element('view-visits').hidden,true);
    app.location.href='http://localhost/analytics.html?range=invalid&device=bad&sort=bad#constructor';
    app.run('readRoute()');
    assert.equal(app.element('pageTitle').textContent,'Overview');
    assert.equal(app.element('deviceFilter').value,'');
    assert.equal(app.element('projectSort').value,'seconds');
    assert.equal(app.run('range'),'7d');
});

test('failed date-range refresh keeps the previous data and restores its date label and URL',async()=>{
    const app=dashboard('http://localhost/analytics.html?range=30d#projects');
    app.run("overview={visitors:5};loadedRange='7d';readRoute();renderAll=()=>{};api=async()=>{throw new Error('Network unavailable');}");
    await assert.rejects(app.run('loadBoard()'),/Network unavailable/);
    assert.equal(app.run('range'),'7d');
    assert.equal(app.run('overview.visitors'),5);
    assert.equal(app.location.searchParams.get('range'),null);
    assert.equal(app.element('refreshBtn').disabled,false);
    assert.equal(app.element('dashboardContent').attributes['aria-busy'],'false');
});

test('changing periods aborts the earlier load so late results cannot replace the newest data',async()=>{
    const app=dashboard();
    app.run(`renderAll=()=>{};let finishOld;
        api=(path,signal)=>path.includes('overview')?new Promise(resolve=>{finishOld=resolve;}):Promise.resolve({sessions:[],total:0});
        var first=loadBoard();range='30d';
        api=async path=>path.includes('overview')?{visitors:30}:{sessions:[],total:0};
        var second=loadBoard();`);
    await app.run('second');
    app.run('finishOld({visitors:7})');
    await app.run('first');
    assert.equal(app.run('overview.visitors'),30);
    assert.equal(app.run('loadedRange'),'30d');
});

test('local traffic scope survives navigation and is sent with session requests',()=>{
    const app=dashboard('http://localhost/analytics.html?range=all&excludeLocal=1#traffic');
    app.run('readRoute()');
    assert.equal(app.run('excludeLocal'),true);
    assert.equal(app.run("listParams().get('excludeLocal')"),'1');
    app.run("setView('visits')");
    assert.equal(app.location.searchParams.get('excludeLocal'),'1');
    app.run('excludeLocal=false;writeRoute()');
    assert.equal(app.location.searchParams.has('excludeLocal'),false);
});

test('an older server cannot silently show unfiltered totals with exclusion enabled',async()=>{
    const app=dashboard();
    app.run(`overview={visitors:8};loadedExcludeLocal=false;excludeLocal=true;renderAll=()=>{};
        api=async path=>path.includes('overview')?{visitors:8}:{sessions:[],total:0};`);
    await assert.rejects(app.run('loadBoard()'),/updated analytics server/);
    assert.equal(app.run('excludeLocal'),false);
    assert.equal(app.run('overview.visitors'),8);
    assert.equal(app.element('excludeLocal').attributes['aria-checked'],'false');
    assert.equal(app.location.searchParams.has('excludeLocal'),false);
});

test('a filtered shared link can still unlock against an older server with a visible fallback notice',async()=>{
    const app=dashboard('http://localhost/analytics.html?excludeLocal=1#overview');
    app.run(`readRoute();renderAll=()=>{};api=async path=>path.includes('overview')?{visitors:8}:{sessions:[],total:0};`);
    assert.equal(await app.run('loadBoard()'),true);
    assert.equal(app.run('excludeLocal'),false);
    assert.equal(app.element('errorBanner').hidden,false);
    assert.match(app.element('errorMessage').textContent,/updated analytics server/);
    assert.equal(app.location.searchParams.has('excludeLocal'),false);
});

test('journey grouping preserves order, project changes, intervening actions and long gaps',()=>{
    const app=dashboard();
    const events=[
        {action:'session_start',ts:0},
        {action:'video_view',ts:1,payload:{videoId:'landing-video'}},
        {action:'video_heartbeat',ts:15001,payload:{videoId:'landing',seconds:15}},
        {action:'video_heartbeat',ts:30001,payload:{videoId:'landing',seconds:15}},
        {action:'outbound_click',ts:31000,payload:{label:'Email'}},
        {action:'video_heartbeat',ts:45000,payload:{videoId:'landing',seconds:5}},
        {action:'video_view',ts:46000,payload:{videoId:'t1v1'}},
        {action:'video_heartbeat',ts:150000,payload:{videoId:'t1v1',seconds:10}}
    ];
    const result=JSON.parse(app.run(`JSON.stringify(groupActivity(${JSON.stringify(events)}))`));
    assert.equal(result.length,6);
    assert.equal(result[1].id,'landing');
    assert.equal(result[1].seconds,30);
    assert.equal(result[1].records,3);
    assert.equal(result[2].event.action,'outbound_click');
    assert.equal(result[3].seconds,5);
    assert.equal(result[4].opens,1);
    assert.equal(result[5].opens,0);
});

test('journey includes each recorded event and distinguishes likes from unlikes',()=>{
    const app=dashboard();
    const html=app.run(`renderActivity([
        {action:'video_view',ts:1000,payload:{videoId:'landing'}},
        {action:'video_heartbeat',ts:2000,payload:{videoId:'landing',seconds:5}},
        {action:'like_toggle',ts:3000,payload:{videoId:'landing',liked:true}},
        {action:'like_toggle',ts:4000,payload:{videoId:'landing',liked:false}}
    ])`);
    assert.equal((html.match(/<li /g)||[]).length,4);
    assert.match(html,/is-liked/);assert.match(html,/is-unliked/);
    const text=html.replace(/<[^>]*>/g,'');
    assert.match(text,/Liked Introduction/);assert.match(text,/Unliked Introduction/);
});
test('loading visualization retains missing measurements and uses a shared time scale',()=>{
    const app=dashboard();
    const html=app.run(`renderDeviceDetails({ttfb_ms:100,fcp_ms:200,load_ms:400},{})`);
    assert.match(html,/width:25%/);assert.match(html,/width:50%/);assert.match(html,/width:100%/);
    const empty=app.run('renderDeviceDetails({},{})');
    assert.match(empty,/Not reported/);assert.doesNotMatch(empty,/width:NaN|width:Infinity/);
});

test('visitor like badges use the latest reaction across visits and omit removed likes',()=>{
    const app=dashboard();
    const html=app.run(`visitorLikes([{reactions:[{videoId:'t1v1',liked:true,ts:1,eventId:1},{videoId:'t1v2',liked:true,ts:1,eventId:2}]},{reactions:[{videoId:'t1v1',liked:false,ts:2,eventId:3}]}])`);
    assert.match(html,/1 like/);
    assert.equal(app.run(`visitorLikes([{reactions:[{videoId:'landing',liked:true,ts:1},{videoId:'landing-video',liked:false,ts:2}]}])`),'');
    assert.equal(app.run('visitorLikes([{}])'),'');
});
