/**
 * Cloudflare Worker for ReelsFolio likes + first-party analytics
 *
 * Likes and visit stories both live in D1. KV is only read once to copy old counts.
 *
 * One-time Cloudflare setup:
 * 1. Workers & Pages → D1 → Create database `reelfolio-analytics`
 * 2. Open the database → Console → paste schema.sql → Execute
 * 3. Open this worker → Settings → Bindings → Add D1
 *    Variable name: ANALYTICS
 *    Database: reelfolio-analytics
 * 4. Settings → Variables → Add secret
 *    Name: ANALYTICS_TOKEN
 *    Value: a long random string you keep private
 * 5. Deploy this file
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Analytics-Token',
};

const ALLOWED_ACTIONS = new Set([
    'session_start',
    'video_view',
    'video_heartbeat',
    'like_toggle',
    'tab_visit',
    'grid_open',
    'outbound_click',
]);

const LIKES_DOC = '__counts';
const LIKE_ID_RE = /^[a-zA-Z0-9._-]{1,64}$/;
let likesMemo = { value: null, at: 0 };
let kvImportDone = false;

const PAYLOAD_KEYS = new Set([
    'videoId',
    'category',
    'liked',
    'via',
    'seconds',
    'playing',
    'muted',
    'label',
    'href',
]);

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const headers = {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
        };

        try {
            if (request.method === 'GET' && url.pathname === '/likes') {
                const videoId = url.searchParams.get('videoId');
                if (!LIKE_ID_RE.test(videoId || '')) return json({ error: 'videoId required' }, 400, headers);
                const likes = await loadLikeCounts(env);
                return json({ videoId, count: Number(likes[videoId]) || 0 }, 200, cachedHeaders(headers));
            }

            if (request.method === 'POST' && url.pathname === '/likes') {
                const body = await readJson(request);
                const videoId = body && body.videoId;
                if (!LIKE_ID_RE.test(videoId || '')) return json({ error: 'videoId required' }, 400, headers);
                const count = await incrementLike(env, videoId, body.increment);
                return json({ videoId, count }, 200, headers);
            }

            if (request.method === 'GET' && url.pathname === '/likes/all') {
                const likes = await loadLikeCounts(env);
                return json(likes, 200, cachedHeaders(headers));
            }

            if (request.method === 'POST' && url.pathname === '/events') {
                return handleEvent(request, env, headers);
            }

            if (url.pathname.startsWith('/analytics')) {
                const auth = authorize(request, url, env);
                if (auth) return auth;
                if (!env.ANALYTICS) {
                    return json({ error: 'D1 binding ANALYTICS is missing' }, 503, headers);
                }
                await ensureSchema(env.ANALYTICS);

                if (request.method === 'GET' && url.pathname === '/analytics/overview') {
                    return handleOverview(url, env, headers);
                }

                const visitorMatch = url.pathname.match(/^\/analytics\/visitors\/([^/]+)$/);
                if (request.method === 'GET' && visitorMatch) {
                    return handleVisitorDetail(decodeURIComponent(visitorMatch[1]), url, env, headers);
                }

                if (request.method === 'GET' && url.pathname === '/analytics/visitors') {
                    return handleVisitorList(url, env, headers);
                }

                const sessionMatch = url.pathname.match(/^\/analytics\/sessions\/([^/]+)$/);
                if (request.method === 'GET' && sessionMatch) {
                    return handleSessionDetail(decodeURIComponent(sessionMatch[1]), env, headers, url.searchParams.get('excludeLocal') === '1');
                }

                if (request.method === 'GET' && url.pathname === '/analytics/sessions') {
                    return handleSessionList(url, env, headers);
                }
            }

            return json({ error: 'Not found' }, 404, headers);
        } catch (error) {
            return json({ error: error.message || 'Server error' }, 500, headers);
        }
    },
};

function json(data, status, headers) {
    return new Response(JSON.stringify(data), { status, headers });
}

function cachedHeaders(headers) {
    return { ...headers, 'Cache-Control': 'public, max-age=30' };
}

async function ensureLikesTable(env) {
    if (!env.ANALYTICS) throw new Error('D1 binding ANALYTICS is missing');
    await env.ANALYTICS.prepare(`
        CREATE TABLE IF NOT EXISTS likes (
            video_id TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
        )
    `).run();
    await importLikesFromKv(env);
}

async function kvSnapshot(env) {
    if (!env.LIKES) return {};
    try {
        const raw = await env.LIKES.get(LIKES_DOC);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        }
        const listed = await env.LIKES.list({ limit: 1000 });
        const likes = {};
        for (const key of listed.keys || []) {
            if (key.name === LIKES_DOC) continue;
            likes[key.name] = parseInt(await env.LIKES.get(key.name), 10) || 0;
        }
        return likes;
    } catch {
        return {};
    }
}

async function importLikesFromKv(env) {
    if (kvImportDone) return;
    kvImportDone = true;
    const existing = await env.ANALYTICS.prepare('SELECT COUNT(*) AS n FROM likes').first();
    if (existing && Number(existing.n) > 0) return;

    const fromKv = await kvSnapshot(env);
    const rows = Object.entries(fromKv).filter(([id, count]) => LIKE_ID_RE.test(id) && Number(count) > 0);
    if (!rows.length) return;

    await env.ANALYTICS.batch(rows.map(([id, count]) => (
        env.ANALYTICS.prepare(`
            INSERT INTO likes (video_id, count) VALUES (?, ?)
            ON CONFLICT(video_id) DO UPDATE SET count = MAX(likes.count, excluded.count)
        `).bind(id, Math.max(0, Math.round(Number(count) || 0)))
    )));
}

async function loadLikeCounts(env) {
    await ensureLikesTable(env);
    const now = Date.now();
    if (likesMemo.value && now - likesMemo.at < 5000) return { ...likesMemo.value };

    const result = await env.ANALYTICS.prepare('SELECT video_id, count FROM likes').all();
    const likes = {};
    for (const row of result.results || []) {
        likes[row.video_id] = Number(row.count) || 0;
    }
    likesMemo = { value: likes, at: now };
    return { ...likes };
}

async function incrementLike(env, videoId, increment) {
    await ensureLikesTable(env);
    const delta = Math.trunc(Number(increment));
    if (!Number.isFinite(delta) || delta === 0) {
        const row = await env.ANALYTICS.prepare('SELECT count FROM likes WHERE video_id = ?').bind(videoId).first();
        return Number(row?.count) || 0;
    }

    await env.ANALYTICS.prepare(`
        INSERT INTO likes (video_id, count) VALUES (?, MAX(0, ?))
        ON CONFLICT(video_id) DO UPDATE SET count = MAX(0, likes.count + ?)
    `).bind(videoId, delta, delta).run();

    likesMemo = { value: null, at: 0 };
    const row = await env.ANALYTICS.prepare('SELECT count FROM likes WHERE video_id = ?').bind(videoId).first();
    return Number(row?.count) || 0;
}

async function readJson(request) {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
}

function authorize(request, url, env) {
    const expected = env.ANALYTICS_TOKEN;
    if (!expected) {
        return json({ error: 'ANALYTICS_TOKEN secret is not set' }, 503, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
        });
    }

    const header = request.headers.get('Authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const alt = request.headers.get('X-Analytics-Token') || '';
    const query = url.searchParams.get('token') || '';
    const given = bearer || alt || query;

    if (!given || given !== expected) {
        return json({ error: 'Unauthorized' }, 401, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
        });
    }
    return null;
}

async function ensureSchema(db) {
    await db.batch([
        db.prepare(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                referrer TEXT,
                landing_path TEXT,
                device TEXT,
                os TEXT,
                browser TEXT,
                viewport TEXT,
                connection TEXT,
                language TEXT,
                timezone TEXT,
                reduced_motion INTEGER,
                ttfb_ms INTEGER,
                fcp_ms INTEGER,
                load_ms INTEGER,
                visitor_id TEXT
            )
        `),
        db.prepare(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                ts INTEGER NOT NULL,
                action TEXT NOT NULL,
                payload TEXT
            )
        `),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_events_action ON events(action)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at)'),
        db.prepare(`
            CREATE TABLE IF NOT EXISTS likes (
                video_id TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 0
            )
        `),
    ]);

    try {
        await db.prepare('ALTER TABLE sessions ADD COLUMN visitor_id TEXT').run();
    } catch (_) {
        /* column already exists */
    }
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id)').run();
}

function parseUserAgent(ua) {
    const value = ua || '';
    const device = /iPad|Tablet/i.test(value)
        ? 'tablet'
        : /Mobi|iPhone|Android/i.test(value)
            ? 'phone'
            : 'desktop';

    let os = 'unknown';
    if (/iPhone|iPad|iOS/i.test(value)) os = 'iOS';
    else if (/Android/i.test(value)) os = 'Android';
    else if (/CrOS/i.test(value)) os = 'ChromeOS';
    else if (/Mac OS X|Macintosh/i.test(value)) os = 'macOS';
    else if (/Windows/i.test(value)) os = 'Windows';
    else if (/Linux/i.test(value)) os = 'Linux';

    let browser = 'unknown';
    if (/Edg\//i.test(value)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(value)) browser = 'Opera';
    else if (/Firefox\//i.test(value)) browser = 'Firefox';
    else if (/Chrome\//i.test(value) && !/Edg\//i.test(value)) browser = 'Chrome';
    else if (/Safari\//i.test(value) && !/Chrome|Chromium/i.test(value)) browser = 'Safari';

    return { device, os, browser };
}

function cleanText(value, max = 180) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function cleanInt(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < min || rounded > max) return null;
    return rounded;
}

function sessionIdOk(id) {
    return typeof id === 'string' && id.length >= 8 && id.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(id);
}

function buildPayload(body) {
    const payload = {};
    for (const key of PAYLOAD_KEYS) {
        if (!(key in body)) continue;
        const value = body[key];
        if (typeof value === 'string') payload[key] = cleanText(value, 240);
        else if (typeof value === 'boolean') payload[key] = value;
        else if (typeof value === 'number' && Number.isFinite(value)) {
            payload[key] = key === 'seconds' ? Math.max(0, Math.min(3600, Math.round(value))) : value;
        }
    }
    return payload;
}

async function handleEvent(request, env, headers) {
    if (!env.ANALYTICS) {
        return json({ ok: false }, 204, headers);
    }

    const body = await readJson(request);
    const sessionId = body.sessionId;
    const action = typeof body.action === 'string' ? body.action : '';
    const ts = cleanInt(body.ts, 0, Date.now() + 60000) || Date.now();

    if (!sessionIdOk(sessionId) || !ALLOWED_ACTIONS.has(action)) {
        return json({ error: 'Invalid event' }, 400, headers);
    }

    await ensureSchema(env.ANALYTICS);

    const parsed = parseUserAgent(request.headers.get('User-Agent'));
    const sessionMeta = body.session && typeof body.session === 'object' ? body.session : {};
    const payload = buildPayload(body);
    const visitorId = sessionIdOk(body.visitorId) ? body.visitorId : '';
    const existing = await env.ANALYTICS
        .prepare('SELECT id FROM sessions WHERE id = ?')
        .bind(sessionId)
        .first();

    const statements = [];

    if (!existing) {
        statements.push(env.ANALYTICS.prepare(`
            INSERT INTO sessions (
                id, started_at, ended_at, referrer, landing_path, device, os, browser,
                viewport, connection, language, timezone, reduced_motion, ttfb_ms, fcp_ms, load_ms, visitor_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            sessionId,
            ts,
            ts,
            cleanText(sessionMeta.referrer, 400),
            cleanText(sessionMeta.landingPath, 400) || '/',
            parsed.device,
            parsed.os,
            parsed.browser,
            cleanText(sessionMeta.viewport, 24),
            cleanText(sessionMeta.connection, 24),
            cleanText(sessionMeta.language, 24),
            cleanText(sessionMeta.timezone, 64),
            sessionMeta.reducedMotion ? 1 : 0,
            cleanInt(sessionMeta.ttfbMs, 0, 120000),
            cleanInt(sessionMeta.fcpMs, 0, 120000),
            cleanInt(sessionMeta.loadMs, 0, 180000),
            visitorId || null
        ));
    } else {
        if (action === 'session_start') {
            statements.push(env.ANALYTICS.prepare(`
                UPDATE sessions SET
                    ended_at = ?,
                    referrer = COALESCE(NULLIF(?, ''), referrer),
                    landing_path = COALESCE(NULLIF(?, ''), landing_path),
                    viewport = COALESCE(NULLIF(?, ''), viewport),
                    connection = COALESCE(NULLIF(?, ''), connection),
                    language = COALESCE(NULLIF(?, ''), language),
                    timezone = COALESCE(NULLIF(?, ''), timezone),
                    reduced_motion = ?,
                    ttfb_ms = COALESCE(?, ttfb_ms),
                    fcp_ms = COALESCE(?, fcp_ms),
                    load_ms = COALESCE(?, load_ms),
                    visitor_id = COALESCE(NULLIF(visitor_id, ''), ?)
                WHERE id = ?
            `).bind(
                ts,
                cleanText(sessionMeta.referrer, 400),
                cleanText(sessionMeta.landingPath, 400),
                cleanText(sessionMeta.viewport, 24),
                cleanText(sessionMeta.connection, 24),
                cleanText(sessionMeta.language, 24),
                cleanText(sessionMeta.timezone, 64),
                sessionMeta.reducedMotion ? 1 : 0,
                cleanInt(sessionMeta.ttfbMs, 0, 120000),
                cleanInt(sessionMeta.fcpMs, 0, 120000),
                cleanInt(sessionMeta.loadMs, 0, 180000),
                visitorId || null,
                sessionId
            ));
        } else {
            statements.push(env.ANALYTICS.prepare(`
                UPDATE sessions SET
                    ended_at = ?,
                    visitor_id = COALESCE(NULLIF(visitor_id, ''), ?)
                WHERE id = ?
            `).bind(ts, visitorId || null, sessionId));
        }
    }

    if (!(existing && action === 'session_start')) {
        statements.push(env.ANALYTICS.prepare(
            'INSERT INTO events (session_id, ts, action, payload) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, ts, action, JSON.stringify(payload)));
    }

    await env.ANALYTICS.batch(statements);
    return json({ ok: true }, 200, headers);
}

function timezoneOffset(url) {
    const value = Number(url.searchParams.get('tz'));
    return Number.isFinite(value) ? Math.max(-840, Math.min(840, Math.trunc(value))) : 0;
}

function sinceFromRange(range, tzOffset = 0) {
    const now = Date.now();
    if (range === 'today') {
        const day = 24 * 60 * 60 * 1000;
        const offsetMs = tzOffset * 60 * 1000;
        return Math.floor((now - offsetMs) / day) * day + offsetMs;
    }
    if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    if (range === 'all') return 0;
    return now - 7 * 24 * 60 * 60 * 1000;
}

function periodBounds(range, tzOffset = 0) {
    const now = Date.now();
    const since = sinceFromRange(range, tzOffset);
    const span = since === 0 ? 30 * 24 * 60 * 60 * 1000 : now - since;
    const prevUntil = since === 0 ? now - span : since;
    const prevSince = prevUntil - span;
    return { now, since, prevSince, prevUntil };
}

function changePct(current, previous) {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
}

function hostOf(value) {
    if (!value) return '';
    try { return new URL(value, 'https://reelsfolio.local').hostname.replace(/^www\./, '').toLowerCase(); }
    catch { return String(value).toLowerCase(); }
}

function campaignFromPath(path) {
    if (!path || !String(path).includes('?')) return '';
    try {
        const query = new URLSearchParams(String(path).split('?')[1]);
        return (query.get('utm_source') || query.get('src') || query.get('from') || '').trim();
    } catch {
        return '';
    }
}

function arrivalBucket(referrer, landingPath) {
    const campaign = campaignFromPath(landingPath).toLowerCase();
    if (campaign.includes('linkedin')) return 'LinkedIn';
    if (campaign.includes('twitter') || campaign === 'x') return 'Twitter';
    if (campaign) return campaign;
    const referrerHost = hostOf(referrer);
    if (referrerHost.includes('linkedin')) return 'LinkedIn';
    if (referrerHost.includes('twitter') || referrerHost === 'x.com' || referrerHost === 't.co') return 'Twitter';
    if (referrerHost === 'localhost' || referrerHost === '127.0.0.1') return 'Local';
    if (referrerHost) return referrerHost;
    const landHost = hostOf(landingPath);
    if (landHost === 'localhost' || landHost === '127.0.0.1') return 'Local';
    return 'Direct';
}


// Match URL authorities, not arbitrary occurrences of "localhost" in a URL.
// No schema change: historical sessions can be filtered from their saved URLs.
function localSessionSql(alias = '') {
    const prefix = alias ? alias + '.' : '';
    return '(' + ['landing_path','referrer'].map(column => {
        const value = "LOWER(COALESCE(" + prefix + column + ", ''))";
        return ['http://','https://'].flatMap(scheme => ['localhost','127.0.0.1','[::1]'].map(host => {
            const root = scheme + host;
            return "(SUBSTR(" + value + ", 1, " + root.length + ") = '" + root + "' AND SUBSTR(" + value + ", " + (root.length + 1) + ", 1) IN ('', '/', ':', '?', '#'))";
        })).join(' OR ');
    }).join(' OR ') + ')';
}
function analyticsPrepare(env, sql, excludeLocal) {
    if (!excludeLocal) return env.ANALYTICS.prepare(sql);
    const scoped = sql.replace(/FROM sessions\b/g,'FROM report_sessions').replace(/FROM events\b/g,'FROM report_events');
    return env.ANALYTICS.prepare(`WITH report_sessions AS (
        SELECT * FROM sessions WHERE NOT ${localSessionSql()}
    ), report_events AS (
        SELECT e.* FROM events e WHERE NOT EXISTS (
            SELECT 1 FROM sessions local WHERE local.id = e.session_id AND ${localSessionSql('local')}
        )
    ) ${scoped}`);
}

async function handleOverview(url, env, headers) {
    const excludeLocal = url.searchParams.get('excludeLocal') === '1';
    const prepare = sql => analyticsPrepare(env,sql,excludeLocal);
    const range = url.searchParams.get('range') || '7d';
    const tzOffset = timezoneOffset(url);
    const tzModifier = `${-tzOffset} minutes`;
    const { since, prevSince, prevUntil } = periodBounds(range, tzOffset);
    const visitorKey = "COALESCE(NULLIF(visitor_id, ''), id)";

    const [
        visits,
        people,
        prevPeople,
        clips,
        watch,
        prevWatch,
        outbound,
        prevOutbound,
        avgSession,
        prevAvg,
        daily,
        referrers,
        load,
        localVisits,
        newLikes,
    ] = await env.ANALYTICS.batch([
        prepare('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?').bind(since),
        prepare(`
            SELECT COUNT(*) AS n FROM (
                SELECT ${visitorKey} AS vid FROM sessions WHERE started_at >= ? GROUP BY vid
            )
        `).bind(since),
        prepare(`
            SELECT COUNT(*) AS n FROM (
                SELECT ${visitorKey} AS vid FROM sessions
                WHERE started_at >= ? AND started_at < ? GROUP BY vid
            )
        `).bind(prevSince, prevUntil),
        prepare(`
            SELECT json_extract(payload, '$.videoId') AS videoId, COUNT(*) AS n
            FROM events
            WHERE action = 'video_view' AND ts >= ? AND json_extract(payload, '$.videoId') IS NOT NULL
            GROUP BY videoId
            ORDER BY n DESC
            LIMIT 8
        `).bind(since),
        prepare(`
            SELECT json_extract(payload, '$.videoId') AS videoId,
                   SUM(json_extract(payload, '$.seconds')) AS seconds
            FROM events
            WHERE action = 'video_heartbeat' AND ts >= ? AND json_extract(payload, '$.videoId') IS NOT NULL
            GROUP BY videoId
            ORDER BY seconds DESC
            LIMIT 8
        `).bind(since),
        prepare(`
            SELECT SUM(json_extract(payload, '$.seconds')) AS seconds
            FROM events
            WHERE action = 'video_heartbeat' AND ts >= ? AND ts < ?
        `).bind(prevSince, prevUntil),
        prepare(`
            SELECT json_extract(payload, '$.label') AS label, COUNT(*) AS n
            FROM events
            WHERE action = 'outbound_click' AND ts >= ?
            GROUP BY label
            ORDER BY n DESC
            LIMIT 8
        `).bind(since),
        prepare(`
            SELECT json_extract(payload, '$.label') AS label, COUNT(*) AS n
            FROM events
            WHERE action = 'outbound_click' AND ts >= ? AND ts < ?
            GROUP BY label
        `).bind(prevSince, prevUntil),
        prepare(`
            SELECT AVG(
                CASE WHEN ended_at > started_at THEN ended_at ELSE started_at END - started_at
            ) AS ms
            FROM sessions WHERE started_at >= ?
        `).bind(since),
        prepare(`
            SELECT AVG(
                CASE WHEN ended_at > started_at THEN ended_at ELSE started_at END - started_at
            ) AS ms
            FROM sessions WHERE started_at >= ? AND started_at < ?
        `).bind(prevSince, prevUntil),
        prepare(`
            SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', ?) AS day,
                   COUNT(DISTINCT ${visitorKey}) AS n
            FROM sessions
            WHERE started_at >= ?
            GROUP BY day
            ORDER BY day
        `).bind(tzModifier, since),
        prepare(`
            SELECT referrer, landing_path, COUNT(*) AS n
            FROM sessions
            WHERE started_at >= ?
            GROUP BY referrer, landing_path
        `).bind(since),
        prepare(`
            SELECT AVG(load_ms) AS load
            FROM sessions
            WHERE started_at >= ? AND load_ms IS NOT NULL
        `).bind(since),
        env.ANALYTICS.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ? AND ${localSessionSql()}`).bind(since),
        prepare(`
            SELECT json_extract(payload, '$.videoId') AS videoId, COUNT(*) AS n
            FROM events WHERE ts >= ? AND action = 'like_toggle'
                AND json_extract(payload, '$.liked') = 1
                AND json_extract(payload, '$.videoId') IS NOT NULL
            GROUP BY videoId
        `).bind(since),
    ]);

    const watchRows = watch.results || [];
    const watchSeconds = watchRows.reduce((sum, row) => sum + (Number(row.seconds) || 0), 0);
    const prevWatchSeconds = Number(prevWatch.results[0]?.seconds) || 0;
    const outboundRows = outbound.results || [];
    const outboundTotal = outboundRows.reduce((sum, row) => sum + (Number(row.n) || 0), 0);
    const prevOutboundTotal = (prevOutbound.results || []).reduce((sum, row) => sum + (Number(row.n) || 0), 0);
    const linkedin = outboundRows.find((row) => String(row.label || '').toLowerCase() === 'linkedin')?.n || 0;
    const avgMs = Number(avgSession.results[0]?.ms) || 0;
    const prevAvgMs = Number(prevAvg.results[0]?.ms) || 0;
    const visitorCount = people.results[0]?.n || 0;
    const prevVisitorCount = prevPeople.results[0]?.n || 0;

    const sources = {};
    for (const row of referrers.results || []) {
        const bucket = arrivalBucket(row.referrer, row.landing_path);
        sources[bucket] = (sources[bucket] || 0) + (row.n || 0);
    }

    return json({
        range,
        localExcluded: excludeLocal,
        localVisitCount: localVisits.results[0]?.n || 0,
        visits: visits.results[0]?.n || 0,
        visitors: visitorCount,
        watchSeconds,
        avgSessionMs: Math.round(avgMs),
        linkedin,
        outboundTotal,
        deltas: {
            visitors: changePct(visitorCount, prevVisitorCount),
            watch: changePct(watchSeconds, prevWatchSeconds),
            avgSession: changePct(avgMs, prevAvgMs),
            outbound: changePct(outboundTotal, prevOutboundTotal),
            linkedin: changePct(linkedin, (prevOutbound.results || []).find((row) => String(row.label || '').toLowerCase() === 'linkedin')?.n || 0),
        },
        daily: daily.results || [],
        clips: clips.results || [],
        newLikes: newLikes.results || [],
        watch: watchRows,
        sources: Object.entries(sources)
            .map(([label, n]) => ({ label, n }))
            .sort((a, b) => b.n - a.n),
        outbound: outboundRows,
        load: {
            load: load.results[0]?.load ? Math.round(load.results[0].load) : null,
        },
    }, 200, headers);
}

function visitorKeySql() {
    return "COALESCE(NULLIF(visitor_id, ''), id)";
}

async function handleVisitorList(url, env, headers) {
    const since = sinceFromRange(url.searchParams.get('range') || '7d', timezoneOffset(url));
    const limit = Math.min(50, Math.max(10, parseInt(url.searchParams.get('limit') || '25', 10) || 25));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const device = cleanText(url.searchParams.get('device') || '', 16);
    const q = cleanText(url.searchParams.get('q') || '', 40);
    const clip = cleanText(url.searchParams.get('clip') || '', 40);
    const key = visitorKeySql();

    let where = 'started_at >= ?';
    const binds = [since];

    if (['phone', 'desktop', 'tablet'].includes(device)) {
        where += ' AND device = ?';
        binds.push(device);
    }
    if (q) {
        const like = `%${q}%`;
        where += ' AND (device LIKE ? OR os LIKE ? OR browser LIKE ?)';
        binds.push(like, like, like);
    }
    if (clip) {
        where += ` AND ${key} IN (
            SELECT COALESCE(NULLIF(s2.visitor_id, ''), s2.id)
            FROM events e
            JOIN sessions s2 ON s2.id = e.session_id
            WHERE e.action IN ('video_view', 'video_heartbeat')
              AND json_extract(e.payload, '$.videoId') = ?
        )`;
        binds.push(clip);
    }

    const count = await env.ANALYTICS.prepare(`
        SELECT COUNT(*) AS n FROM (
            SELECT ${key} AS vid FROM sessions WHERE ${where} GROUP BY vid
        )
    `).bind(...binds).first();

    const rows = await env.ANALYTICS.prepare(`
        SELECT
            ${key} AS visitor_id,
            MAX(started_at) AS last_seen,
            MIN(started_at) AS first_seen,
            COUNT(*) AS visit_count,
            MAX(device) AS device,
            MAX(os) AS os,
            MAX(browser) AS browser
        FROM sessions
        WHERE ${where}
        GROUP BY ${key}
        ORDER BY last_seen DESC
        LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    return json({
        visitors: rows.results || [],
        total: count?.n || 0,
        limit,
        offset,
    }, 200, headers);
}

async function handleVisitorDetail(visitorId, url, env, headers) {
    if (!sessionIdOk(visitorId)) {
        return json({ error: 'Invalid visitor' }, 400, headers);
    }

    const since = sinceFromRange(url.searchParams.get('range') || '7d', timezoneOffset(url));
    const key = visitorKeySql();
    const sessions = await env.ANALYTICS.prepare(`
        SELECT
            s.id,
            s.started_at,
            s.ended_at,
            s.device,
            s.os,
            s.browser,
            s.viewport,
            s.referrer,
            s.ttfb_ms,
            s.fcp_ms,
            s.load_ms,
            s.visitor_id,
            (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
            (
                SELECT e.action FROM events e
                WHERE e.session_id = s.id AND e.action != 'session_start'
                ORDER BY e.ts DESC
                LIMIT 1
            ) AS last_action,
            (
                SELECT e.payload FROM events e
                WHERE e.session_id = s.id AND e.action != 'session_start'
                ORDER BY e.ts DESC
                LIMIT 1
            ) AS last_payload
        FROM sessions s
        WHERE s.started_at >= ? AND ${key} = ?
        ORDER BY s.started_at DESC
        LIMIT 40
    `).bind(since, visitorId).all();

    const list = (sessions.results || []).map((row) => ({
        ...row,
        last_payload: safeParse(row.last_payload),
    }));

    if (!list.length) return json({ error: 'Not found' }, 404, headers);

    return json({
        visitor: {
            id: visitorId,
            device: list[0].device,
            os: list[0].os,
            browser: list[0].browser,
            first_seen: list[list.length - 1].started_at,
            last_seen: list[0].started_at,
            visit_count: list.length,
        },
        sessions: list,
    }, 200, headers);
}

async function handleSessionList(url, env, headers) {
    const since = sinceFromRange(url.searchParams.get('range') || '7d', timezoneOffset(url));
    const limit = Math.min(80, Math.max(10, parseInt(url.searchParams.get('limit') || '40', 10) || 40));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const device = cleanText(url.searchParams.get('device') || '', 16);

    const excludeLocal = url.searchParams.get('excludeLocal') === '1';
    let where = 's.started_at >= ?' + (excludeLocal ? ' AND NOT ' + localSessionSql('s') : '');
    const binds = [since];
    if (['phone', 'desktop', 'tablet'].includes(device)) {
        where += ' AND s.device = ?';
        binds.push(device);
    }

    const count = await env.ANALYTICS.prepare(
        `SELECT COUNT(*) AS n FROM sessions s WHERE ${where}`
    ).bind(...binds).first();

    const rows = await env.ANALYTICS.prepare(`
        SELECT
            s.id,
            s.started_at,
            s.ended_at,
            s.device,
            s.os,
            s.browser,
            s.viewport,
            s.referrer,
            s.landing_path,
            s.visitor_id,
            s.ttfb_ms,
            s.fcp_ms,
            s.load_ms,
            (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
            (
                SELECT e.action FROM events e
                WHERE e.session_id = s.id AND e.action != 'session_start'
                ORDER BY e.ts DESC
                LIMIT 1
            ) AS last_action,
            (
                SELECT e.payload FROM events e
                WHERE e.session_id = s.id AND e.action != 'session_start'
                ORDER BY e.ts DESC
                LIMIT 1
            ) AS last_payload
        FROM sessions s
        WHERE ${where}
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    const sessions = await decorateGuests(env.ANALYTICS, (rows.results || []).map((row) => ({
        ...row,
        last_payload: safeParse(row.last_payload),
    })), excludeLocal);

    return json({
        localExcluded: excludeLocal,
        sessions: await attachPaths(env.ANALYTICS, sessions),
        total: count?.n || 0,
        limit,
        offset,
    }, 200, headers);
}

async function attachPaths(db, sessions) {
    if (!sessions.length) return sessions;
    const ids = sessions.map((session) => session.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.prepare(`
        SELECT session_id, json_extract(payload, '$.videoId') AS videoId, MIN(ts) AS first_ts
        FROM events
        WHERE session_id IN (${placeholders})
          AND action IN ('video_view', 'video_heartbeat')
          AND json_extract(payload, '$.videoId') IS NOT NULL
        GROUP BY session_id, videoId
        ORDER BY session_id, first_ts
    `).bind(...ids).all();

    const reactions = await db.prepare(`
        SELECT session_id, videoId, liked, ts, id AS eventId FROM (
            SELECT session_id, json_extract(payload, '$.videoId') AS videoId,
                json_extract(payload, '$.liked') AS liked, ts, id,
                ROW_NUMBER() OVER (PARTITION BY session_id, json_extract(payload, '$.videoId') ORDER BY ts DESC, id DESC) AS rank
            FROM events WHERE session_id IN (${placeholders}) AND action = 'like_toggle'
                AND json_extract(payload, '$.videoId') IS NOT NULL
        ) WHERE rank = 1
    `).bind(...ids).all();
    const reactionsBySession = new Map();
    for (const row of reactions.results || []) {
        if (!reactionsBySession.has(row.session_id)) reactionsBySession.set(row.session_id, []);
        reactionsBySession.get(row.session_id).push({videoId:row.videoId,liked:row.liked===1,ts:row.ts,eventId:row.eventId});
    }

    const byId = new Map();
    for (const row of rows.results || []) {
        if (!byId.has(row.session_id)) byId.set(row.session_id, []);
        byId.get(row.session_id).push(row.videoId);
    }

    return sessions.map((session) => ({
        ...session,
        path: byId.get(session.id) || [],
        reactions: reactionsBySession.get(session.id) || [],
    }));
}

function visitorKeyOf(row) {
    return row.visitor_id || row.id;
}

function rangesOverlap(a, b) {
    return a.started_at < (b.ended_at || b.started_at)
        && b.started_at < (a.ended_at || a.started_at);
}

async function decorateGuests(db, sessions, excludeLocal = false) {
    if (!sessions.length) return sessions;

    const firsts = await db.prepare(`
        SELECT COALESCE(NULLIF(visitor_id, ''), id) AS vid, MIN(started_at) AS first_seen
        FROM sessions
        GROUP BY COALESCE(NULLIF(visitor_id, ''), id)
        ORDER BY first_seen ASC, vid ASC
    `).all();

    const guestByVid = new Map();
    (firsts.results || []).forEach((row, index) => {
        guestByVid.set(row.vid, index + 1);
    });

    const vids = [...new Set(sessions.map(visitorKeyOf))];
    const placeholders = vids.map(() => '?').join(',');
    const family = await db.prepare(`
        SELECT id, started_at, ended_at, COALESCE(NULLIF(visitor_id, ''), id) AS vid
        FROM sessions
        WHERE COALESCE(NULLIF(visitor_id, ''), id) IN (${placeholders})
          ${excludeLocal ? 'AND NOT ' + localSessionSql() : ''}
        ORDER BY started_at ASC
    `).bind(...vids).all();

    const byVid = new Map();
    for (const row of family.results || []) {
        if (!byVid.has(row.vid)) byVid.set(row.vid, []);
        byVid.get(row.vid).push(row);
    }

    return sessions.map((session) => {
        const vid = visitorKeyOf(session);
        const kin = byVid.get(vid) || [session];
        const visitNumber = Math.max(1, kin.findIndex((row) => row.id === session.id) + 1);
        return {
            ...session,
            guest_number: guestByVid.get(vid) || null,
            visit_number: visitNumber,
            visit_count: kin.length,
            is_tab: kin.some((other) => other.id !== session.id && rangesOverlap(session, other)),
        };
    });
}

async function handleSessionDetail(sessionId, env, headers, excludeLocal = false) {
    if (!sessionIdOk(sessionId)) {
        return json({ error: 'Invalid session' }, 400, headers);
    }

    const session = await env.ANALYTICS.prepare(
        'SELECT * FROM sessions WHERE id = ?' + (excludeLocal ? ' AND NOT ' + localSessionSql() : '')
    ).bind(sessionId).first();

    if (!session) return json({ error: 'Not found' }, 404, headers);

    const events = await env.ANALYTICS.prepare(`
        SELECT id, ts, action, payload
        FROM events
        WHERE session_id = ?
        ORDER BY ts ASC
        LIMIT 401
    `).bind(sessionId).all();

    const [decorated] = await decorateGuests(env.ANALYTICS, [session], excludeLocal);

    return json({
        session: decorated || session,
        eventsTruncated: (events.results || []).length > 400,
        events: (events.results || []).slice(0,400).map((event) => ({
            ...event,
            payload: safeParse(event.payload),
        })),
    }, 200, headers);
}

function safeParse(value) {
    if (!value || typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}
