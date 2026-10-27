'use strict';

const WORKER = 'https://reelsfolio-likes.vibhoresinghal.workers.dev';
const TOKEN_KEY = 'rf_analytics_token';
const PAGE = 20;
// Shared 24px icons keep navigation, actions and activity visually consistent.
const ICONS = {
    "mail": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 6 9 7 9-7\"/>",
    "document": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h5\"/>",
    "link-unknown": "<path d=\"m4 4 16 16M10 7l2-2a5 5 0 0 1 7 7l-2 2M7 10l-2 2a5 5 0 0 0 7 7l2-2\"/>",
    "browser": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M3 9h18M7 6.5h.01m3 0h.01\"/>",

    "arrow-right": "<path d=\"M5 12h14m-6-6 6 6-6 6\"/>",
    "arrow-left": "<path d=\"M19 12H5m6-6-6 6 6 6\"/>",
    "arrow-up-right": "<path d=\"M7 17 17 7M7 7h10v10\"/>",
    "arrow-up": "<path d=\"M12 19V5m-6 6 6-6 6 6\"/>",
    "arrow-down": "<path d=\"M12 5v14m-6-6 6 6 6-6\"/>",
    "chevron-right": "<path d=\"m9 5 7 7-7 7\"/>",
    "close": "<path d=\"m6 6 12 12M6 18 18 6\"/>",
    "overview": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
    "projects": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"m10 8 6 4-6 4Z\"/>",
    "visitors": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>",
    "traffic": "<path d=\"M12 21V3m-5 5 5-5 5 5M5 21v-4a7 7 0 0 1 7-7m7 11v-4a7 7 0 0 0-7-7\"/>",
    "refresh": "<path d=\"M3 11a9 9 0 0 1 15.5-6L21 8M21 3v5h-5M21 13A9 9 0 0 1 5.5 19L3 16m0 5v-5h5\"/>",
    "lock": "<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V6a4 4 0 0 1 8 0v4\"/>",
    "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"7.5\"/><path d=\"m16 16 5 5\"/>",
    "desktop": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M12 16v5m-4 0h8\"/>",
    "phone": "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"3\"/><path d=\"M11 18h2\"/>",
    "globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
    "play": "<path d=\"m8 4 12 8-12 8Z\"/>",
    "heart": "<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z\"/>",
    "enter": "<path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 12h12m-5-5 5 5-5 5\"/>"
};
const icon = name => '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS['arrow-right']) + '</svg>';

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
let boardController, detailController, selectedId = '', lastUpdated = 0;
let chartDays = [], returnFocus = null;
let loadedRange = '7d', excludeLocal = true, loadedExcludeLocal = true;
let guestVisible = PAGE, selectedSessionId = '';
let currentView = 'overview', projectFilter = '', sourceFilter = '', drawerKeys = [];
const viewMeta = {
    overview: ['Overview', 'The story behind your portfolio.'],
    projects: ['Projects', 'Understand which work earns attention, and how much.'],
    visits: ['Visitors', 'Go beyond the numbers. Explore each visitor’s journey.'],
    traffic: ['Traffic', 'See what brings people in and where they go next.']
};

// Browser artwork is bundled locally; unknown names never create asset URLs.
function browserInfo(browser) {
    const value = String(browser || '').trim();
    const match = [
        ['edge','Edge',/^(?:microsoft\s+)?(?:edge|edg)(?:\b|\/)/i],
        ['opera','Opera',/^(?:opera|opr)(?:\b|\/)/i],
        ['firefox','Firefox',/^(?:mozilla\s+)?(?:firefox|fxios)(?:\b|\/)/i],
        ['chrome','Chrome',/^(?:google\s+)?(?:chrome|crios)(?:\b|\/)/i],
        ['safari','Safari',/^(?:mobile\s+)?safari(?:\b|\/)/i]
    ].find(([, , pattern]) => pattern.test(value));
    return match ? {key:match[0],name:match[1]} : {key:'unknown',name:!value || /^(other|unknown)$/i.test(value) ? 'Browser not reported' : value};
}
const OS_MARKS = {
    macos: '<rect x="2" y="2" width="20" height="20" rx="4" fill="#c8e2ed"/><path d="M6 2h6v7l-2 4h3v9H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z" fill="#72b3df"/><path d="M12 3v6l-2 4h3v8M7 8v2m10-2v2M6 15c3 3 9 3 12 0" fill="none" stroke="#23465c" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    windows: '<path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/>',
    apple: '<path d="M16.6 1.3c.1 1.4-.5 2.8-1.3 3.7-.9 1-2.2 1.6-3.5 1.5-.2-1.4.5-2.7 1.3-3.6.9-1 2.4-1.6 3.5-1.6ZM20.9 17.2c-.5 1.2-.8 1.7-1.4 2.7-.9 1.3-2.1 2.9-3.6 2.9-1.3 0-1.7-.9-3.5-.9-1.7 0-2.2.9-3.5.9-1.5.1-2.7-1.5-3.6-2.8C2.8 16.4 2.3 11.2 4 8.5c1.2-1.9 3.1-3 5-2.8 1.4.1 2.5 1 3.4 1 .9 0 2.3-1.2 4-1 1.5.1 2.9.8 3.8 2-3.3 1.8-2.8 6.5.7 8.1v1.4Z"/>',
    android: '<path fill-rule="evenodd" d="M5 9a7 7 0 0 1 14 0H5Zm2.5-3a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm7 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z"/><path d="M7.5 4 6 1.5M16.5 4 18 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="5" y="10" width="14" height="9" rx="1.5"/><rect x="1" y="10" width="3" height="8" rx="1.5"/><rect x="20" y="10" width="3" height="8" rx="1.5"/><rect x="7" y="17" width="3" height="6" rx="1.5"/><rect x="14" y="17" width="3" height="6" rx="1.5"/>'
};
function osInfo(os) {
    const value = String(os || '').trim();
    if (/^windows(?:\b|$)/i.test(value)) return {key:'windows',name:'Windows',mark:'windows'};
    if (/^(?:ios|ipados|iphone|ipad)(?:\b|$)/i.test(value)) return {key:'ios',name:'iOS',mark:'apple'};
    if (/^(?:macos|mac os(?: x)?|macintosh|os x)(?:\b|$)/i.test(value)) return {key:'macos',name:'macOS',mark:'macos'};
    if (/^android(?:\b|$)/i.test(value)) return {key:'android',name:'Android',mark:'android'};
    return null;
}
function platformIcon(os) {
    const info = osInfo(os);
    return info ? '<svg class="platform-icon platform-' + info.key + '" viewBox="0 0 24 24" aria-hidden="true">' + OS_MARKS[info.mark] + '</svg>' : '';
}
function browserBadge(browser, os) {
    const info = browserInfo(browser), platform = osInfo(os);
    const label = info.name + (platform ? ' on ' + platform.name : '');
    const browserMark = info.key === 'unknown' ? icon('browser') : '<img src="assets/analytics/browsers/' + info.key + '.png" width="24" height="24" alt="" decoding="async">';
    return '<span class="browser-badge" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + (platform ? platformIcon(os) + '<span class="browser-corner" aria-hidden="true">' + browserMark + '</span>' : browserMark) + '</span>';
}
const BRAND_MARKS = {
    linkedin: '<rect x="2" y="2" width="20" height="20" rx="3" fill="#83b6d1"/><path fill="#102219" d="M6 10h3v8H6zm1.5-4.3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M11 10h2.8v1.1c.5-.8 1.3-1.3 2.5-1.3 2.4 0 3.2 1.5 3.2 3.7V18h-3v-4c0-1.1-.2-1.8-1.3-1.8-1.1 0-1.3.8-1.3 1.8v4H11z"/>',
    figma: '<path fill="#f58e74" d="M8.5 2H12v7H8.5a3.5 3.5 0 0 1 0-7"/><path fill="#f4b1a0" d="M12 2h3.5a3.5 3.5 0 0 1 0 7H12"/><path fill="#c4a0ed" d="M8.5 9H12v7H8.5a3.5 3.5 0 0 1 0-7"/><circle cx="15.5" cy="12.5" r="3.5" fill="#83c6e1"/><path fill="#8acaa7" d="M8.5 16H12v3.5A3.5 3.5 0 1 1 8.5 16"/>',
    x: '<path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.4l5.5 7.3L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5Z"/>'
};
const SOCIAL_SOURCES = [
    ['LinkedIn','linkedin',['linkedin.com','lnkd.in']],
    ['X','x',['x.com','twitter.com','t.co']],
    ['Instagram','instagram',['instagram.com']],
    ['Facebook','facebook',['facebook.com','fb.com','fb.me']],
    ['WhatsApp','whatsapp',['whatsapp.com','wa.me']],
    ['YouTube','youtube',['youtube.com','youtu.be']],
    ['Reddit','reddit',['reddit.com','redd.it']],
    ['Telegram','telegram',['telegram.org','t.me']],
    ['TikTok','tiktok',['tiktok.com']],
    ['Threads','threads',['threads.net','threads.com']],
    ['Pinterest','pinterest',['pinterest.com','pin.it']],
    ['Email','mail',['mail.google.com','outlook.live.com','outlook.office.com','outlook.office365.com','mail.yahoo.com']],
    ['Figma Community','figma',['figma.com']]
];
function socialSource(value) {
    const raw=String(value||'').trim().toLowerCase();
    let host=raw;
    try { host=new URL(raw.includes('://')?raw:'https://'+raw).hostname.toLowerCase().replace(/\.$/,''); } catch { return null; }
    return SOCIAL_SOURCES.find(([name,key,domains])=>raw===name.toLowerCase() || raw===key || (key==='x'&&raw==='twitter') || domains.some(domain=>host===domain||host.endsWith('.'+domain))) || null;
}
function groupedSources(rows) {
    const totals=new Map();
    for(const row of rows) {const label=trafficLabel(row.label);totals.set(label,(totals.get(label)||0)+(Number(row.n)||0));}
    return [...totals].map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n);
}
Object.assign(BRAND_MARKS,{
    instagram:'<g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></g><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>',
    facebook:'<path fill="currentColor" d="M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1h-3c-4 0-5 2.5-5 6v2H7v4h3v9z"/>',
    whatsapp:'<g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17a9 9 0 1 1 4 3L2 22z"/><path d="M8 7c-3 3 3 9 6 9l2-2-3-2-1 1-2-2 1-1z"/></g>',
    youtube:'<rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="m10 9 6 3-6 3z" fill="#17191a"/>',
    telegram:'<path fill="currentColor" d="m2 10 19-7-4 19-6-5-3 3 1-6 9-8-11 7z"/>',
    reddit:'<g fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="15" rx="9" ry="6"/><path d="m12 9 2-6 5 1M8 17q4 3 8 0"/><circle cx="20" cy="4" r="2"/></g><circle cx="8" cy="13" r="1.5" fill="currentColor"/><circle cx="16" cy="13" r="1.5" fill="currentColor"/>',
    tiktok:'<path fill="currentColor" d="M14 2h4c0 3 2 5 5 5v4a10 10 0 0 1-5-2v7a7 7 0 1 1-7-7v4a3 3 0 1 0 3 3z"/>',
    threads:'<g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7C18-1 3 0 3 12s17 13 18 3c1-7-14-8-14-1 0 6 13 3 9-6-1-3-6-3-8-1"/></g>',
    pinterest:'<path fill="none" stroke="currentColor" stroke-width="2.5" d="m9 22 4-16M11 15c12 7 14-17 0-13C-1 5 4 15 6 15"/>'
});
function channelKind(label) {
    const value = String(label || '').trim().toLowerCase();
    if (value === 'source not shared' || /^(direct(?:\s*\/\s*unknown)?|unknown(?: source)?|)$/.test(value)) return 'unknown';
    const social=socialSource(value);
    if(social)return social[1];
    if (/figma/.test(value)) return 'figma';
    if (['x','twitter','x.com','t.co','twitter.com'].includes(value)) return 'x';
    if (['email','mail','mailto'].includes(value)) return 'mail';
    if (/^(?:resume|résumé|cv)$|\.pdf(?:$|\?)/.test(value)) return 'document';
    if (['local','localhost','127.0.0.1'].includes(value)) return 'local';
    return 'website';
}
function channelIcon(label) {
    const kind = channelKind(label);
    const mark = BRAND_MARKS[kind];
    return '<span class="channel-icon channel-' + kind + '" aria-hidden="true">' + (mark ? '<svg class="brand-icon" viewBox="0 0 24 24">' + mark + '</svg>' : icon(({unknown:'link-unknown',mail:'mail',document:'document',local:'desktop',website:'globe'})[kind])) + '</span>';
}

const canonicalClip = id => id === 'landing-video' ? 'landing' : id;
const projectCategory = id => id === 'landing' ? 'Introduction' : id.startsWith('t1') ? 'Zeta' : id.startsWith('t2') ? 'Personal projects' : id.startsWith('t3') ? 'Life' : id.startsWith('t4') ? 'Films' : 'Portfolio';
const guestName = group => group.latest.guest_number ? 'Visitor ' + group.latest.guest_number : 'Visitor';
const returningGuest = group => group.visits.some(s => Number(s.visit_number) > 1 && !s.is_tab);

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
const trafficLabel = label => /^(source not shared|direct(?:\s*\/\s*unknown)?|unknown(?: source)?|)$/i.test(String(label || '').trim()) ? 'Direct / unknown' : (socialSource(label)?.[0] || String(label));
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const shortDate = date => date.toLocaleDateString(undefined, {month:'short', day:'numeric'});
function sourceLabel(referrer, path) {
    const hostOf = value => { try { return new URL(value).hostname.replace(/^www\./,''); } catch (_) { return ''; } };
    let campaign = '';
    try { const params = new URL(path || location.href, location.href).searchParams; campaign = (params.get('utm_source') || params.get('src') || params.get('from') || '').toLowerCase(); } catch (_) {}
    if (campaign.includes('linkedin')) return 'LinkedIn';
    if (campaign.includes('twitter') || campaign === 'x') return 'X';
    if (campaign) return socialSource(campaign)?.[0] || campaign;
    const host = hostOf(referrer);
    const social=socialSource(host);
    if (social) return social[0];
    if (['localhost','127.0.0.1'].includes(host)) return 'Local';
    if (host) return host;
    return ['localhost','127.0.0.1'].includes(hostOf(path)) ? 'Local' : 'Direct / unknown';
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
    return `<span class="delta ${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${n > 0 ? icon('arrow-up') : n < 0 ? icon('arrow-down') : ''} ${Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:1})}%<span class="delta-comparison"> vs prior period</span></span>`;
}
function syncTrafficScope() {
    $('excludeLocal').setAttribute('aria-checked',String(excludeLocal));

}
function setPeriod() {
    syncTrafficScope();
    const labels = {today:'Today', '7d':'Last 7 days', '30d':'Last 30 days', all:'All recorded time'};
    const end = new Date(), start = new Date(end);
    if (range === 'today') start.setHours(0,0,0,0);
    else start.setDate(start.getDate() - (range === '30d' ? 30 : 7));
    $('periodContext').textContent = range === 'all' ? labels[range] : `${shortDate(start)} – ${shortDate(end)} · vs prior period`;
    for (const button of $('ranges').children) button.setAttribute('aria-pressed', String(button.dataset.range === range));
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
        ['Visitors', metricNumber(o.visitors), d.visitors, `${number(o.visits)} recorded visits`, 'visits'],
        ['Watch time', esc(watchLabel(o.watchSeconds)), d.watch, 'Across reported projects', 'projects'],
        ['Average visit', esc(watchLabel(present(o.avgSessionMs) ? o.avgSessionMs / 1000 : null)), d.avgSession, 'First to last recorded event', 'visits'],
        ['Link clicks', metricNumber(o.outboundTotal), d.outbound, 'Resume, socials & project links', 'traffic']
    ];
    $('kpis').innerHTML = metrics.map(([label,value,change,caption,view]) => `<button class="metric" data-go="${view}"><p class="metric-label">${label}</p><span class="metric-action">${icon('arrow-up-right')}</span><strong class="metric-value numeric">${value}</strong>${delta(change)}<p class="metric-caption">${caption}</p></button>`).join('');
    $('overviewSubtitle').textContent = o.visitors > 0 ? `${number(o.visitors)} recognized browsers visited your portfolio in this period.` : 'No visitors recorded in this period yet.';
    renderChart();
    const outbound = new Map((o.outbound || []).map(r=>[String(r.label).toLowerCase(),r]));
    const outboundRows = ['resume','linkedin','email','x'].map(key => {
        const item = outbound.get(key); outbound.delete(key);
        return {label:({resume:'Resume',linkedin:'LinkedIn',email:'Email',x:'X'})[key], n:item?.n ?? null};
    }).concat([...outbound.values()]).filter(r=>present(r.n));
    $('outbound').innerHTML = outboundRows.length ? `<div class="outbound-grid">${outboundRows.map(r=>`<div class="outbound-item"><span class="channel-name">${channelIcon(r.label)}<span>${esc(r.label)}</span></span><span class="outbound-count"><b class="numeric">${metricNumber(r.n)}</b><span>${Number(r.n)===1?'click':'clicks'}</span></span></div>`).join('')}</div>` : '<p class="empty">No link clicks reported.</p>';
    const sources = groupedSources(o.sources || []), sourceTotal = sources.reduce((sum,r)=>sum+(Number(r.n)||0),0);
    $('sources').innerHTML = sources.length ? sources.map(r=>`<button class="bar-row" data-source="${esc(trafficLabel(r.label))}" aria-label="View visitors from ${esc(trafficLabel(r.label))}"><span class="source-row-icon">${channelIcon(trafficLabel(r.label))}</span><span class="source-row-body"><span class="bar-label"><span>${esc(trafficLabel(r.label))}</span><span class="source-numbers"><strong class="numeric">${number(r.n)}</strong> ${Number(r.n)===1?'visit':'visits'}<span class="source-percentage">${sourceTotal ? Math.round(r.n/sourceTotal*100) : 0}%</span></span></span><span class="bar-track"><span class="bar-fill" style="--share:${sourceTotal ? Math.max(0,Math.min(100,r.n/sourceTotal*100)) : 0}%"></span></span></span><span class="source-drill">${icon('chevron-right')}</span></button>`).join('') : '<p class="empty">Arrival sources will appear after your first visits.</p>';
    const best = projectsData().filter(p=>p.id!=='landing' && p.seconds>0).sort((a,b)=>b.seconds-a.seconds)[0];
    const topSource = sources.filter(r => trafficLabel(r.label) !== 'Direct / unknown').sort((a,b)=>b.n-a.n)[0];
    $('insights').innerHTML = `<div class="quick-insight"><span>Most watched project</span><strong>${best ? esc(clipName(best.id)) : 'Your next standout starts here'}</strong><span>${best ? esc(watchLabel(best.seconds)) + ' of recorded attention' : 'Project insights appear as people watch.'}</span>${best ? `<button class="text-button" data-project="${esc(best.id)}">Explore its visitors ${icon('arrow-right')}</button>` : ''}</div><div class="quick-insight"><span>Leading known source</span><strong>${topSource ? esc(trafficLabel(topSource.label)) : 'No known sources yet'}</strong><button class="text-button" data-go="traffic">Explore traffic ${icon('arrow-right')}</button></div><div class="quick-insight"><span>Average page load</span><strong class="numeric">${milliseconds(o.load?.load)}</strong><span>Browser load event, not video readiness</span></div>`;
    const top = projectsData().filter(p=>p.id!=='landing' && p.seconds>0).sort((a,b)=>b.seconds-a.seconds).slice(0,3);
    $('topProjects').innerHTML = top.length ? top.map((p,i)=>`<button class="preview-row" data-project="${esc(p.id)}"><span class="rank">0${i+1}</span><span class="preview-main"><span class="preview-name">${esc(clipName(p.id))}</span><span class="bar-track"><span class="bar-fill" style="--share:${p.seconds/top[0].seconds*100}%"></span></span></span><span class="preview-value numeric">${esc(watchLabel(p.seconds))}</span></button>`).join('') : '<p class="empty">Your most-watched projects will appear here.</p>';
    $('recentVisitors').innerHTML = guestGroups().slice(0,3).map(group=>`<button class="preview-row" data-session="${esc(group.key)}" aria-haspopup="dialog">${browserBadge(group.latest.browser,group.latest.os)}<span class="preview-main"><span class="preview-name">${esc(guestName(group))}</span><span class="preview-meta">${esc(sourceLabel(group.latest.referrer,group.latest.landing_path))} · ${esc(stamp(group.latest.started_at))}</span></span><span class="preview-value">${icon('chevron-right')}</span></button>`).join('') || '<p class="empty">Visitor journeys will appear after the first visit.</p>';

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
    $('chart').innerHTML = `<div class="chart-readout" id="chartReadout" aria-live="polite"></div><svg class="chart-plot" id="chartPlot" viewBox="0 0 500 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b2c795" stop-opacity=".18"/><stop offset="1" stop-color="#b2c795" stop-opacity="0"/></linearGradient></defs><path d="M0 20H500M0 82H500M0 145H500" stroke="#304735" stroke-width="1" stroke-dasharray="3 5" fill="none"/><path d="${path}L${points.at(-1).x},160L${points[0].x},160Z" fill="url(#chartFill)"/><path d="${path}" fill="none" stroke="#b2c795" stroke-width="2.5" vector-effect="non-scaling-stroke"/><line id="chartGuide" y1="15" y2="145" stroke="#bacda1" stroke-width="1" stroke-dasharray="3 4" opacity=".35"/><circle id="chartDot" r="4" fill="#e3e7cc" stroke="#13261b" stroke-width="2"/></svg><div class="chart-axis"><span>${esc(chartDays[0].label)}</span><span>${max} max / day</span><span>${esc(chartDays.at(-1).label)}</span></div><label class="sr-only chart-helper" for="chartSlider">${chartDays.length>1?'Tap or hover to explore · Arrow keys when focused':'Today\u2019s recorded visitors'}</label><input class="chart-slider" id="chartSlider" type="range" min="0" max="${chartDays.length-1}" value="${chartDays.length-1}" step="1" ${chartDays.length===1?'disabled':''}>`;
    function selectDay(index) {
        const i = Math.max(0,Math.min(points.length-1,index)), p = points[i], d = chartDays[i];
        $('chartReadout').innerHTML = `<strong class="numeric">${number(d.n)}</strong><span>${d.n===1?'visitor':'visitors'} on ${esc(d.label)}</span>`;
        $('chartGuide').setAttribute('x1',p.x); $('chartGuide').setAttribute('x2',p.x);
        $('chartDot').setAttribute('cx',p.x); $('chartDot').setAttribute('cy',p.y);
        $('chartSlider').value = i; $('chartSlider').setAttribute('aria-valuetext',`${d.label}: ${d.n} visitors`);
    }
    $('chartSlider').oninput = e=>selectDay(Number(e.target.value));
    $('chartPlot').onpointermove = $('chartPlot').onpointerdown = e=>{const rect=e.currentTarget.getBoundingClientRect();selectDay(Math.round((e.clientX-rect.left)/rect.width*(points.length-1)));};
    selectDay(chartDays.length-1);
}
function renderProjects() {
    window.AnalyticsSelect?.sync();
    const key = $('projectSort').value, rows = projectsData().sort((a,b)=>(b[key]??-1)-(a[key]??-1));
    const secondsTotal = rows.reduce((sum,p)=>sum+(p.seconds||0),0);
    const headings = document.querySelectorAll('.project-table thead th');
    headings.forEach((th,i)=> { if (i === {views:1,seconds:2,average:3}[key]) th.setAttribute('aria-sort','descending'); else th.removeAttribute('aria-sort'); });
    $('projects').innerHTML = rows.length ? rows.map((p,i)=>`<tr data-project="${esc(p.id)}"><th scope="row"><button class="project-name" data-project="${esc(p.id)}"><span class="rank">${String(i+1).padStart(2,'0')}</span>${projectMark(p.id)}<span><strong>${esc(clipName(p.id))}</strong><small>${esc(projectCategory(p.id))}</small></span></button></th><td data-label="Views">${metricNumber(p.views)}</td><td data-label="Watch time">${esc(watchLabel(p.seconds))}</td><td data-label="Watch / view">${esc(watchLabel(p.average))}</td><td class="share-cell" data-label="Watch share">${present(p.seconds) && secondsTotal ? Math.round(p.seconds/secondsTotal*100)+'%' : '—'}<div class="bar-track"><div class="bar-fill" style="--share:${secondsTotal?(p.seconds||0)/secondsTotal*100:0}%"></div></div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty"><strong>No project activity yet</strong>Try another date range, or check back after your work has been watched.</div></td></tr>';
}
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
function guestIsActive(group, now = Date.now()) {
    return group.visits.some(session => {
        const last = Math.max(Number(session.started_at)||0, Number(session.ended_at)||0);
        return last > 0 && now >= last && now - last < ACTIVE_WINDOW_MS;
    });
}
function activeGuestBadge(group) {
    return '<span class="active-guest" data-active-guest="'+esc(group.key)+'" '+(guestIsActive(group)?'':'hidden')+' title="Activity recorded in the last 2 minutes; not confirmed live" aria-label="Active: activity recorded in the last 2 minutes, not confirmed live"><span aria-hidden="true"></span>Active</span>';
}
function syncActiveGuests() {
    const groups = new Map(guestGroups().map(group=>[group.key,group]));
    const now = Date.now();
    for (const badge of document.querySelectorAll('[data-active-guest]')) {
        const group = groups.get(badge.dataset.activeGuest);
        badge.hidden = !group || !guestIsActive(group,now);
    }
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
function matchingVisits(group) {
    return group.visits.filter(s => (!$('deviceFilter').value || s.device === $('deviceFilter').value)
        && (!projectFilter || (s.path || []).some(id => canonicalClip(id) === projectFilter))
        && (!sourceFilter || sourceLabel(s.referrer,s.landing_path) === sourceFilter));
}
function filteredGuests() {
    const type = $('visitType').value, query = $('visitorSearch').value.trim().toLowerCase();
    return guestGroups().filter(group => {
        // Device, project and source must describe the same visit, not unrelated
        // visits from one browser. The drawer still preserves the full history.
        const matching = matchingVisits(group);
        if (!matching.length || (type==='returning' && !returningGuest(group)) || (type==='active' && !guestIsActive(group))) return false;
        const text = [guestName(group), ...matching.flatMap(s=>[s.device,s.os,s.browser,sourceLabel(s.referrer,s.landing_path),...(s.path||[]).map(clipName)])].join(' ').toLowerCase();
        return !query || text.includes(query);
    });
}

const PROJECT_SHORT = {landing:'Introduction',t1v1:'PayZapp · Acquisition',t1v2:'PayZapp · Growth',t1v3:'Unicorn',t1v4:'Neo',t2v1:'HueRex',t3v1:'Veronica',t4v1:'Sakleshpur',t4v2:'Delhi',t4v3:'Ladakh'};
const PROJECT_TONES = {landing:'sage',t1v1:'blue',t1v2:'purple',t1v3:'amber',t1v4:'blue',t2v1:'purple',t3v1:'rose',t4v1:'sage',t4v2:'amber',t4v3:'blue'};
function projectMark(id) {
    const key = canonicalClip(id);
    return '<span class="project-mark tone-' + (PROJECT_TONES[key] || 'sage') + '" aria-hidden="true">' + icon(key.startsWith('t4') ? 'play' : 'projects') + '</span>';
}
function projectChips(ids) {
    const unique = [...new Set(ids.map(canonicalClip))];
    if (!unique.length) return '<span class="no-projects">No projects opened</span>';
    return unique.slice(0,2).map(id => '<span class="project-chip chip-' + (PROJECT_TONES[id] || 'sage') + '" title="' + esc(clipName(id)) + '">' + projectMark(id) + '<span>' + esc(PROJECT_SHORT[id] || clipName(id)) + '</span></span>').join('') +
        (unique.length > 2 ? '<span class="project-more">+' + (unique.length-2) + ' more</span>' : '');
}

function visitorLikes(visits) {
    const latest=new Map();
    for(const reaction of visits.flatMap(visit=>visit.reactions||[]).sort((a,b)=>a.ts-b.ts || Number(a.eventId)-Number(b.eventId))) {
        latest.set(canonicalClip(reaction.videoId),reaction.liked);
    }
    const liked=[...latest].filter(([,value])=>value).map(([id])=>id);
    if(!liked.length)return '';
    return `<span class="visitor-likes" title="${esc('Latest recorded reactions in matching visits: '+liked.map(clipName).join(', '))}">${icon('heart')} ${number(liked.length)} ${liked.length===1?'like':'likes'}</span>`;
}

function renderVisits() {
    window.AnalyticsSelect?.sync();
    $('clearSearch').hidden = !$('visitorSearch').value;
    const all = guestGroups(), guests = filteredGuests(), visible = guests.slice(0,guestVisible);
    $('visitorSummary').innerHTML = [[all.length,'Visitors','visitors'],[all.filter(returningGuest).length,'Returning visitors','refresh'],[sessions.length,'Recorded visits','enter']].map(([n,label,symbol])=>`<div><span class="summary-label">${icon(symbol)}${label}</span><strong class="numeric">${number(n)}</strong></div>`).join('');
    $('visitorColumnLabel').textContent = projectFilter || sourceFilter || $('deviceFilter').value ? 'Visitor / latest matching visit' : 'Visitor / last visit';
    $('visitCount').textContent = `${number(guests.length)} ${guests.length===1?'visitor':'visitors'}${guests.length!==all.length?' matched':''}`;
    $('filterChips').innerHTML = [[projectFilter,'project',clipName(projectFilter)],[sourceFilter,'source',sourceFilter]].filter(([value])=>value).map(([,key,label])=>`<button class="filter-chip" data-clear="${key}" aria-label="Remove ${key} filter: ${esc(label)}">${esc(label)} ${icon('close')}</button>`).join('');
    $('clearFilters').hidden = !projectFilter && !sourceFilter && !$('deviceFilter').value && !$('visitType').value && !$('visitorSearch').value;
    $('visits').innerHTML = visible.length ? visible.map(group=>{
        const s=matchingVisits(group)[0] || group.latest, count=group.visits.length;
        const path=matchingVisits(group).flatMap(visit=>visit.path||[]);
        const route=projectChips(path);
        return `<button class="visit-card" data-session="${esc(group.key)}" aria-haspopup="dialog"><span class="visit-heading">${browserBadge(s.browser,s.os)}<span class="visitor-identity"><strong>${esc(guestName(group))}</strong><span class="visit-meta">${esc(stamp(s.started_at))}</span>${activeGuestBadge(group)}</span></span><span class="visit-path">${route}${visitorLikes(matchingVisits(group))}</span><span class="visit-source"><span class="source-name">${channelIcon(sourceLabel(s.referrer,s.landing_path))}${esc(sourceLabel(s.referrer,s.landing_path))}</span><span class="visit-meta">${platformIcon(s.os)||icon(s.device==='phone'||s.device==='tablet'?'phone':'desktop')}${esc([s.os||s.device,s.browser].filter(Boolean).join(' / ')||'Device not reported')}</span></span><span class="visit-count numeric"><span class="visit-count-value">${number(count)}<span class="mobile-count-label"> ${count===1?'visit':'visits'}</span></span><span class="arrow">${icon('chevron-right')}</span></span></button>`;
    }).join('') : `<div class="empty"><strong>${all.length?'No visitors match these filters':'No visits recorded yet'}</strong>${all.length?'Try another search or clear the filters.':'Try a wider date range, or check back after your next visit.'}${all.length?'<br><button class="soft-button" data-clear="all">Clear filters</button>':''}</div>`;
    $('loadMore').hidden = guestVisible>=guests.length;

    $('visitScope').textContent = `Showing ${number(visible.length)} of ${number(guests.length)} visitors · newest first`;
}
function renderAll() { renderOverview(); renderProjects(); renderVisits(); }
function listParams(offset=0) { return new URLSearchParams({range,excludeLocal:excludeLocal?'1':'0',limit:String(PAGE),offset:String(offset),tz:String(new Date().getTimezoneOffset())}); }
// Group the complete filtered session set, not just the first API page.
function localScopeUnavailable() { return Object.assign(new Error('Local-traffic filtering needs the updated analytics server. Showing all traffic until it is deployed.'), {scopeUnavailable:true}); }
async function fetchGuestSessions(signal) {
    const params = listParams(0);
    params.set('limit','80');
    const rows = [];
    let total = Infinity;
    while (rows.length < total) {
        params.set('offset',String(rows.length));
        const page = await api('/analytics/sessions?'+params,signal);
        if(excludeLocal && page.localExcluded !== true) throw localScopeUnavailable();
        const batch = page.sessions || [];
        total = Number(page.total) || 0;
        if (!batch.length) break;
        rows.push(...batch);
    }
    return {sessions:[...new Map(rows.map(row=>[row.id,row])).values()],total};
}
async function loadBoard() {
    boardController?.abort();
    const controller = boardController = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),20000);
    window.AnalyticsSelect?.close();
    document.querySelectorAll('.view').forEach(view=>{view.inert=true;});
    $('errorBanner').hidden=true; $('refreshBtn').disabled=true;$('excludeLocal').disabled=true; $('deviceFilter').disabled=true;window.AnalyticsSelect?.sync();
    $('dashboardContent').setAttribute('aria-busy','true'); $('freshness').textContent='Updating dashboard...'; $('initialLoading').hidden=!!overview; setPeriod();
    try {
        const [o,list] = await Promise.all([api(`/analytics/overview?range=${range}&tz=${new Date().getTimezoneOffset()}&excludeLocal=${excludeLocal?'1':'0'}`,controller.signal),fetchGuestSessions(controller.signal)]);
        if (controller!==boardController) return false;
        if(excludeLocal && o.localExcluded !== true) throw localScopeUnavailable();
        overview=o; sessions=list.sessions||[]; totalVisits=Number(list.total)||0;
        if(loadedRange!==range || loadedExcludeLocal!==excludeLocal)guestVisible=PAGE;loadedRange=range;loadedExcludeLocal=excludeLocal;syncTrafficScope();
        renderAll(); lastUpdated=Date.now(); $('freshness').textContent=`Updated ${new Date(lastUpdated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}`;
        return true;
    } catch(e) {
        if(controller!==boardController) return false;
        // Older deployed workers ignore new query parameters. Recover shared
        // filtered links honestly instead of blocking the initial unlock.
        if (e.scopeUnavailable && !overview) {
            excludeLocal=false;writeRoute('replace');setPeriod();
            const restored=await loadBoard();
            if(restored){$('errorMessage').textContent=e.message;$('errorBanner').hidden=false;}
            return restored;
        }
        if (overview) {
            range=loadedRange;excludeLocal=loadedExcludeLocal;writeRoute('replace');
            for (const b of $('ranges').children) b.setAttribute('aria-pressed',String(b.dataset.range===range));
            setPeriod();
        }
        if(e.name==='AbortError') throw new Error('The request timed out. Please try again.');
        throw e;
    } finally {
        clearTimeout(timeout);
        if(controller===boardController){document.querySelectorAll('.view').forEach(view=>{view.inert=false;});$('refreshBtn').disabled=false;$('excludeLocal').disabled=false;$('deviceFilter').disabled=false;window.AnalyticsSelect?.sync();$('dashboardContent').setAttribute('aria-busy','false');$('initialLoading').hidden=true;}
    }
}
function updateVisitorFilters() {
    guestVisible=PAGE; renderVisits(); writeRoute('replace');
}
function clearVisitorFilters() {
    projectFilter='';sourceFilter='';$('deviceFilter').value='';$('visitType').value='';$('visitorSearch').value='';
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
function activityIcon(action) {
    return icon(({session_start:'enter',video_view:'play',video_heartbeat:'clock',like_toggle:'heart',outbound_click:'arrow-up-right',tab_visit:'projects',grid_open:'overview'})[action] || 'clock');
}

// Merge only consecutive playback records for the same project. Other actions,
// another project, or a long gap remain separate steps in the visitor's journey.
function groupActivity(events) {
    const groups = [];
    for (const event of [...events].sort((a,b)=>a.ts-b.ts)) {
        const project = ['video_view','video_heartbeat'].includes(event.action) && event.payload?.videoId;
        if (!project) { groups.push({kind:'event',event,ts:event.ts,lastTs:event.ts}); continue; }
        const id = canonicalClip(event.payload.videoId), previous = groups.at(-1);
        const seconds = event.action === 'video_heartbeat' ? Math.max(0,Number(event.payload.seconds)||0) : 0;
        if (previous?.kind === 'project' && previous.id === id && event.ts-previous.lastTs <= 90000) {
            previous.lastTs=event.ts;previous.seconds+=seconds;previous.opens+=event.action==='video_view'?1:0;previous.records++;
        } else groups.push({kind:'project',id,ts:event.ts,lastTs:event.ts,seconds,opens:event.action==='video_view'?1:0,records:1});
    }
    return groups;
}
function activityTime(group) {
    if(Math.floor(group.lastTs/60000)===Math.floor(group.ts/60000))return stamp(group.ts);
    const end = dateKey(new Date(group.ts)) === dateKey(new Date(group.lastTs))
        ? new Date(group.lastTs).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : stamp(group.lastTs);
    return stamp(group.ts) + ' – ' + end;
}
function journeyLabel(event) {
    const p=event.payload||{}, project=esc(clipName(p.videoId));
    if(event.action==='video_view')return `<span class="event-verb">Opened</span> <strong>${project}</strong>`;
    if(event.action==='video_heartbeat')return `<span class="event-verb">Watched · ${esc(watchLabel(p.seconds))}</span> <strong>${project}</strong>`;
    if(event.action==='like_toggle')return `<span class="event-verb">${p.liked?'Liked':'Unliked'}</span> <strong>${project}</strong>`;
    return esc(eventText(event));
}
function renderActivity(events) {
    const ordered=[...events].sort((a,b)=>a.ts-b.ts), start=ordered[0]?.ts;
    return ordered.map(event => {
        const elapsed=Math.max(0,Math.floor((event.ts-start)/1000));
        const reaction=event.action==='like_toggle' ? (event.payload?.liked ? ' is-liked' : ' is-unliked') : '';
        const project=['video_view','video_heartbeat'].includes(event.action) && event.payload?.videoId;
        return `<li class="journey-event${reaction}"><span class="timeline-icon">${project ? projectMark(canonicalClip(event.payload.videoId)) : activityIcon(event.action)}</span><div class="journey-step"><p>${journeyLabel(event)}</p><time title="${esc(stamp(event.ts))}" aria-label="${elapsed} seconds after first recorded activity">${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}</time></div></li>`;
    }).join('') || '<li><p>No events recorded.</p></li>';
}
function renderDeviceDetails(s, snapshot) {
    const timings=[['Server response',s.ttfb_ms??snapshot.ttfbMs],['First content',s.fcp_ms??snapshot.fcpMs],['Page loaded',s.load_ms??snapshot.loadMs]];
    const valid=v=>v!=null && v!=='' && Number.isFinite(Number(v)) && Number(v)>=0;
    const maximum=Math.max(1,...timings.filter(([,v])=>valid(v)).map(([,v])=>Number(v)));
    const cards=[['traffic','Network',s.connection||snapshot.connection],['desktop','Browser size',s.viewport||snapshot.viewport],['globe','Timezone',s.timezone||snapshot.timezone],['globe','Language',s.language||snapshot.language]];
    return `<section class="device-insights" aria-label="Visit environment"><dl class="device-grid">${cards.map(([symbol,label,value])=>`<div>${icon(symbol)}<dt>${label}</dt><dd>${esc(value||'Not reported')}</dd></div>`).join('')}</dl><details class="visit-diagnostics"><summary><span>${icon('clock')} Page loading & visit details</span><span class="loading-peek">${valid(s.load_ms??snapshot.loadMs)?esc(milliseconds(Number(s.load_ms??snapshot.loadMs)))+' load':'View details'}</span></summary><div class="loading-profile"><h4>${icon('clock')} Page loading</h4><dl>${timings.map(([label,value])=>`<div><dt>${label}</dt><dd>${valid(value)?esc(milliseconds(Number(value))):'Not reported'}</dd><span class="loading-track" aria-hidden="true">${valid(value)?`<span style="width:${Number(value)/maximum*100}%"></span>`:''}</span></div>`).join('')}</dl></div><div class="technical-context"><dl><div><dt>Visit number</dt><dd>${esc(s.visit_number||'Not reported')}</dd></div></dl></div></details></section>`;
}

function renderDetail(detail) {
    const s={...sessions.find(s=>s.id===selectedSessionId),...detail.session};
    const events=[...(detail.events||[])].sort((a,b)=>a.ts-b.ts);
    const snapshot=events.find(e=>e.action==='session_start')?.payload?.session||{};
    const seconds=events.filter(e=>e.action==='video_heartbeat').reduce((sum,e)=>sum+(Number(e.payload?.seconds)||0),0);
    const clicks=events.filter(e=>e.action==='outbound_click').length;
    const facts=[['Time on site',sessionDuration(s)],['Recorded watch',watchLabel(seconds)],['Projects opened',number(new Set(events.filter(e=>e.action==='video_view').map(e=>e.payload?.videoId === 'landing-video' ? 'landing' : e.payload?.videoId).filter(Boolean)).size)],['Link clicks',number(clicks)]];
    const markup=rows=>`<dl class="facts">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd class="numeric">${esc(value)}</dd></div>`).join('')}</dl>`;
    const arrival = sourceLabel(s.referrer,s.landing_path);
    $('sessionDetail').innerHTML=`<section class="visit-summary" aria-label="Visit summary"><div class="dialog-hero"><div class="visit-browser-summary">${browserBadge(s.browser,s.os)}<span class="visit-platform"><strong>${esc(s.os||'Device not reported')}</strong><small>${esc(browserInfo(s.browser).name)}</small></span>${visitStatus(s)}</div><p class="arrival-time">${icon('clock')}${esc(stamp(s.started_at))}</p><p class="arrival-source">${channelIcon(arrival)}<span>${esc(arrival)}</span></p></div>${markup(facts).replace('class="facts"','class="facts visit-metrics"')}${renderDeviceDetails(s,snapshot)}</section><div class="activity-heading"><div><h3>Visit journey</h3></div><span>${number(events.length)} events</span></div>${detail.eventsTruncated?'<p class="scope-note">Showing the first 400 events. These visit totals may be incomplete.</p>':''}<ol class="timeline journey-timeline">${renderActivity(events)}</ol>`;

}
async function fetchDetail(id) {
    detailController?.abort();
    selectedSessionId=id;
    const controller=detailController=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
    $('sessionDetail').innerHTML='<p class="empty" role="status">Loading this visit...</p>';
    try {
        const detail=await api('/analytics/sessions/'+encodeURIComponent(id)+'?excludeLocal='+(excludeLocal?'1':'0'),controller.signal);
        if(selectedSessionId===id&&controller===detailController)renderDetail(detail);
    } catch(e) {
        if(controller!==detailController)return;
        if(e.auth){reportError(e);return;}
        $('sessionDetail').innerHTML='<div class="empty"><strong>Could not load this visit</strong><button class="soft-button" id="retryDetail">Retry</button></div>';
        $('retryDetail').onclick=()=>fetchDetail(id);
    } finally {clearTimeout(timeout);}
}
function openGuest(id, mode='push') {
    const group=guestGroups().find(guest=>guest.key===id);
    if(!group)return;
    if (!$('visitDialog').open) { returnFocus=document.activeElement; drawerKeys=(currentView==='visits'?filteredGuests():guestGroups()).map(g=>g.key); }
    selectedId=id;
    $('visitHeading').textContent=guestName(group);
    const index=drawerKeys.indexOf(id);
    $('previousGuest').disabled=index<=0; $('nextGuest').disabled=index<0||index>=drawerKeys.length-1;
    const count=group.visits.length, initial=(currentView==='visits' ? matchingVisits(group)[0] : null) || group.latest;
    $('visitDetail').innerHTML=`<section class="guest-history" aria-label="Visitor history" ${count>1?'':'hidden'}>${count>1 && currentView==='visits' && (projectFilter||sourceFilter||$('deviceFilter').value) ? '' : ''}${activeGuestBadge(group)}${count>1?`<label class="session-label" for="guestSession">Visit history</label><select id="guestSession">${group.visits.map((s,i)=>`<option value="${esc(s.id)}" ${s.id===initial.id?'selected':''}>${esc(stamp(s.started_at))} · ${esc(sessionDuration(s))}${i===0?' · Latest':''}</option>`).join('')}</select>`:''}</section><div id="sessionDetail" aria-live="polite"></div>`;
    if (!$('visitDialog').open) $('visitDialog').showModal();
    window.AnalyticsSelect?.enhance($('visitDetail'));
    document.body.classList.add('detail-open'); $('visitDialog').scrollTop=0;
    if(mode!=='restore') history[mode==='replace'?'replaceState':'pushState']({rfVisit:id},'',location.href);
    if(mode==='push') $('closeVisit').focus({preventScroll:true});
    fetchDetail(initial.id);
}
function dismissDetail() {
    window.AnalyticsSelect?.close();
    detailController?.abort(); detailController=null; selectedId=''; selectedSessionId='';
    if ($('visitDialog').open) { $('visitDialog').close(); document.body.classList.remove('detail-open'); if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true}); }
}
function closeGuest() {if(history.state?.rfVisit)history.back();else dismissDetail();}
function routeSnapshot() { return JSON.stringify([currentView,range,excludeLocal,projectFilter,sourceFilter,$('deviceFilter').value,$('visitType').value,$('visitorSearch').value,$('projectSort').value]); }
function syncNavLinks() { document.querySelectorAll('[data-view]').forEach(link=>{const url=new URL(location.href);url.hash=link.dataset.view;link.href=url.href;}); }
function writeRoute(mode='push') {
    const url=new URL(location.href);url.hash=currentView;
    for(const [key,value] of Object.entries({range,excludeLocal:excludeLocal?'1':'0',device:$('deviceFilter').value,type:$('visitType').value,q:$('visitorSearch').value,project:projectFilter,source:sourceFilter,sort:$('projectSort').value})) {
        if(value && !(key==='range'&&value==='7d') && !(key==='sort'&&value==='seconds'))url.searchParams.set(key,value);else url.searchParams.delete(key);
    }
    if(url.href!==location.href)history[mode==='replace'?'replaceState':'pushState']({},'',url);
    // Native open-in-new-tab retains the date range and current filters too.
    syncNavLinks();
}
function readRoute() {
    const url=new URL(location.href), p=url.searchParams;
    excludeLocal=p.get('excludeLocal')!=='0';
    range=['today','7d','30d','all'].includes(p.get('range'))?p.get('range'):'7d';
    $('deviceFilter').value=['phone','desktop','tablet'].includes(p.get('device'))?p.get('device'):'';
    $('visitType').value=['returning','active'].includes(p.get('type'))?p.get('type'):'';
    $('visitorSearch').value=p.get('q')||'';projectFilter=p.get('project')||'';sourceFilter=p.get('source')?trafficLabel(p.get('source')):'';
    $('projectSort').value=['seconds','views','average'].includes(p.get('sort'))?p.get('sort'):'seconds';
    window.AnalyticsSelect?.sync();
    setPeriod();setView(Object.hasOwn(viewMeta,url.hash.slice(1))?url.hash.slice(1):'overview',false,false);syncNavLinks();
}
function setView(next,focus=false,push=true) {
    if(!Object.hasOwn(viewMeta,next))return;
    window.AnalyticsSelect?.close();
    const changed=currentView!==next;currentView=next;
    for(const link of $('viewNav').querySelectorAll('[data-view]')) {const on=link.dataset.view===next;if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');$('view-'+link.dataset.view).hidden=!on;}
    $('pageTitle').textContent=$('breadcrumb').textContent=viewMeta[next][0];
    $('pageDescription').textContent=viewMeta[next][1];document.title=viewMeta[next][0]+' · ReelsFolio Analytics';
    if(push)writeRoute();
    if(changed)window.scrollTo({top:0,behavior:'instant'});
    if(focus)$('dashboardContent').focus({preventScroll:true});
}
async function unlock(secret) {
    token=secret.trim(); if(!token)throw new Error('Enter your dashboard password.');
    if(!await loadBoard())return;
    try {localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);($('remember').checked?localStorage:sessionStorage).setItem(TOKEN_KEY,token);} catch(_) {}
    $('gate').hidden=true; $('app').hidden=false; $('tokenInput').value='';
}
function lockRoom() {
    boardController?.abort();boardController=null;dismissDetail();
    if(history.state?.rfVisit)history.replaceState({},'',location.href);
    try {localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);} catch(_) {}
    token='';overview=null;sessions=[];totalVisits=0;lastUpdated=0;
    $('gate').hidden=false;$('app').hidden=true;$('tokenInput').value='';$('gateError').textContent='';$('tokenInput').focus();
}
window.AnalyticsSelect?.enhance();
$('clearSearch').onclick=e=>{e.preventDefault();$('visitorSearch').value='';updateVisitorFilters();$('visitorSearch').focus();};
$('gateForm').onsubmit=async e=>{e.preventDefault();$('unlockBtn').disabled=true;$('unlockBtn').textContent='Opening...';$('gateError').textContent='';try{await unlock($('tokenInput').value);}catch(error){$('gateError').textContent=error.message;}finally{$('unlockBtn').disabled=false;$('unlockBtn').innerHTML='Open dashboard '+icon('arrow-right');}};
$('excludeLocal').onclick=()=>{excludeLocal=!excludeLocal;syncTrafficScope();writeRoute();loadBoard().catch(reportError);};
$('refreshBtn').onclick=$('retryBtn').onclick=()=>loadBoard().catch(reportError);
$('lockBtn').onclick=$('lockMobile').onclick=lockRoom;
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('dashboardContent').focus();};
$('ranges').onclick=e=>{const b=e.target.closest('[data-range]');if(!b||b.dataset.range===range)return;range=b.dataset.range;setPeriod();writeRoute();loadBoard().catch(reportError);};
$('viewNav').onclick=e=>{const link=e.target.closest('[data-view]');if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();setView(link.dataset.view);};
document.addEventListener('click',e=>{
    const go=e.target.closest('[data-go]'),project=e.target.closest('[data-project]'),source=e.target.closest('[data-source]'),session=e.target.closest('[data-session]'),clear=e.target.closest('[data-clear]');
    if(go){if(go.tagName==='A'&&(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey))return;e.preventDefault();setView(go.dataset.go,true);}
    else if(project||source){clearVisitorFilters();projectFilter=project?.dataset.project||'';sourceFilter=source?.dataset.source||'';guestVisible=PAGE;renderVisits();setView('visits',true);}
    else if(session)openGuest(session.dataset.session);
    else if(clear){if(clear.dataset.clear==='all')clearVisitorFilters();else if(clear.dataset.clear==='project')projectFilter='';else sourceFilter='';updateVisitorFilters();$('visitorSearch').focus();}
});
$('projectSort').onchange=()=>{renderProjects();writeRoute('replace');};
$('deviceFilter').onchange=$('visitType').onchange=$('visitorSearch').oninput=updateVisitorFilters;
$('clearFilters').onclick=()=>{clearVisitorFilters();updateVisitorFilters();$('visitorSearch').focus();};
$('loadMore').onclick=()=>{const old=Math.min(guestVisible,filteredGuests().length);guestVisible+=PAGE;renderVisits();$('visits').children[old]?.focus({preventScroll:true});};
$('visitDetail').onchange=e=>{if(e.target.id==='guestSession')fetchDetail(e.target.value);};
$('previousGuest').onclick=()=>openGuest(drawerKeys[drawerKeys.indexOf(selectedId)-1],'replace');
$('nextGuest').onclick=()=>openGuest(drawerKeys[drawerKeys.indexOf(selectedId)+1],'replace');
$('closeVisit').onclick=closeGuest;$('visitDialog').oncancel=e=>{e.preventDefault();closeGuest();};
$('visitDialog').onclick=e=>{if(e.target!==$('visitDialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeGuest();};
window.addEventListener('popstate',async()=>{
    const oldRange=range, oldExcludeLocal=excludeLocal, oldRoute=routeSnapshot();dismissDetail();readRoute();
    if(!token||!overview)return;
    if(oldRange!==range || oldExcludeLocal!==excludeLocal){try{await loadBoard();}catch(e){reportError(e);}}
    else if(oldRoute!==routeSnapshot()){guestVisible=PAGE;renderAll();}
    if(history.state?.rfVisit)openGuest(history.state.rfVisit,'restore');
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lastUpdated&&Date.now()-lastUpdated>60000)$('freshness').textContent=`Last updated ${stamp(lastUpdated)}. Tap refresh.`;});
readRoute();
const url=new URL(location.href), urlSecret=url.searchParams.get('token')||url.searchParams.get('password');
if(urlSecret){url.searchParams.delete('token');url.searchParams.delete('password');history.replaceState({},'',url.pathname+url.search+url.hash);}
readRoute();
if(urlSecret||token){$('unlockBtn').disabled=true;$('unlockBtn').textContent='Opening...';unlock(urlSecret||token).catch(error=>{$('gateError').textContent=error.message;}).finally(()=>{$('unlockBtn').disabled=false;$('unlockBtn').innerHTML='Open dashboard '+icon('arrow-right');});}

// Expire badges locally; presence adds no network requests or tracking events.
setInterval(()=>{if(!document.hidden&&!$('app').hidden){syncActiveGuests();if(currentView==='visits'&&$('visitType').value==='active'&&!$('visitDialog').open&&overview)renderVisits();}},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncActiveGuests();});

// The date toolbar gets a backing only after it sticks, so it does not cut
// a rectangular hole through the foliage at the top of the page.
const filterObserver = new IntersectionObserver(([entry]) => {
    document.querySelector('.filter-bar').classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0);
});
filterObserver.observe($('filterAnchor'));
