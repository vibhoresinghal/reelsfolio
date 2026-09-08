'use strict';

const WORKER = 'https://reelsfolio-likes.vibhoresinghal.workers.dev';
const TOKEN_KEY = 'rf_analytics_token';
const PAGE = 20;
const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat().format(Number(value) || 0);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const present = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const metricNumber = value => present(value) ? number(value) : '&mdash;';
const CLIPS = { landing: 'Introduction', 'landing-video': 'Introduction', t1v1: 'Acquisition on PayZapp', t1v2: 'Growth & Retention on PayZapp', t1v3: 'Unicorn Design System', t1v4: 'Neo', t2v1: 'HueRex', t3v1: 'Veronica', t4v1: 'A Weekend in Sakleshpur', t4v2: 'Delhi in a lapse', t4v3: 'Ladakh 2018' };
const CATEGORIES = { landing: 'Introduction', zeta: 'Zeta', personal: 'Personal projects', films: 'Films', life: 'Life' };
const clipName = id => CLIPS[id] || id || 'Unknown project';
let token = '';
try {
    const saved = localStorage.getItem(TOKEN_KEY);
    token = saved || sessionStorage.getItem(TOKEN_KEY) || '';
    if (token) $('remember').checked = !!saved;
} catch (_) {}
let range = '7d', overview = null, sessions = [], totalVisits = 0;
let boardController, listController, detailController, selectedId = '', lastUpdated = 0;
let chartDays = [], returnFocus = null, listBusy = false;
let loadedRange = '7d', loadedDevice = '';
let guestVisible = PAGE, selectedSessionId = ''; 

function watchLabel(value) {
    if (!present(value)) return '\u2014';
    const n = Math.max(0, Math.round(Number(value)));
    if (n < 60) return `${n}s`;
    if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`;
    return `${Math.floor(n / 3600)}h ${Math.floor(n % 3600 / 60)}m`;
}
const milliseconds = value => present(value) ? `${(Number(value) / 1000).toFixed(2)}s` : '\u2014';
const stamp = value => value ? new Date(value).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true}) : 'Time unavailable';
const SOURCE_HELP = 'No referring site was shared. This can happen with a typed address, bookmark, private message, or browser privacy settings.';
const trafficLabel = label => /^(direct(?:\s*\/\s*unknown)?|unknown(?: source)?|)$/i.test(String(label || '').trim()) ? 'Source not shared' : String(label);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const shortDate = date => date.toLocaleDateString(undefined, {month:'short', day:'numeric'});
function sourceLabel(referrer, path) {
    try {
        const url = new URL(path || location.href);
        const campaign = url.searchParams.get('utm_source') || url.searchParams.get('src') || url.searchParams.get('from');
        if (campaign) return /linkedin/i.test(campaign) ? 'LinkedIn' : campaign;
    } catch (_) {}
    if (!referrer) return 'Source not shared';
    try { const host = new URL(referrer).hostname.replace(/^www\./,''); return /linkedin/.test(host) ? 'LinkedIn' : host; }
    catch (_) { return 'Source not shared'; }
}
function visitStatus(s) {
    if (s.is_tab) return '<span class="badge tab">Another tab</span>';
    if (Number(s.visit_number) > 1) return '<span class="badge returning">Returning</span>';
    return '<span class="badge">New visit</span>';
}
function sessionDuration(s) { return watchLabel(Math.max(0, ((s.ended_at || s.started_at) - s.started_at) / 1000)); }
function delta(value) {
    if (range === 'all' || !present(value)) return '';
    const n = Number(value);
    return `<span class="delta ${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${n > 0 ? '&#8593;' : n < 0 ? '&#8595;' : ''} ${Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:1})}% vs prior period</span>`;
}
function setPeriod() {
    const labels = {today:'Today', '7d':'Last 7 days', '30d':'Last 30 days', all:'All recorded time'};
    $('periodContext').textContent = labels[range] + (range === 'all' ? '' : ' / compared with prior period');
    $('timezoneLabel').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g,' ');
}
async function api(path, signal) {
    const response = await fetch(WORKER + path, {headers:{Authorization:`Bearer ${token}`}, signal});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403 ? 'Please unlock the dashboard again.' : data.error || `Request failed (${response.status}).`);
        error.auth = response.status === 401 || response.status === 403;
        throw error;
    }
    return data;
}
function reportError(error) {
    if (error.name === 'AbortError') return;
    if (error.auth) { lockRoom(); $('gateError').textContent = error.message; return; }
    $('errorMessage').textContent = navigator.onLine ? `Couldn't update the dashboard. ${error.message}` : 'You are offline. Your last loaded data is still here.';
    $('errorBanner').hidden = false;
    $('freshness').textContent = lastUpdated ? `Showing data from ${stamp(lastUpdated)}` : 'Data unavailable';
}
function projectsData() {
    const map = new Map();
    const get = id => { const key = id === 'landing-video' ? 'landing' : id; if (!map.has(key)) map.set(key,{id:key, views:null, seconds:null, average:null}); return map.get(key); };
    for (const row of overview?.clips || []) { const p = get(row.videoId); p.views = (p.views || 0) + (Number(row.n) || 0); }
    for (const row of overview?.watch || []) { const p = get(row.videoId); p.seconds = (p.seconds || 0) + (Number(row.seconds) || 0); }
    return [...map.values()].map(p => ({...p, average:p.views > 0 && present(p.seconds) ? p.seconds / p.views : null}));
}
function renderOverview() {
    const o = overview, d = o.deltas || {};
    const metrics = [
        ['Visitors', metricNumber(o.visitors), d.visitors, `${number(o.visits)} recorded visits`],
        ['Watch time', esc(watchLabel(o.watchSeconds)), d.watch, 'Across reported projects'],
        ['Average visit', esc(watchLabel(present(o.avgSessionMs) ? o.avgSessionMs / 1000 : null)), d.avgSession, 'First to last recorded event'],
        ['Link clicks', metricNumber(o.outboundTotal), d.outbound, 'Resume, socials & project links']
    ];
    $('kpis').innerHTML = metrics.map(([label,value,change,caption]) => `<article class="metric"><p class="metric-label">${label}</p><strong class="metric-value numeric">${value}</strong>${delta(change)}<p class="metric-caption">${caption}</p></article>`).join('');
    $('overviewSubtitle').textContent = o.visitors > 0 ? `${number(o.visitors)} recognized browsers visited your portfolio in this period.` : 'No visitors recorded in this period yet.';
    renderChart();
    const outbound = new Map((o.outbound || []).map(r=>[String(r.label).toLowerCase(),r]));
    const outboundRows = ['resume','linkedin','email','x'].map(key => {
        const item = outbound.get(key); outbound.delete(key);
        return {label:({resume:'Resume',linkedin:'LinkedIn',email:'Email',x:'X'})[key], n:item?.n ?? null};
    }).concat([...outbound.values()]).filter(r=>present(r.n));
    $('outbound').innerHTML = outboundRows.length ? `<div class="outbound-grid">${outboundRows.map(r=>`<div class="outbound-item"><span>${esc(r.label)}</span><b class="numeric">${metricNumber(r.n)}</b></div>`).join('')}</div>` : '<p class="empty">No link clicks reported.</p>';
    const sources = o.sources || [], sourceTotal = sources.reduce((sum,r)=>sum+(Number(r.n)||0),0);
    $('sources').innerHTML = sources.length ? sources.map(r=>`<div class="bar-row"><div class="bar-label"><p>${esc(trafficLabel(r.label))}</p><span>${number(r.n)} visits / ${sourceTotal ? Math.round(r.n/sourceTotal*100) : 0}%</span></div><div class="bar-track"><div class="bar-fill" style="--share:${sourceTotal ? Math.max(0,Math.min(100,r.n/sourceTotal*100)) : 0}%"></div></div></div>`).join('') + (sources.some(r=>trafficLabel(r.label)==='Source not shared') ? `<p class="source-explanation">${SOURCE_HELP}</p>` : '') : '<p class="empty">Arrival sources will appear after your first visits.</p>';
    const best = projectsData().filter(p=>p.id!=='landing' && p.seconds>0).sort((a,b)=>b.seconds-a.seconds)[0];
    $('insights').innerHTML = `<div class="quick-insight"><span>Most watched</span><strong>${best ? esc(clipName(best.id)) : 'No watch activity yet'}</strong>${best ? `<span>${watchLabel(best.seconds)} watch time</span>` : ''}</div><div class="quick-insight"><span>Average page load</span><strong class="numeric">${milliseconds(o.load?.load)}</strong></div>`;
}
function fillDays(daily) {
    const map = new Map(daily.map(r=>[r.day,Number(r.n)||0]));
    const end = new Date(); end.setHours(0,0,0,0);
    let start = new Date(end);
    if (range === 'all' && daily.length) start = new Date([...map.keys()].sort()[0]+'T00:00:00');
    // The service uses rolling 7/30-day windows, including a partial first day.
    else start.setDate(start.getDate()-(range==='30d'?30:range==='7d'?7:0));
    const days = [];
    for (const date = new Date(start); date <= end; date.setDate(date.getDate()+1)) days.push({day:dateKey(date), label:shortDate(date), n:map.get(dateKey(date))||0});
    return days.length ? days : [{day:dateKey(end), label:shortDate(end), n:0}];
}
function renderChart() {
    chartDays = fillDays(overview.daily || []);
    const max = Math.max(1,...chartDays.map(d=>d.n));
    const points = chartDays.map((d,i)=>({x:chartDays.length===1?250:10+i*480/(chartDays.length-1),y:145-d.n/max*125}));
    const path = points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    $('chart').innerHTML = `<div class="chart-readout" id="chartReadout" aria-live="polite"></div><svg class="chart-plot" id="chartPlot" viewBox="0 0 500 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d8b98b" stop-opacity=".18"/><stop offset="1" stop-color="#d8b98b" stop-opacity="0"/></linearGradient></defs><path d="M0 20H500M0 82H500M0 145H500" stroke="#343638" stroke-dasharray="3 5" fill="none"/><path d="${path}L${points.at(-1).x},160L${points[0].x},160Z" fill="url(#chartFill)"/><path d="${path}" fill="none" stroke="#d8b98b" stroke-width="2.5" vector-effect="non-scaling-stroke"/><circle id="chartDot" r="4" fill="#f1eee4" stroke="#1b1d1f" stroke-width="2"/></svg><div class="chart-axis"><span>${esc(chartDays[0].label)}</span><span>${max} max / day</span><span>${esc(chartDays.at(-1).label)}</span></div><label class="note chart-helper" for="chartSlider">${chartDays.length>1?'Slide to inspect a day':'Today\u2019s recorded visitors'}</label><input class="chart-slider" id="chartSlider" type="range" min="0" max="${chartDays.length-1}" value="${chartDays.length-1}" step="1" ${chartDays.length===1?'disabled':''}>`;
    function selectDay(index) {
        const i = Math.max(0,Math.min(points.length-1,index)), p = points[i], d = chartDays[i];
        $('chartReadout').innerHTML = `<strong class="numeric">${number(d.n)}</strong><span>${d.n===1?'visitor':'visitors'} on ${esc(d.label)}</span>`;
        $('chartDot').setAttribute('cx',p.x); $('chartDot').setAttribute('cy',p.y);
        $('chartSlider').value = i; $('chartSlider').setAttribute('aria-valuetext',`${d.label}: ${d.n} visitors`);
    }
    $('chartSlider').oninput = e=>selectDay(Number(e.target.value));
    $('chartPlot').onpointerdown = e=>{const rect=e.currentTarget.getBoundingClientRect();selectDay(Math.round((e.clientX-rect.left)/rect.width*(points.length-1)));};
    selectDay(chartDays.length-1);
}
function renderProjects() {
    const key = $('projectSort').value, rows = projectsData().sort((a,b)=>(b[key]??-1)-(a[key]??-1));
    const secondsTotal = rows.reduce((s,p)=>s+(p.seconds||0),0);
    $('projects').innerHTML = rows.length ? rows.map((p,i)=>`<article class="card project-card"><div class="project-top"><span class="rank numeric">${String(i+1).padStart(2,'0')}</span><h2>${esc(clipName(p.id))}</h2>${present(p.seconds)&&secondsTotal?`<span class="project-share numeric" aria-label="${Math.round(p.seconds/secondsTotal*100)}% of reported watch time">${Math.round(p.seconds/secondsTotal*100)}%</span>`:''}</div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--share:${secondsTotal?(p.seconds||0)/secondsTotal*100:0}%"></div></div><div class="project-stats"><div><strong class="numeric">${metricNumber(p.views)}</strong><span>Views</span></div><div><strong class="numeric">${esc(watchLabel(p.seconds))}</strong><span>Watch time</span></div><div><strong class="numeric">${esc(watchLabel(p.average))}</strong><span>Watch / view</span></div></div></article>`).join('') : '<div class="empty"><strong>No project activity yet</strong>Recorded video views and watch time will appear here.</div>';
}
function guestGroups() {
    const groups = new Map();
    for (const session of sessions) {
        const key = session.visitor_id || session.id;
        if (!groups.has(key)) groups.set(key, {key, visits: []});
        groups.get(key).visits.push(session);
    }
    return [...groups.values()].map(group => {
        group.visits.sort((a,b)=>b.started_at-a.started_at);
        group.latest = group.visits[0];
        return group;
    }).sort((a,b)=>b.latest.started_at-a.latest.started_at);
}
function renderVisits() {
    const guests = guestGroups(), visible = guests.slice(0, guestVisible);
    $('visitCount').textContent = number(guests.length) + (guests.length===1?' guest':' guests');
    $('visits').innerHTML = visible.length ? visible.map(group=>{
        const s = group.latest, count = group.visits.length;
        const path = [...new Set(group.visits.flatMap(visit=>visit.path||[]).map(clipName))];
        const route = path.length ? path.slice(0,2).join(' \u2192 ')+(path.length>2?' +'+(path.length-2)+' more':'') : 'No project opened';
        return '<button class="visit-card" data-session="'+esc(group.key)+'" aria-haspopup="dialog"><span class="visit-heading"><strong>'+(s.guest_number?'Guest '+esc(s.guest_number):'Guest')+'</strong><span class="badge'+(count>1?' returning':'')+'">'+number(count)+(count===1?' visit':' visits')+'</span></span><span class="visit-meta">Last seen '+esc(stamp(s.started_at))+'</span><span class="visit-path">'+esc(route)+'</span><span class="visit-footer"><span>'+esc([s.os||s.device,s.browser].filter(Boolean).join(' / ')||'Device not reported')+' &middot; '+esc(sourceLabel(s.referrer,s.landing_path))+'</span><span class="arrow" aria-hidden="true">&rarr;</span></span></button>';
    }).join('') : '<div class="empty"><strong>No guests in this view</strong>Try a different date range or device.</div>';
    $('loadMore').hidden = guestVisible>=guests.length;
    $('loadMore').disabled = listBusy;
    $('visitScope').textContent = visible.length<guests.length ? number(visible.length)+' of '+number(guests.length)+' guests shown' : '';
}

function renderAll() { renderOverview(); renderProjects(); renderVisits(); }
function listParams(offset=0) { return new URLSearchParams({range,limit:String(PAGE),offset:String(offset),tz:String(new Date().getTimezoneOffset()),device:$('deviceFilter').value}); }
// Group the complete filtered session set, not just the first API page.
async function fetchGuestSessions(signal) {
    const params = listParams(0);
    params.set('limit','80');
    const rows = [];
    let total = Infinity;
    while (rows.length < total) {
        params.set('offset',String(rows.length));
        const page = await api('/analytics/sessions?'+params,signal);
        const batch = page.sessions || [];
        total = Number(page.total) || 0;
        if (!batch.length) break;
        rows.push(...batch);
    }
    return {sessions:[...new Map(rows.map(row=>[row.id,row])).values()],total};
}
async function loadBoard() {
    boardController?.abort(); listController?.abort(); listController=null; listBusy=false;
    const controller = boardController = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),20000);
    $('errorBanner').hidden=true; $('refreshBtn').disabled=true; $('deviceFilter').disabled=true;
    $('dashboardContent').setAttribute('aria-busy','true'); $('freshness').textContent='Updating dashboard...'; $('initialLoading').hidden=!!overview; setPeriod();
    try {
        const [o,list] = await Promise.all([api(`/analytics/overview?range=${range}&tz=${new Date().getTimezoneOffset()}`,controller.signal),fetchGuestSessions(controller.signal)]);
        if (controller!==boardController) return false;
        overview=o; sessions=list.sessions||[]; totalVisits=Number(list.total)||0;
        loadedRange=range; loadedDevice=$('deviceFilter').value; guestVisible=PAGE;
        renderAll(); lastUpdated=Date.now(); $('freshness').textContent=`Updated ${new Date(lastUpdated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}`;
        return true;
    } catch(e) {
        if(controller!==boardController) return false;
        if (overview) {
            range=loadedRange;
            for (const b of $('ranges').children) b.setAttribute('aria-pressed',String(b.dataset.range===range));
            setPeriod();
        }
        if(e.name==='AbortError') throw new Error('The request timed out. Please try again.');
        throw e;
    } finally {
        clearTimeout(timeout);
        if(controller===boardController){$('refreshBtn').disabled=false;$('deviceFilter').disabled=false;$('dashboardContent').setAttribute('aria-busy','false');$('initialLoading').hidden=true;}
    }
}
async function loadVisits(append=false) {
    if (append) {
        const old = Math.min(guestVisible,guestGroups().length);
        guestVisible += PAGE;
        renderVisits();
        $('visits').children[old]?.focus({preventScroll:true});
        return;
    }
    listController?.abort();
    const controller=listController=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    listBusy=true; $('loadMore').disabled=true; $('visits').setAttribute('aria-busy','true');
    try {
        const list=await fetchGuestSessions(controller.signal);
        if(controller!==listController)return;
        sessions=list.sessions; totalVisits=Number(list.total)||0; guestVisible=PAGE;
        loadedDevice=$('deviceFilter').value;
        renderVisits(); $('errorBanner').hidden=true;
    } catch(e) { if(controller===listController){$('deviceFilter').value=loadedDevice;reportError(e.name==='AbortError'?new Error('Loading guests timed out.'):e);} }
    finally {clearTimeout(timeout);if(controller===listController){listBusy=false;$('loadMore').disabled=false;$('visits').setAttribute('aria-busy','false');}}
}

function eventText(event) {
    const p=event.payload||{};
    switch(event.action) {
        case 'session_start': return 'Arrived at the portfolio';
        case 'video_view': return `Opened ${clipName(p.videoId)}`;
        case 'video_heartbeat': return `Watched ${clipName(p.videoId)} for ${watchLabel(p.seconds)}`;
        case 'like_toggle': return `${p.liked?'Liked':'Unliked'} ${clipName(p.videoId)}`;
        case 'outbound_click': return `Clicked ${p.label||'a link'}`;
        case 'tab_visit': return `Explored ${CATEGORIES[p.category]||p.category||'another category'}`;
        case 'grid_open': return 'Opened the former grid view';
        default: return String(event.action||'Activity').replace(/_/g,' ');
    }
}
function renderDetail(detail) {
    const s={...sessions.find(s=>s.id===selectedSessionId),...detail.session};
    const events=[...(detail.events||[])].sort((a,b)=>a.ts-b.ts);
    const snapshot=events.find(e=>e.action==='session_start')?.payload?.session||{};
    const seconds=events.filter(e=>e.action==='video_heartbeat').reduce((sum,e)=>sum+(Number(e.payload?.seconds)||0),0);
    const clicks=events.filter(e=>e.action==='outbound_click').length;
    const facts=[['Time on site',sessionDuration(s)],['Video watch time',watchLabel(seconds)],['Videos opened',number(new Set(events.filter(e=>e.action==='video_view').map(e=>e.payload?.videoId === 'landing-video' ? 'landing' : e.payload?.videoId).filter(Boolean)).size)],['Link clicks',number(clicks)]];
    const tech=[['Device & browser',[s.os||s.device,s.browser].filter(Boolean).join(' / ')||'Not reported'],['Network',s.connection||snapshot.connection||'Not reported'],['Browser size',s.viewport||snapshot.viewport||'Not reported'],['Visitor timezone',s.timezone||snapshot.timezone||'Not reported'],['Server response time',milliseconds(s.ttfb_ms??snapshot.ttfbMs)],['First content appeared',milliseconds(s.fcp_ms??snapshot.fcpMs)],['Page finished loading',milliseconds(s.load_ms??snapshot.loadMs)],['Language',s.language||snapshot.language||'Not reported'],['Prefers less animation',s.reduced_motion!=null?(s.reduced_motion?'Yes':'No'):snapshot.reducedMotion!=null?(snapshot.reducedMotion?'Yes':'No'):'Not reported'],['Visit number',s.visit_number||'Not reported']];
    const markup=rows=>`<dl class="facts">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd class="numeric">${esc(value)}</dd></div>`).join('')}</dl>`;
    const arrival = sourceLabel(s.referrer,s.landing_path);
    $('sessionDetail').innerHTML=`<div class="dialog-hero">${visitStatus(s)}<h2>${s.guest_number?`Guest ${esc(s.guest_number)}`:'Visitor'}</h2><p>${esc(stamp(s.started_at))}<br>Source: ${esc(arrival)}</p>${arrival==='Source not shared'?`<p class="source-explanation">${SOURCE_HELP}</p>`:''}</div>${markup(facts)}<section class="tech-data"><h3>Device & page loading</h3>${markup(tech)}<p>Loading times describe the page, not when the video was ready to play.</p><p>First page visited: ${esc(s.landing_path||'Not reported')}</p><p>Referring page: ${esc(s.referrer||'Not shared')}</p></section><h3>Visit activity</h3><ol class="timeline">${events.map(e=>`<li><p>${esc(eventText(e))}</p><time>${esc(stamp(e.ts))}</time></li>`).join('')||'<li><p>No events recorded.</p></li>'}</ol>`;
}
async function fetchDetail(id) {
    detailController?.abort();
    selectedSessionId=id;
    for (const button of $('visitDetail').querySelectorAll('[data-guest-session]')) button.setAttribute('aria-pressed',String(button.dataset.guestSession===id));
    const controller=detailController=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    $('sessionDetail').innerHTML='<p class="empty" role="status">Loading this visit...</p>';
    try {
        const detail=await api('/analytics/sessions/'+encodeURIComponent(id),controller.signal);
        if(selectedSessionId===id&&controller===detailController)renderDetail(detail);
    } catch(e) {
        if(controller!==detailController)return;
        if(e.auth){reportError(e);return;}
        $('sessionDetail').innerHTML='<div class="empty"><strong>Could not load this visit</strong><button class="soft-button" id="retryDetail">Retry</button></div>';
        $('retryDetail').onclick=()=>fetchDetail(id);
    } finally {clearTimeout(timeout);}
}
function openGuest(id) {
    const group=guestGroups().find(guest=>guest.key===id);
    if(!group)return;
    selectedId=id; returnFocus=document.activeElement;
    const guestName=group.latest.guest_number?'Guest '+group.latest.guest_number:'Guest';
    $('visitHeading').textContent=guestName;
    const count=group.visits.length;
    $('visitDetail').innerHTML='<section class="guest-history" aria-label="Guest visits"><p class="guest-history-label">'+number(count)+(count===1?' visit':' visits')+' in this date range'+(loadedDevice?' on this device':'')+'</p>'+(count>1?'<div class="guest-session-list" aria-label="Choose a visit">'+group.visits.map((s,i)=>'<button class="guest-session" data-guest-session="'+esc(s.id)+'" aria-pressed="'+(i===0)+'" aria-controls="sessionDetail"><span>'+esc(stamp(s.started_at))+'</span><span class="note">'+(s.visit_number?'Visit '+esc(s.visit_number)+' &middot; ':'')+esc(sessionDuration(s))+(i===0?' &middot; Latest':'')+'</span></button>').join('')+'</div>':'')+'</section><div id="sessionDetail" aria-live="polite"></div>';
    $('visitDialog').showModal(); document.body.classList.add('detail-open'); $('visitDialog').scrollTop=0;
    history.pushState({rfVisit:id},'',location.href); $('closeVisit').focus({preventScroll:true}); fetchDetail(group.latest.id);
}

function dismissDetail() {
    detailController?.abort(); detailController=null; selectedId=''; selectedSessionId='';
    $('visitDialog').close(); document.body.classList.remove('detail-open'); returnFocus?.focus({preventScroll:true});
}
function closeGuest() {if(history.state?.rfVisit)history.back();else dismissDetail();}
function setView(next,focus=false) {
    if(!['overview','projects','visits'].includes(next))return;
    for(const b of $('viewNav').querySelectorAll('[data-view]')) {const on=b.dataset.view===next;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;$('view-'+b.dataset.view).hidden=!on;if(on&&focus)b.focus();}
    window.scrollTo({top:0,behavior:'instant'});
}
async function unlock(secret) {
    token=secret.trim(); if(!token)throw new Error('Enter your dashboard password.');
    if(!await loadBoard())return;
    try {localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);($('remember').checked?localStorage:sessionStorage).setItem(TOKEN_KEY,token);} catch(_) {}
    $('gate').hidden=true; $('app').hidden=false; $('tokenInput').value='';
}
function lockRoom() {
    boardController?.abort();boardController=null;listController?.abort();listController=null;dismissDetail();
    if(history.state?.rfVisit)history.replaceState({},'',location.href);
    try {localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);} catch(_) {}
    token='';overview=null;sessions=[];totalVisits=0;lastUpdated=0;
    $('gate').hidden=false;$('app').hidden=true;$('tokenInput').value='';$('gateError').textContent='';$('tokenInput').focus();
}
$('gateForm').onsubmit=async e=>{e.preventDefault();$('unlockBtn').disabled=true;$('unlockBtn').textContent='Opening...';$('gateError').textContent='';try{await unlock($('tokenInput').value);}catch(error){$('gateError').textContent=error.message;}finally{$('unlockBtn').disabled=false;$('unlockBtn').textContent='Open dashboard';}};
$('refreshBtn').onclick=$('retryBtn').onclick=()=>loadBoard().catch(reportError);
$('lockBtn').onclick=lockRoom;
$('ranges').onclick=e=>{const b=e.target.closest('[data-range]');if(!b||b.dataset.range===range)return;range=b.dataset.range;for(const other of $('ranges').children)other.setAttribute('aria-pressed',String(other===b));loadBoard().catch(reportError);};
$('viewNav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view);};
$('viewNav').onkeydown=e=>{
    const tabs=[...$('viewNav').children];let index=tabs.indexOf(document.activeElement);if(index<0)return;
    if(e.key==='ArrowRight')index=(index+1)%tabs.length;else if(e.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=tabs.length-1;else return;
    e.preventDefault();setView(tabs[index].dataset.view,true);
};
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go,true));
$('projectSort').onchange=renderProjects;$('deviceFilter').onchange=()=>loadVisits();$('loadMore').onclick=()=>loadVisits(true);
$('visits').onclick=e=>{const card=e.target.closest('[data-session]');if(card)openGuest(card.dataset.session);};
$('visitDetail').onclick=e=>{const button=e.target.closest('[data-guest-session]');if(button&&button.dataset.guestSession!==selectedSessionId)fetchDetail(button.dataset.guestSession);};
$('closeVisit').onclick=closeGuest;$('visitDialog').oncancel=e=>{e.preventDefault();closeGuest();};
$('visitDialog').onclick=e=>{if(e.target!==$('visitDialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeGuest();};
window.addEventListener('popstate',()=>{if($('visitDialog').open)dismissDetail();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lastUpdated&&Date.now()-lastUpdated>60000)$('freshness').textContent=`Last updated ${stamp(lastUpdated)}. Tap refresh.`;});
setPeriod();
const url=new URL(location.href), urlSecret=url.searchParams.get('token')||url.searchParams.get('password');
if(urlSecret){url.searchParams.delete('token');url.searchParams.delete('password');history.replaceState({},'',url.pathname+url.search+url.hash);}
if(urlSecret||token){$('unlockBtn').disabled=true;$('unlockBtn').textContent='Opening...';unlock(urlSecret||token).catch(error=>{$('gateError').textContent=error.message;}).finally(()=>{$('unlockBtn').disabled=false;$('unlockBtn').textContent='Open dashboard';});}
