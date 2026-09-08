        // State
        let videosData = null;
        let isMuted = true;
        let userManuallyMuted = false; // True when user explicitly clicked mute button
        let isWarping = false; // Flag to prevent BG updates during warp
        let isPlaying = false;
        let hasStartedExperience = false;
        let observer = null;
        let currentVideoId = null;
        let videosReady = {};
        let isScrolling = false;
        let userPaused = {}; // Track which videos were paused by the user
        let totalSectionsCount = 0; // Total sections for nav arrow visibility
        let playVideoDebounceTimer = null; // Debounce video playback during scroll
        let suppressObserverPlayback = false;


        function getSectionHeight() {
            if (window.innerWidth <= 600) {
                const nav = document.querySelector('.mobile-bottom-nav');
                const navStyle = nav ? getComputedStyle(nav) : null;
                const navIsVisible = navStyle && navStyle.display !== 'none' && navStyle.visibility !== 'hidden';
                const navH = navIsVisible ? nav.offsetHeight : 0;
                return window.innerHeight - navH;
            }
            return window.innerHeight;
        }

        // DOM Elements
        const bgLayer = document.getElementById('bgLayer');
        const tabsContainer = document.getElementById('tabsContainer');
        const globalTabs = document.getElementById('globalTabs');
        const gridBtn = document.getElementById('gridBtn');
        const controlBar = document.querySelector('.control-bar');

        function setBackgroundColor(color) {
            if (!color || !bgLayer) return;
            if (document.documentElement.style.getPropertyValue('--active-bg-color') === color) return;
            document.documentElement.style.setProperty('--active-bg-color', color);
        }

        // --- First-party analytics (session + events, no third-party cookies) ---
        const _analyticsWorkerUrl = 'https://reelsfolio-likes.vibhoresinghal.workers.dev';
        const _watchState = {
            videoId: null,
            lastTick: 0,
            accumulated: 0,
            interval: null,
            viewed: new Set(),
        };

        function getAnalyticsSessionId() {
            try {
                let id = sessionStorage.getItem('rf_sid');
                if (!id) {
                    id = (crypto.randomUUID && crypto.randomUUID())
                        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                    sessionStorage.setItem('rf_sid', id);
                }
                return id;
            } catch (_) {
                return `tmp-${Date.now()}`;
            }
        }

        function getAnalyticsVisitorId() {
            try {
                let id = localStorage.getItem('rf_vid');
                if (!id) {
                    id = (crypto.randomUUID && crypto.randomUUID())
                        || `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                    localStorage.setItem('rf_vid', id);
                }
                return id;
            } catch (_) {
                return getAnalyticsSessionId();
            }
        }

        function collectSessionSnapshot() {
            const ua = navigator.userAgent || '';
            const nav = performance.getEntriesByType
                ? performance.getEntriesByType('navigation')[0]
                : null;
            const paints = performance.getEntriesByType
                ? performance.getEntriesByType('paint')
                : [];
            const fcp = paints.find(entry => entry.name === 'first-contentful-paint');
            return {
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                connection: (navigator.connection && navigator.connection.effectiveType) || '',
                language: navigator.language || '',
                timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
                reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
                ttfbMs: nav ? Math.round(nav.responseStart) : null,
                fcpMs: fcp ? Math.round(fcp.startTime) : null,
                loadMs: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
                referrer: document.referrer || '',
                landingPath: location.origin + location.pathname + location.search,
                uaHint: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'phone' : 'desktop',
            };
        }

        function trackEvent(action, data) {
            const event = {
                sessionId: getAnalyticsSessionId(),
                visitorId: getAnalyticsVisitorId(),
                action,
                ts: Date.now(),
                ...(data || {}),
            };
            setTimeout(() => {
                try {
                    navigator.sendBeacon(_analyticsWorkerUrl + '/events', JSON.stringify(event));
                } catch (_) { /* worker may still be deploying */ }
            }, 0);
        }

        function flushWatch() {
            if (!_watchState.videoId || _watchState.accumulated < 1) {
                _watchState.accumulated = 0;
                return;
            }
            trackEvent('video_heartbeat', {
                videoId: _watchState.videoId,
                seconds: Math.round(_watchState.accumulated),
                playing: isPlaying,
                muted: isMuted,
            });
            _watchState.accumulated = 0;
        }

        function startWatchTimer(videoId) {
            if (_watchState.videoId && _watchState.videoId !== videoId) {
                const now = Date.now();
                const current = document.getElementById(_watchState.videoId);
                if (current && !current.paused && document.visibilityState === 'visible') {
                    _watchState.accumulated += (now - _watchState.lastTick) / 1000;
                }
                flushWatch();
            }

            _watchState.videoId = videoId;
            _watchState.lastTick = Date.now();

            if (!_watchState.viewed.has(videoId)) {
                _watchState.viewed.add(videoId);
                const lookupId = videoId === 'landing-video' ? 'landing' : videoId;
                const section = document.querySelector(`[data-video-id="${lookupId}"]`)
                    || document.querySelector(`[data-video-id="${videoId}"]`);
                trackEvent('video_view', {
                    videoId,
                    category: section ? (section.getAttribute('data-category') || 'landing') : 'landing',
                });
            }

            const video = document.getElementById(videoId);
            if (video && !video._rfWatchEnd) {
                video.addEventListener('ended', () => {
                    if (_watchState.videoId !== videoId) return;
                    const now = Date.now();
                    if (document.visibilityState === 'visible') {
                        _watchState.accumulated += (now - _watchState.lastTick) / 1000;
                    }
                    flushWatch();
                    _watchState.lastTick = Date.now();
                });
                video._rfWatchEnd = true;
            }

            if (_watchState.interval) clearInterval(_watchState.interval);
            _watchState.interval = setInterval(() => {
                if (document.visibilityState !== 'visible' || !_watchState.videoId) return;
                const active = document.getElementById(_watchState.videoId);
                if (!active || active.paused) {
                    _watchState.lastTick = Date.now();
                    return;
                }
                const now = Date.now();
                _watchState.accumulated += (now - _watchState.lastTick) / 1000;
                _watchState.lastTick = now;
            }, 1000);
        }

        function cancelWatchTimer(videoId) {
            if (_watchState.videoId !== videoId) return;
            const now = Date.now();
            const video = document.getElementById(videoId);
            if (video && !video.paused && document.visibilityState === 'visible') {
                _watchState.accumulated += (now - _watchState.lastTick) / 1000;
            }
            flushWatch();
            _watchState.videoId = null;
            if (_watchState.interval) {
                clearInterval(_watchState.interval);
                _watchState.interval = null;
            }
        }

        function startAnalyticsSession() {
            try {
                if (sessionStorage.getItem('rf_session_started')) return;
            } catch (_) { /* continue */ }
            const send = () => {
                try { sessionStorage.setItem('rf_session_started', '1'); } catch (_) { /* ignore */ }
                trackEvent('session_start', { session: collectSessionSnapshot() });
            };
            if (document.readyState === 'complete') send();
            else window.addEventListener('load', () => setTimeout(send, 0), { once: true });
        }

        document.addEventListener('click', event => {
            const link = event.target.closest('.landing-action, .content-link');
            if (!link || link.classList.contains('is-placeholder')) return;
            const href = link.getAttribute('href') || '';
            if (!href || href === '#') return;
            const label = link.classList.contains('landing-resume-action') ? 'resume'
                : link.classList.contains('landing-linkedin-action') ? 'linkedin'
                : link.classList.contains('landing-x-action') ? 'x'
                : link.classList.contains('landing-email-action') ? 'email'
                : (link.textContent || '').replace(/\s+/g, ' ').trim() || 'link';
            trackEvent('outbound_click', { label, href });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushWatch();
            _watchState.lastTick = Date.now();
        });

        window.addEventListener('pagehide', () => flushWatch());
        startAnalyticsSession();

        // Safety: Clear warping flag on user interaction to ensure UI updates resume
        window.addEventListener('wheel', () => { if (isWarping) isWarping = false; }, { passive: true });
        window.addEventListener('touchstart', () => { if (isWarping) isWarping = false; }, { passive: true });
        window.addEventListener('keydown', () => { if (isWarping) isWarping = false; }, { passive: true });

        function preventPageZoom(event) {
            if (event.type === 'wheel' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                return;
            }
            if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && ['=', '+', '-', '0', '_'].includes(event.key)) {
                event.preventDefault();
            }
        }
        window.addEventListener('wheel', preventPageZoom, { passive: false });
        window.addEventListener('keydown', preventPageZoom, { passive: false });
        window.addEventListener('gesturestart', event => event.preventDefault());
        window.addEventListener('gesturechange', event => event.preventDefault());

        let _mobileNavItems = null;
        function updateMobileNav(activeTabId) {
            if (!_mobileNavItems) _mobileNavItems = document.querySelectorAll('.mobile-nav-item');
            _mobileNavItems.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab-id') === activeTabId);
            });
        }

        // Office filters block *.r2.dev. Videos stay in the same R2 bucket;
        // this rewrites the old public host to the custom domain.
        // New images should use https://img.vibhoresinghal.com/... directly.
        const R2_MEDIA_ORIGINS = {
            'pub-a6a75e45309c4da7bb1fb6c3aea78409.r2.dev': 'video.vibhoresinghal.com',
        };

        function rewriteMediaUrl(value) {
            if (typeof value !== 'string' || !value.includes('.r2.dev')) return value;
            try {
                const url = new URL(value);
                const nextHost = R2_MEDIA_ORIGINS[url.host];
                if (!nextHost) return value;
                url.protocol = 'https:';
                url.host = nextHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
                return url.toString();
            } catch {
                return value;
            }
        }

        function rewriteMediaTree(node) {
            if (Array.isArray(node)) return node.map(rewriteMediaTree);
            if (node && typeof node === 'object') {
                for (const key of Object.keys(node)) node[key] = rewriteMediaTree(node[key]);
                return node;
            }
            return rewriteMediaUrl(node);
        }

        function applyMediaOriginPreconnects() {
            document.querySelectorAll('link[rel="preconnect"]').forEach((link) => {
                const next = rewriteMediaUrl(link.getAttribute('href') || '');
                if (next) link.setAttribute('href', next);
            });
        }

        // Initialize
        async function initApp() {
            try {
                const response = await fetch('videos.json');
                videosData = rewriteMediaTree(await response.json());
                applyMediaOriginPreconnects();

                // The landing video element owns buffering via preload="auto".
                // A separate fetch preload uses a different request mode and cannot
                // reliably be reused by the media element.

                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                // The HTML starts in intro-pending, before scripts or data arrive.
                renderApp();
                initLikeButton(); // Initialize like button state
                initSoundHint(); // Show 'Tap for sound' hint on first visit
                initMobileFirstReelNudge();
                initDesktopMuteHover();
                initBufferingIndicators();
                if (!reduceMotion) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            document.body.classList.remove('intro-pending');
                            document.body.classList.add('intro-ready');
                            window.setTimeout(() => document.body.classList.remove('intro-ready'), 1600);
                        });
                    });
                } else {
                    document.body.classList.remove('intro-pending');
                }
            } catch (error) {
                console.error('Failed to load videos:', error);
                document.body.classList.remove('intro-pending');
            }
        }

        function initDesktopMuteHover() {
            let hideTimer = null;
            const soundControl = document.querySelector('.control-bar');
            const frames = document.querySelectorAll('.video-frame, .landing-video-frame');
            if (!soundControl || !frames.length) return;

            const show = () => {
                clearTimeout(hideTimer);
                document.body.classList.add('video-hover-active');
            };
            const hideSoon = () => {
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => {
                    document.body.classList.remove('video-hover-active');
                }, 650);
            };

            frames.forEach(frame => {
                frame.addEventListener('mouseenter', show);
                frame.addEventListener('mouseleave', hideSoon);
            });
            soundControl.addEventListener('mouseenter', show);
            soundControl.addEventListener('mouseleave', hideSoon);
        }

        // Helper function to get comment icon SVG by type
        function getCommentIcon(type) {
            const iconStyle = 'width: 18px; height: 18px;';
            const icons = {
                heart: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" /></svg>`,
                fire: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" /></svg>`,
                sparkle: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clip-rule="evenodd" /></svg>`,
                star: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" /></svg>`,
                lightning: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clip-rule="evenodd" /></svg>`,
                check: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" /></svg>`,
                eye: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path fill-rule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clip-rule="evenodd" /></svg>`,
                award: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a.75.75 0 000 1.5h2.625c.621 0 1.125-.504 1.125-1.125v-2.625a.375.375 0 01.375-.375h4.92a.375.375 0 01.375.375v2.625c0 .621.504 1.125 1.125 1.125H18a.75.75 0 000-1.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clip-rule="evenodd" /></svg>`,
                code: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path fill-rule="evenodd" d="M14.447 3.027a.75.75 0 01.527.92l-4.5 16.5a.75.75 0 01-1.448-.394l4.5-16.5a.75.75 0 01.921-.526zM16.72 6.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 010-1.06zm-9.44 0a.75.75 0 010 1.06L2.56 12l4.72 4.72a.75.75 0 11-1.06 1.06L.97 12.53a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clip-rule="evenodd" /></svg>`,
                camera: `<svg viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" /><path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3h-15a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0zm12-2.25a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H19.5a.75.75 0 01-.75-.75V10.5z" clip-rule="evenodd" /></svg>`,
                avatar: `<svg viewBox="0 0 24 24" fill="white" style="${iconStyle}"><path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" /></svg>`
            };
            return icons[type] || '';
        }

        const TITLE_IMPORTANT_PARTS = {
            'Vibhore Singhal': 'Vibhore',
            'Acquisition on PayZapp': 'Acquisition',
            'Growth & Retention on PayZapp': 'Growth & Retention',
            'Unicorn Design System': 'Unicorn',
            'A Weekend in Sakleshpur': 'Sakleshpur',
            'Delhi in a lapse': 'Delhi'
        };

        function escapeTitleText(text) {
            return String(text)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        }

        function formatProjectTitle(title) {
            const value = String(title || '');
            const importantPart = TITLE_IMPORTANT_PARTS[value] || value;
            const start = value.indexOf(importantPart);
            if (start < 0) return escapeTitleText(value);

            const before = value.slice(0, start);
            const after = value.slice(start + importantPart.length);
            return [
                before ? `<span class="content-title-supporting">${escapeTitleText(before)}</span>` : '',
                `<span class="content-title-important">${escapeTitleText(importantPart)}</span>`,
                after ? `<span class="content-title-supporting">${escapeTitleText(after)}</span>` : ''
            ].join('');
        }

        // Render the entire app structure - SINGLE PAGE SCROLL
        function renderApp() {
            if (!videosData || !videosData.tabs) return;

            const landing = videosData.landingSection || {};

            // 1. Generate Tabs Navigation HTML - these are now scroll anchors or grid switchers
            const tabButtonsHTML = videosData.tabs.map((tab, index) =>
                `<button class="tab-btn" data-tab-id="${tab.id}" onclick="handleTabClick('${tab.id}')">${tab.label}</button>`
            ).join('');

            // Populate Global Fixed Tabs
            if (globalTabs) globalTabs.innerHTML = tabButtonsHTML;

            // Generate location tags HTML
            function generateLocationTagsHTML(locations) {
                if (!locations || !locations.length) return '';
                return locations.map(loc => {
                    const icon = loc.icon === 'location'
                        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>'
                        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>';
                    return `<span class="location-tag">${icon} ${loc.text}</span>`;
                }).join('');
            }

            // 2. Render SINGLE continuous scroll container with ALL content
            // Structure: Landing -> Zeta -> Personal -> Films -> Life
            let allSectionsHTML = `
                <!-- LANDING SECTION -->
                <div class="landing-section active" id="section-landing" data-video-id="landing" data-bg-color="${landing.bgColor || '#091A12'}">
                    <div class="landing-profile-info">
                        <p class="landing-bio">${landing.bio || ''}</p>
                        <h1 class="landing-name">${formatProjectTitle(landing.name || 'Vibhore Singhal')}</h1>
                        <div class="landing-locations">
                            ${generateLocationTagsHTML(landing.locations)}
                        </div>
                        <div class="landing-actions" aria-label="Profile links">
                            <a class="landing-action landing-resume-action is-placeholder" href="#"
                               onclick="return false;" aria-disabled="true" title="Résumé coming soon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M12 3v12" />
                                    <path d="m7 10 5 5 5-5" />
                                    <path d="M5 21h14" />
                                </svg>
                                <span>Download Resume</span>
                            </a>
                            <a class="landing-action landing-social-action landing-linkedin-action" href="https://www.linkedin.com/in/vibhoresinghal"
                               target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M6.5 8.25H3.25V21H6.5V8.25ZM4.875 3A1.88 1.88 0 1 0 4.875 6.76 1.88 1.88 0 0 0 4.875 3ZM21 13.7c0-3.84-2.05-5.63-4.79-5.63-2.2 0-3.19 1.21-3.74 2.06V8.25H9.22V21h3.25v-6.32c0-1.67.32-3.29 2.39-3.29 2.04 0 2.06 1.91 2.06 3.4V21H21v-7.3Z" />
                                </svg>
                            </a>
                            <a class="landing-action landing-social-action landing-x-action" href="https://x.com/vibhxre"
                               target="_blank" rel="noopener noreferrer" aria-label="X" title="X">
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.26-8.3L2.98 2h6.4l4.42 5.84L18.9 2Zm-1.09 17.84h1.72L8.44 4.05H6.59l11.22 15.79Z" />
                                </svg>
                            </a>
                            <a class="landing-action landing-social-action landing-email-action" href="mailto:vibhoresinghal60@gmail.com"
                               aria-label="Email Vibhore" title="Email">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="14" rx="2" />
                                    <path d="m4 7 8 6 8-6" />
                                </svg>
                            </a>
                        </div>
                    </div>
                    <div class="landing-video-shell">
                    <div class="landing-video-frame" data-tap-video="landing-video">
                        ${landing.thumbnail ? `<img class="video-poster" src="${landing.thumbnail}" alt="" decoding="async">` : ''}
                        <video id="landing-video" src="${landing.profileVideo || ''}" muted playsinline loop preload="auto"></video>
                        <div class="video-buffering" aria-hidden="true"><span class="video-buffering-ring"></span></div>
                        <div class="play-overlay-btn" id="btn-landing-video">
                            <svg class="play-overlay-icon" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>
                            <svg class="pause-overlay-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.2" y="4.6" width="4.2" height="14.8" rx="1.5"/><rect x="13.6" y="4.6" width="4.2" height="14.8" rx="1.5"/></svg>
                            <svg class="play-with-sound-ring" viewBox="0 0 120 120" aria-hidden="true">
                                <defs><path id="play-sound-path-landing" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0" /></defs>
                                <text><textPath href="#play-sound-path-landing">PLAY WITH SOUND • PLAY WITH SOUND • </textPath></text>
                            </svg>
                        </div>
                        <div class="video-seekbar" data-for="landing-video">
                            <div class="video-seekbar-track">
                                <div class="video-seekbar-fill" id="seekbar-landing-video"></div>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            `;

            // Calculate total sections for arrow visibility
            let totalSections = 1; // Start with 1 for landing
            videosData.tabs.forEach(tab => totalSections += tab.videos.length);
            totalSectionsCount = totalSections; // Store globally for arrow updates
            let sectionCounter = 1; // Start after landing (landing is index 0)

            // Add all category videos in order
            videosData.tabs.forEach((tab, tabIndex) => {
                tab.videos.forEach((video, videoIndex) => {
                    const isFirstVideo = tabIndex === 0 && videoIndex === 0;
                    const isFirstOfCategory = videoIndex === 0;
                    const preloadStrategy = isFirstVideo ? 'metadata' : 'none';
                    const currentSectionIndex = sectionCounter;

                    allSectionsHTML += `
                        <div class="video-section video-section-r2 ${video.isLandscape ? 'landscape-mode' : ''}" 
                             ${isFirstOfCategory ? `id="section-${tab.id}"` : ''}
                             data-video-id="${video.id}" 
                             data-bg-color="${video.bgColor}" 
                             data-category="${tab.id}"
                             data-section-index="${currentSectionIndex}"
                             data-video-src="${video.src}">
                            
                            <div class="video-content-wrapper">
                                <div class="content-info-left">
                                    ${video.description ? `<p class="content-desc">${video.description}</p>` : ''}
                                    ${video.title ? `<h2 class="content-title">${formatProjectTitle(video.title)}</h2>` : ''}
                                    ${video.link ? `<a class="content-link" href="${video.link.url}" target="_blank" rel="noopener noreferrer"><span class="content-link-inner"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clip-rule="evenodd" /></svg>${video.link.text}</span></a>` : ''}
                                </div>
                                
                                <div class="video-frame" data-tap-video="${video.id}">
                                    ${video.thumbnail ? `<img class="video-poster" ${currentSectionIndex <= 2 ? `src="${video.thumbnail}"` : `data-poster-src="${video.thumbnail}"`} alt="" decoding="async">` : ''}
                                    <video id="${video.id}" ${isFirstVideo ? `src="${video.src}"` : ''} data-src="${video.src}" muted playsinline loop preload="${preloadStrategy}"></video>
                                    <div class="video-buffering" aria-hidden="true"><span class="video-buffering-ring"></span></div>
                                    <div class="play-overlay-btn" id="btn-${video.id}">
                                        <svg class="play-overlay-icon" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>
                                        <svg class="pause-overlay-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.2" y="4.6" width="4.2" height="14.8" rx="1.5"/><rect x="13.6" y="4.6" width="4.2" height="14.8" rx="1.5"/></svg>
                                        <svg class="play-with-sound-ring" viewBox="0 0 120 120" aria-hidden="true">
                                            <defs><path id="play-sound-path-${video.id}" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0" /></defs>
                                            <text><textPath href="#play-sound-path-${video.id}">PLAY WITH SOUND • PLAY WITH SOUND • </textPath></text>
                                        </svg>
                                    </div>
                                    <div class="video-seekbar" data-for="${video.id}">
                                        <div class="video-seekbar-track">
                                            <div class="video-seekbar-fill" id="seekbar-${video.id}"></div>
                                        </div>
                                    </div>
                                </div>

                                <div class="content-info-right">
                                    ${video.comments ? video.comments.map(comment => `
                                        <div class="comment-pill">
                                            <div class="comment-icon" style="background: ${comment.avatarColor || (comment.type === 'avatar' ? '#3498db' : 'rgba(255,255,255,0.2)')};">
                                                ${getCommentIcon(comment.type)}
                                            </div>
                                            <span>${comment.text}</span>
                                        </div>
                                    `).join('') : ''}
                                </div>
                            </div>
                        </div>
                    `;
                    sectionCounter++;
                });
            });

            // Put all content in the single scroll container
            tabsContainer.innerHTML = `<div class="video-container" id="mainScrollContainer">${allSectionsHTML}</div>`;

            document.querySelectorAll('.landing-action, .content-link').forEach(button => {
                // Read the CSS defaults only when this hover effect is first used.
                // Startup should not force layout immediately after inserting reels.
                let restX = 72, restY = 18, restingPositionRead = false;
                let targetX = restX;
                let targetY = restY;
                let x = restX;
                let y = restY;
                let strength = 0;
                let targetStrength = 0;
                let frame = 0;
                const tick = () => {
                    x += (targetX - x) * 0.16;
                    y += (targetY - y) * 0.16;
                    strength += (targetStrength - strength) * 0.1;
                    button.style.setProperty('--landing-light-x', `${x}%`);
                    button.style.setProperty('--landing-light-y', `${y}%`);
                    button.style.setProperty('--landing-light-strength', strength.toFixed(3));
                    if (Math.abs(targetX - x) > 0.2 || Math.abs(targetY - y) > 0.2 || Math.abs(targetStrength - strength) > 0.01) {
                        frame = requestAnimationFrame(tick);
                    } else {
                        frame = 0;
                    }
                };
                const start = () => {
                    if (!frame) frame = requestAnimationFrame(tick);
                };
                button.addEventListener('pointerenter', () => {
                    if (!restingPositionRead) {
                        const style = getComputedStyle(button);
                        restX = parseFloat(style.getPropertyValue('--landing-light-x')) || 72;
                        restY = parseFloat(style.getPropertyValue('--landing-light-y')) || 18;
                        x = targetX = restX;
                        y = targetY = restY;
                        restingPositionRead = true;
                    }
                    targetStrength = 1;
                    start();
                });
                button.addEventListener('pointerleave', () => {
                    targetStrength = 0;
                    targetX = restX;
                    targetY = restY;
                    start();
                });
                button.addEventListener('pointermove', event => {
                    const rect = button.getBoundingClientRect();
                    targetX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
                    targetY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
                    targetStrength = 1;
                    start();
                });
            });

            // Decode and reveal the landing video's opening frame without playing it.
            // A tiny seek is more reliable than currentTime 0 across mobile browsers.
            const landingVideo = document.getElementById('landing-video');
            const revealLandingFirstFrame = () => {
                if (!hasStartedExperience && landingVideo?.paused && landingVideo.readyState >= 2) {
                    landingVideo.currentTime = 0.01;
                }
            };
            if (landingVideo?.readyState >= 2) {
                revealLandingFirstFrame();
            } else {
                landingVideo?.addEventListener('loadeddata', revealLandingFirstFrame, { once: true });
            }

            // Initialize background with landing color
            setBackgroundColor(landing.bgColor || '#091A12');

            // Initialize Observer for single container
            initObserver();

            // Add scroll listener to the single container
            const mainContainer = document.getElementById('mainScrollContainer');
            if (mainContainer) {
                mainContainer.addEventListener('scroll', throttle(handleScroll, 100));
                initDesktopMouseWheel(mainContainer);
            }

            // Mark landing video frame as loaded when video is ready
            const landingFrame = document.querySelector('.landing-video-frame');
            if (landingVideo && landingFrame) {
                landingVideo.addEventListener('loadeddata', () => {
                    landingFrame.classList.add('loaded');
                });
                // Also check if already loaded (cached)
                if (landingVideo.readyState >= 2) {
                    landingFrame.classList.add('loaded');
                }
                // Attach seekbar updater for landing video
                landingVideo.addEventListener('timeupdate', () => {
                    const fill = document.getElementById('seekbar-landing-video');
                    if (fill && landingVideo.duration) {
                        const pct = (landingVideo.currentTime / landingVideo.duration) * 100;
                        fill.style.width = pct + '%';
                    }
                });
            }
        }

        // Throttling function to limit execution of scroll/resize handlers
        function throttle(func, limit) {
            let inThrottle;
            return function () {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            }
        }

        // Optimized scroll handler
        function handleScroll(e) {
            updateNavArrows();
        }

        // Update fixed navigation arrows based on current scroll position
        function updateNavArrows() {
            const container = document.getElementById('mainScrollContainer');
            const upArrow = document.getElementById('navArrowUp');
            const downArrow = document.getElementById('navArrowDown');

            if (!container || !upArrow || !downArrow) return;

            const sections = container.querySelectorAll('.landing-section, .video-section');
            const currentIndex = getClosestSectionIndex(container, sections);

            // Hide up arrow on first section (index 0)
            if (currentIndex === 0) {
                upArrow.classList.add('hidden');
            } else {
                upArrow.classList.remove('hidden');
            }

            // Hide down arrow on last section
            if (currentIndex >= totalSectionsCount - 1) {
                downArrow.classList.add('hidden');
            } else {
                downArrow.classList.remove('hidden');
            }
        }

        // Intersection Observer - for single continuous scroll page
        function initObserver() {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('active');

                        // Update background color based on the current section
                        // But skip updates if we are in the middle of a "warp" transition
                        const bgColor = entry.target.getAttribute('data-bg-color');
                        if (bgColor && !isWarping && entry.intersectionRatio >= 0.7) setBackgroundColor(bgColor);

                        // Update arrow positioning for landscape/portrait
                        const navArrows = document.getElementById('fixedNavArrows');
                        if (navArrows) {
                            const isLandscapeVideo = entry.target.classList.contains('landscape-mode');
                            document.body.classList.toggle('landscape-video-active', isLandscapeVideo);
                            if (isLandscapeVideo) {
                                navArrows.classList.add('landscape');
                            } else {
                                navArrows.classList.remove('landscape');
                            }
                        }

                        const isLanding = entry.target.classList.contains('landing-section');
                        const isVideo = entry.target.classList.contains('video-section');
                        const logoBtn = document.getElementById('logoBtn');
                        const navbarWrapper = document.getElementById('navbarWrapper');
                        if (navbarWrapper) {
                            navbarWrapper.classList.remove('hidden');
                        }

                        if (isLanding) {
                            if (controlBar) controlBar.classList.toggle('hidden', !hasStartedExperience);
                            if (logoBtn) logoBtn.classList.add('active');
                            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                            updateMobileNav('home');
                            if (!suppressObserverPlayback && !isWarping && hasStartedExperience) debouncedPlayVideo('landing-video');
                            if (getFullscreenElement() && !suppressObserverPlayback) fullscreenVideoId = 'landing-video';
                            if (!isWarping) updateLikeButtonForCurrentVideo('landing', false, true);
                        } else if (isVideo) {
                            if (controlBar) controlBar.classList.toggle('hidden', !hasStartedExperience);
                            if (logoBtn) logoBtn.classList.remove('active');

                            // Highlight tab based on current video's category
                            const category = entry.target.getAttribute('data-category');
                            document.querySelectorAll('.tab-btn').forEach(btn => {
                                const tabId = btn.getAttribute('data-tab-id');
                                btn.classList.toggle('active', tabId === category);
                            });
                            updateMobileNav(category);

                            const videoId = entry.target.getAttribute('data-video-id');
                            if (!suppressObserverPlayback && !isWarping && hasStartedExperience) debouncedPlayVideo(videoId);
                            if (getFullscreenElement() && !suppressObserverPlayback && videoId) fullscreenVideoId = videoId;
                            if (!isWarping) updateLikeButtonForCurrentVideo(videoId, false, true);
                        }
                    } else {
                        if (suppressObserverPlayback) return;
                        entry.target.classList.remove('active');
                        if (entry.target.classList.contains('video-section')) {
                            const videoId = entry.target.getAttribute('data-video-id');
                            pauseVideo(videoId);
                        }
                        if (entry.target.classList.contains('landing-section')) {
                            pauseVideo('landing-video');
                        }
                    }
                });
            }, { threshold: 0.7 });

            // Observe all section types (Grid is now an overlay, not observed)
            document.querySelectorAll('.landing-section, .video-section').forEach(section => {
                observer.observe(section);
            });

            // Lazy loading observer - preloads videos that are about to come into view
            const lazyLoadObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const section = entry.target;
                        const videoId = section.getAttribute('data-video-id');
                        if (videoId) {
                            lazyLoadVideo(videoId);
                        }
                        // Also preload the next video
                        const nextSection = section.nextElementSibling;
                        if (nextSection && nextSection.classList.contains('video-section')) {
                            const nextVideoId = nextSection.getAttribute('data-video-id');
                            if (nextVideoId) {
                                lazyLoadVideo(nextVideoId);
                            }
                        }
                    }
                });
            }, { rootMargin: '100% 0px 100% 0px', threshold: 0 }); // Preload 1 viewport ahead

            document.querySelectorAll('.video-section').forEach(section => {
                lazyLoadObserver.observe(section);
            });
        }

        // Lazy load video source
        function lazyLoadVideo(videoId) {
            const video = document.getElementById(videoId);
            if (!video) return;

            const poster = video.parentElement?.querySelector('[data-poster-src]');
            if (poster) {
                poster.src = poster.getAttribute('data-poster-src');
                poster.removeAttribute('data-poster-src');
            }

            // If video already has src, skip
            if (video.src && video.src !== window.location.href) return;

            const dataSrc = video.getAttribute('data-src');
            if (dataSrc && !video.src) {
                video.src = dataSrc;
                video.load();
            }
        }

        // --- Video Control Functions ---

        // Debounced play: cancels any pending play and schedules a new one.
        // This prevents audio bleed from intermediate sections during fast scrolling.
        function debouncedPlayVideo(videoId) {
            if (!hasStartedExperience) return;

            // Cancel any previous pending play
            clearTimeout(playVideoDebounceTimer);
            // Immediately mute AND pause ALL videos to kill any audio instantly
            document.querySelectorAll('.video-section video, .landing-section video').forEach(v => {
                v.muted = true;
                if (!v.paused) v.pause();
            });
            // Schedule play for the target video after scroll settles
            playVideoDebounceTimer = setTimeout(() => {
                playVideo(videoId);
            }, 150);
        }


        const BUFFERING_SHOW_DELAY = 280;

        function getVideoFrame(video) {
            return video?.closest('.video-frame, .landing-video-frame');
        }

        function hideBuffering(video) {
            if (!video) return;
            clearTimeout(video._bufferingTimer);
            video._bufferingTimer = null;
            video._bufferingWanted = false;
            getVideoFrame(video)?.classList.remove('is-buffering');
        }

        function isDefinitelyBuffering(video) {
            if (!video || !hasStartedExperience || video.paused || video.ended) return false;
            return video.readyState < 3 || video.seeking;
        }

        function showBufferingSoon(video) {
            if (!isDefinitelyBuffering(video)) {
                hideBuffering(video);
                return;
            }
            video._bufferingWanted = true;
            if (video._bufferingTimer) return;
            video._bufferingTimer = setTimeout(() => {
                video._bufferingTimer = null;
                if (!video._bufferingWanted || !isDefinitelyBuffering(video)) return;
                getVideoFrame(video)?.classList.add('is-buffering');
            }, BUFFERING_SHOW_DELAY);
        }

        function bindBufferingIndicator(video) {
            if (!video || video._bufferingBound) return;
            video._bufferingBound = true;

            video.addEventListener('waiting', () => showBufferingSoon(video));
            video.addEventListener('playing', () => hideBuffering(video));
            video.addEventListener('canplay', () => {
                if (video.readyState >= 3 && !video.seeking) hideBuffering(video);
            });
            video.addEventListener('seeked', () => {
                if (video.readyState >= 3) hideBuffering(video);
                else showBufferingSoon(video);
            });
            video.addEventListener('pause', () => hideBuffering(video));
            video.addEventListener('ended', () => hideBuffering(video));
            video.addEventListener('error', () => hideBuffering(video));
        }

        function initBufferingIndicators() {
            document.querySelectorAll('.video-section video, .landing-section video').forEach(bindBufferingIndicator);
        }

        function revealVideoOverPoster(video) {
            const frame = video.closest('.video-frame, .landing-video-frame');
            if (!frame || frame.classList.contains('has-decoded-frame')) return;

            let hidden = false;
            const hidePoster = () => {
                if (hidden || video.paused || video.readyState < 2) return;
                hidden = true;
                requestAnimationFrame(() => frame.classList.add('has-decoded-frame'));
                video.removeEventListener('playing', hidePoster);
                video.removeEventListener('timeupdate', hidePoster);
            };

            if (typeof video.requestVideoFrameCallback === 'function') {
                video.requestVideoFrameCallback(() => hidePoster());
            }
            video.addEventListener('playing', hidePoster);
            video.addEventListener('timeupdate', hidePoster);
        }

        function playVideo(videoId) {
            if (!hasStartedExperience) return;

            const video = document.getElementById(videoId);
            if (!video) return;

            // Lazy load video source if not loaded yet
            if (!video.src || video.src === window.location.href) {
                const dataSrc = video.getAttribute('data-src');
                if (dataSrc) {
                    video.src = dataSrc;
                    video.load();
                }
            }

            currentVideoId = videoId;
            isPlaying = true;

            // Update icons
            document.getElementById('pauseIcon').style.display = 'block';
            document.getElementById('playIcon').style.display = 'none';

            if (video.currentTime > 0.2) video.currentTime = 0;
            video.muted = isMuted;
            revealVideoOverPoster(video);
            bindBufferingIndicator(video);
            if (video.readyState < 3) showBufferingSoon(video);
            video.play().catch(e => {
                console.log('Autoplay blocked:', e);
                hideBuffering(video);
            });

            if (isMuted) showMuteIndicator(); else hideMuteIndicator();
            syncMutePulse();
            startWatchTimer(videoId);

            // Attach seekbar updater if not already attached
            if (!video._seekbarAttached) {
                video.addEventListener('timeupdate', () => {
                    const fill = document.getElementById('seekbar-' + videoId);
                    if (fill && video.duration) {
                        const pct = (video.currentTime / video.duration) * 100;
                        fill.style.width = pct + '%';
                    }
                });
                video._seekbarAttached = true;
            }

            syncPlayOverlay(videoId, true);
        }

        function syncPlayOverlay(videoId, playing) {
            const btn = document.getElementById('btn-' + videoId);
            if (!btn) return;
            btn.classList.toggle('playing', !!playing);
            btn.classList.toggle('paused', !playing);
        }

        function startExperienceWithSound(videoId) {
            if (hasStartedExperience) {
                toggleVideo(videoId);
                return;
            }

            clearTimeout(playVideoDebounceTimer);
            hasStartedExperience = true;
            isMuted = false;
            userManuallyMuted = false;
            document.body.classList.remove('experience-awaiting-start');

            document.querySelectorAll('.video-section video, .landing-section video').forEach(video => {
                video.pause();
                video.muted = true;
            });

            if (controlBar) controlBar.classList.remove('hidden');
            updateMuteUI();
            hideMuteIndicator();
            playVideo(videoId);
            syncMutePulse();
        }

        function pauseVideo(videoId) {
            const video = document.getElementById(videoId);
            if (!video) return;

            video.pause();
            cancelWatchTimer(videoId);
            syncMutePulse();
        }

        // --- Seekbar: click/drag to seek ---
        function seekVideo(event, videoId) {
            event.stopPropagation();
            const video = document.getElementById(videoId);
            const bar = event.currentTarget.closest('.video-seekbar');
            const track = bar ? bar.querySelector('.video-seekbar-track') : null;
            if (!video || !video.duration || !track) return;

            const rect = track.getBoundingClientRect();
            const x = (event.clientX || event.touches?.[0]?.clientX || 0) - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            video.currentTime = pct * video.duration;
        }

        // Unified drag-to-seek for mouse and touch
        (function initSeekbarDrag() {
            let activeBar = null;
            let activeVideo = null;
            let pendingSeekPct = null; // Throttled seek target
            let seekRAF = null;

            function startDrag(e) {
                const bar = e.target.closest('.video-seekbar');
                if (!bar) return;
                e.preventDefault();
                e.stopPropagation();

                const videoId = bar.getAttribute('data-for');
                const video = document.getElementById(videoId);
                if (!video || !video.duration) return;

                activeBar = bar;
                activeVideo = video;
                bar.classList.add('dragging');
                doSeek(e);
            }

            function doSeek(e) {
                if (!activeBar || !activeVideo) return;
                const track = activeBar.querySelector('.video-seekbar-track');
                if (!track) return;

                const rect = track.getBoundingClientRect();
                const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
                const x = clientX - rect.left;
                const pct = Math.max(0, Math.min(1, x / rect.width));

                // Immediately update fill for visual responsiveness
                const fill = activeBar.querySelector('.video-seekbar-fill');
                if (fill) fill.style.width = (pct * 100) + '%';

                // Throttle the expensive video.currentTime via rAF
                pendingSeekPct = pct;
                if (!seekRAF) {
                    seekRAF = requestAnimationFrame(() => {
                        if (activeVideo && pendingSeekPct !== null) {
                            activeVideo.currentTime = pendingSeekPct * activeVideo.duration;
                        }
                        seekRAF = null;
                    });
                }
            }

            function endDrag() {
                // Apply final seek immediately for accuracy
                if (activeVideo && pendingSeekPct !== null) {
                    activeVideo.currentTime = pendingSeekPct * activeVideo.duration;
                }
                if (seekRAF) {
                    cancelAnimationFrame(seekRAF);
                    seekRAF = null;
                }
                pendingSeekPct = null;
                if (activeBar) {
                    activeBar.classList.remove('dragging');
                }
                activeBar = null;
                activeVideo = null;
            }

            // Mouse events
            document.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', (e) => { if (activeBar) doSeek(e); });
            document.addEventListener('mouseup', endDrag);

            // Touch events
            document.addEventListener('touchstart', startDrag, { passive: false });
            document.addEventListener('touchmove', (e) => { if (activeBar) { e.preventDefault(); doSeek(e); } }, { passive: false });
            document.addEventListener('touchend', endDrag);
            document.addEventListener('touchcancel', endDrag);

            // Block click events on seekbars from bubbling up to the video-frame's
            // onclick="toggleVideo(...)" — otherwise clicking the seekbar pauses the video
            document.addEventListener('click', (e) => {
                if (e.target.closest('.video-seekbar')) {
                    e.stopPropagation();
                }
            }, true); // useCapture = true to intercept before the onclick fires
        })();

        function toggleVideo(videoId, fromVideoTap = true) {
            const video = document.getElementById(videoId);
            if (!video) return;

            // If muted (from autoplay policy, not user choice) and video is playing,
            // first tap on the VIDEO unmutes instead of pausing.
            // Once the user has manually muted, this no longer triggers.
            if (fromVideoTap && isMuted && !userManuallyMuted && !video.paused) {
                unmuteAndDismissHint();
                return;
            }

            if (video.paused) {
                video.play();
                syncPlayOverlay(videoId, true);
                userPaused[videoId] = false;
                isPlaying = true;
                document.getElementById('pauseIcon').style.display = 'block';
                document.getElementById('playIcon').style.display = 'none';
            } else {
                video.pause();
                syncPlayOverlay(videoId, false);
                userPaused[videoId] = true;
                isPlaying = false;
                document.getElementById('pauseIcon').style.display = 'none';
                document.getElementById('playIcon').style.display = 'block';
            }
            syncMutePulse();
        }

        function togglePlayStop() {
            if (!currentVideoId) return;
            toggleVideo(currentVideoId, false); // false = from control bar, not a video tap
        }

        function getActiveVideoForFullscreen() {
            const visibleId = getCurrentVideoId();
            return document.getElementById(visibleId === 'landing' ? 'landing-video' : visibleId);
        }

        let fullscreenVideoId = null;

        function alignSectionForVideo(videoId) {
            if (!videoId) return;

            const container = document.getElementById('mainScrollContainer');
            const section = videoId === 'landing-video'
                ? document.getElementById('section-landing')
                : document.querySelector(`.video-section[data-video-id="${CSS.escape(videoId)}"]`);
            if (!container || !section) return;

            clearTimeout(playVideoDebounceTimer);
            requestAnimationFrame(() => {
                const previousBehavior = container.style.scrollBehavior;
                const previousSnapType = container.style.scrollSnapType;
                container.style.scrollBehavior = 'auto';
                container.style.scrollSnapType = 'none';
                const containerRect = container.getBoundingClientRect();
                const sectionRect = section.getBoundingClientRect();
                container.scrollTop += sectionRect.top + sectionRect.height / 2
                    - (containerRect.top + container.clientTop + container.clientHeight / 2);

                requestAnimationFrame(() => {
                    container.style.scrollBehavior = previousBehavior;
                    container.style.scrollSnapType = previousSnapType;
                    startPlaybackForFullscreen(videoId);
                    updateNavArrows();
                });
            });
        }

        function startPlaybackForFullscreen(videoId = null) {
            const video = videoId
                ? document.getElementById(videoId)
                : getActiveVideoForFullscreen();
            if (!video) return;

            if (!hasStartedExperience) {
                startExperienceWithSound(video.id);
                return;
            }

            currentVideoId = video.id;
            isPlaying = true;
            userPaused[video.id] = false;
            video.muted = isMuted;
            syncPlayOverlay(video.id, true);
            bindBufferingIndicator(video);
            if (video.readyState < 3) showBufferingSoon(video);
            video.play().then(() => {
                syncPlayOverlay(video.id, !video.paused);
                if (video.readyState >= 3 && !video.seeking) hideBuffering(video);
            }).catch(error => {
                console.log('Fullscreen playback blocked:', error);
                syncPlayOverlay(video.id, false);
                hideBuffering(video);
            });

            const pauseIcon = document.getElementById('pauseIcon');
            const playIcon = document.getElementById('playIcon');
            if (pauseIcon) pauseIcon.style.display = 'block';
            if (playIcon) playIcon.style.display = 'none';
        }

        function releaseObserverPlaybackSoon() {
            setTimeout(() => {
                suppressObserverPlayback = false;
            }, 400);
        }

        function getFullscreenElement() {
            return document.fullscreenElement || document.webkitFullscreenElement || null;
        }

        function getPageFullscreenRequest() {
            return document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        }

        function getPageFullscreenExit() {
            return document.exitFullscreen || document.webkitExitFullscreen;
        }

        async function toggleDesktopFullscreen() {
            const activeVideo = getActiveVideoForFullscreen();
            if (!activeVideo) return;

            clearTimeout(playVideoDebounceTimer);
            try {
                if (getFullscreenElement()) {
                    suppressObserverPlayback = true;
                    const exitFullscreen = getPageFullscreenExit();
                    if (exitFullscreen) await exitFullscreen.call(document);
                } else {
                    suppressObserverPlayback = true;
                    fullscreenVideoId = activeVideo.id;
                    startPlaybackForFullscreen(fullscreenVideoId);

                    const requestFullscreen = getPageFullscreenRequest();
                    if (requestFullscreen) {
                        document.body.classList.add('desktop-fullscreen-mode');
                        await requestFullscreen.call(document.documentElement);
                    } else if (typeof activeVideo.webkitEnterFullscreen === 'function') {
                        // Older iPhones support native video fullscreen but not page fullscreen.
                        activeVideo.webkitEnterFullscreen();
                        suppressObserverPlayback = false;
                    } else {
                        fullscreenVideoId = null;
                        suppressObserverPlayback = false;
                    }
                }
            } catch (error) {
                document.body.classList.remove('desktop-fullscreen-mode');
                fullscreenVideoId = null;
                suppressObserverPlayback = false;
                console.warn('Fullscreen mode could not be changed:', error);
            }
        }

        function syncDesktopFullscreenMode() {
            const isFullscreen = getFullscreenElement() === document.documentElement;
            document.body.classList.toggle('desktop-fullscreen-mode', isFullscreen);
            suppressObserverPlayback = true;

            const button = document.getElementById('fullscreenBtn');
            if (button) {
                button.setAttribute('aria-label', isFullscreen
                    ? 'Exit fullscreen video mode'
                    : 'Enter fullscreen video mode');
                button.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen video';
            }

            const videoId = fullscreenVideoId;
            if (isFullscreen) {
                startPlaybackForFullscreen(videoId);
                alignSectionForVideo(videoId);
                releaseObserverPlaybackSoon();
            } else {
                alignSectionForVideo(videoId);
                const video = document.getElementById(videoId);
                if (video) syncPlayOverlay(video.id, !video.paused);
                fullscreenVideoId = null;
                releaseObserverPlaybackSoon();
            }
        }

        document.addEventListener('fullscreenchange', syncDesktopFullscreenMode);
        document.addEventListener('webkitfullscreenchange', syncDesktopFullscreenMode);

        const supportsPageFullscreen = !!getPageFullscreenRequest();
        const supportsNativeVideoFullscreen = Array.from(document.querySelectorAll('video'))
            .some(video => typeof video.webkitEnterFullscreen === 'function');
        if (!supportsPageFullscreen && !supportsNativeVideoFullscreen) {
            document.getElementById('fullscreenBtn')?.classList.add('hidden');
        }

        const FULLSCREEN_CURSOR_IDLE_DELAY = 2000;
        let fullscreenCursorTimer = null;

        function showFullscreenCursor() {
            clearTimeout(fullscreenCursorTimer);
            fullscreenCursorTimer = null;
            document.body.classList.remove('fullscreen-cursor-hidden');
        }

        function scheduleFullscreenCursorHide() {
            showFullscreenCursor();
            if (getFullscreenElement() !== document.documentElement || document.hidden) return;

            fullscreenCursorTimer = setTimeout(() => {
                fullscreenCursorTimer = null;
                if (getFullscreenElement() === document.documentElement && !document.hidden) {
                    document.body.classList.add('fullscreen-cursor-hidden');
                }
            }, FULLSCREEN_CURSOR_IDLE_DELAY);
        }

        ['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach(eventName => {
            document.addEventListener(eventName, scheduleFullscreenCursorHide, { passive: true, capture: true });
        });
        document.addEventListener('fullscreenchange', scheduleFullscreenCursorHide);
        document.addEventListener('visibilitychange', scheduleFullscreenCursorHide);
        window.addEventListener('blur', showFullscreenCursor);
        window.addEventListener('focus', scheduleFullscreenCursorHide);

        const IMMERSIVE_IDLE_DELAY = 2500;
        const IMMERSIVE_FADE_DURATION = 1600;
        let immersiveIdleTimer = null;
        let immersiveLayerTimer = null;
        let lastImmersivePointerX = null;
        let lastImmersivePointerY = null;

        function canEnterDesktopImmersiveMode() {
            if (window.innerWidth <= 600 || document.hidden || getFullscreenElement()) return false;
            if (isWarping || isScrolling) return false;
            if (document.querySelector('.grid-overlay.visible')) return false;

            const video = getActiveVideoForFullscreen();
            return !!video && !video.paused && !video.ended;
        }

        function leaveDesktopImmersiveMode() {
            document.body.classList.remove('desktop-immersive-mode');
            if (!document.body.classList.contains('desktop-immersive-layer-active')) return;

            clearTimeout(immersiveLayerTimer);
            immersiveLayerTimer = setTimeout(() => {
                immersiveLayerTimer = null;
                if (!document.body.classList.contains('desktop-immersive-mode')) {
                    document.body.classList.remove('desktop-immersive-layer-active');
                }
            }, IMMERSIVE_FADE_DURATION);
        }

        function cancelDesktopImmersiveMode() {
            clearTimeout(immersiveIdleTimer);
            immersiveIdleTimer = null;
            leaveDesktopImmersiveMode();
        }

        function scheduleDesktopImmersiveMode() {
            clearTimeout(immersiveIdleTimer);
            immersiveIdleTimer = null;
            leaveDesktopImmersiveMode();

            if (!canEnterDesktopImmersiveMode()) return;
            immersiveIdleTimer = setTimeout(() => {
                immersiveIdleTimer = null;
                if (canEnterDesktopImmersiveMode()) {
                    clearTimeout(immersiveLayerTimer);
                    immersiveLayerTimer = null;
                    document.body.classList.add('desktop-immersive-layer-active');
                    document.body.classList.add('desktop-immersive-mode');
                }
            }, IMMERSIVE_IDLE_DELAY);
        }

        function noteDesktopInteraction() {
            scheduleDesktopImmersiveMode();
        }

        document.addEventListener('play', scheduleDesktopImmersiveMode, true);
        document.addEventListener('playing', scheduleDesktopImmersiveMode, true);
        document.addEventListener('pause', cancelDesktopImmersiveMode, true);
        document.addEventListener('ended', cancelDesktopImmersiveMode, true);
        document.addEventListener('pointerdown', noteDesktopInteraction, true);
        document.addEventListener('wheel', noteDesktopInteraction, { passive: true, capture: true });
        document.addEventListener('scroll', noteDesktopInteraction, { passive: true, capture: true });
        document.addEventListener('keydown', noteDesktopInteraction, true);
        document.addEventListener('pointermove', event => {
            if (lastImmersivePointerX === null ||
                Math.abs(event.clientX - lastImmersivePointerX) > 4 ||
                Math.abs(event.clientY - lastImmersivePointerY) > 4) {
                lastImmersivePointerX = event.clientX;
                lastImmersivePointerY = event.clientY;
                noteDesktopInteraction();
            }
        }, { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) cancelDesktopImmersiveMode();
            else scheduleDesktopImmersiveMode();
        });
        document.addEventListener('fullscreenchange', () => {
            if (getFullscreenElement()) cancelDesktopImmersiveMode();
            else scheduleDesktopImmersiveMode();
        });
        window.addEventListener('resize', noteDesktopInteraction, { passive: true });
        window.addEventListener('blur', cancelDesktopImmersiveMode);

        const MOBILE_CONTROLS_IDLE_DELAY = 2600;
        let mobileControlsTimer = null;
        let firstReelNudgeTimer = null;
        let firstReelNudgeTimeline = null;
        let firstReelNudgeStyles = null;

        function restoreFirstReelNudgeStyles(container) {
            if (!container || !firstReelNudgeStyles) return;
            container.style.scrollSnapType = firstReelNudgeStyles.scrollSnapType;
            container.style.scrollBehavior = firstReelNudgeStyles.scrollBehavior;
            firstReelNudgeStyles = null;
        }

        function cancelFirstReelNudge() {
            if (!firstReelNudgeTimer && !firstReelNudgeTimeline) return;

            clearTimeout(firstReelNudgeTimer);
            firstReelNudgeTimer = null;

            const container = document.getElementById('mainScrollContainer');
            if (firstReelNudgeTimeline) {
                firstReelNudgeTimeline.kill();
                firstReelNudgeTimeline = null;
            }
            if (container) container.scrollTop = 0;
            restoreFirstReelNudgeStyles(container);
        }

        function runFirstReelNudge() {
            firstReelNudgeTimer = null;
            const container = document.getElementById('mainScrollContainer');
            const landingVideo = document.getElementById('landing-video');
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            if (!container || !landingVideo || window.innerWidth > 600 || reduceMotion ||
                landingVideo.paused || landingVideo.ended || container.scrollTop > 2 ||
                document.body.classList.contains('mobile-controls-visible')) {
                return;
            }

            firstReelNudgeStyles = {
                scrollSnapType: container.style.scrollSnapType,
                scrollBehavior: container.style.scrollBehavior
            };
            container.style.scrollSnapType = 'none';
            container.style.scrollBehavior = 'auto';

            firstReelNudgeTimeline = gsap.timeline({
                repeat: 1,
                repeatDelay: 0.22,
                onComplete: () => {
                    firstReelNudgeTimeline = null;
                    container.scrollTop = 0;
                    restoreFirstReelNudgeStyles(container);
                }
            });
            firstReelNudgeTimeline
                .to(container, {
                    scrollTop: 30,
                    duration: 0.62,
                    ease: 'power2.out'
                })
                .to(container, {
                    scrollTop: 5,
                    duration: 0.48,
                    ease: 'power2.inOut'
                })
                .to(container, {
                    scrollTop: 12,
                    duration: 0.28,
                    ease: 'power1.out'
                })
                .to(container, {
                    scrollTop: 0,
                    duration: 0.42,
                    ease: 'power2.out'
                });
        }

        function initMobileFirstReelNudge() {
            const landingVideo = document.getElementById('landing-video');
            if (!landingVideo) return;

            let previousTime = landingVideo.currentTime || 0;
            landingVideo.addEventListener('timeupdate', () => {
                const duration = landingVideo.duration;
                const currentTime = landingVideo.currentTime;
                const looped = Number.isFinite(duration) && duration > 2 &&
                    previousTime > duration * 0.8 &&
                    currentTime < duration * 0.2;
                previousTime = currentTime;

                if (!looped || window.innerWidth > 600) return;
                clearTimeout(firstReelNudgeTimer);
                firstReelNudgeTimer = setTimeout(runFirstReelNudge, 650);
            });

            ['pointerdown', 'wheel', 'keydown'].forEach(eventName => {
                document.addEventListener(eventName, cancelFirstReelNudge, {
                    passive: true,
                    capture: true
                });
            });
        }

        function hideMobilePlaybackControls() {
            clearTimeout(mobileControlsTimer);
            mobileControlsTimer = null;
            document.body.classList.remove('mobile-controls-visible');
        }

        let mobileNavigationControlsTarget = null;

        function showMobilePlaybackControls() {
            if (window.innerWidth > 600) return;

            const video = getActiveVideoForFullscreen();
            if (!video || video.paused || video.ended) return;

            document.body.classList.add('mobile-controls-visible');
            clearTimeout(mobileControlsTimer);
            mobileControlsTimer = setTimeout(
                hideMobilePlaybackControls,
                MOBILE_CONTROLS_IDLE_DELAY
            );
        }

        function syncMobileImmersiveMode() {
            if (window.innerWidth > 600) {
                document.body.classList.remove('mobile-immersive-mode');
                hideMobilePlaybackControls();
                return;
            }

            const video = getActiveVideoForFullscreen();
            const isActivelyPlaying = !!video && !video.paused && !video.ended;
            document.body.classList.toggle('mobile-immersive-mode', isActivelyPlaying);
            if (mobileNavigationControlsTarget && video?.id === mobileNavigationControlsTarget && isActivelyPlaying) {
                mobileNavigationControlsTarget = null;
                showMobilePlaybackControls();
            } else if (!isActivelyPlaying && !mobileNavigationControlsTarget) hideMobilePlaybackControls();
        }

        const scheduleMobileImmersiveSync = () => requestAnimationFrame(syncMobileImmersiveMode);
        document.addEventListener('play', scheduleMobileImmersiveSync, true);
        document.addEventListener('playing', scheduleMobileImmersiveSync, true);
        document.addEventListener('pause', scheduleMobileImmersiveSync, true);
        document.addEventListener('ended', scheduleMobileImmersiveSync, true);
        document.addEventListener('scroll', scheduleMobileImmersiveSync, { passive: true, capture: true });
        window.addEventListener('resize', scheduleMobileImmersiveSync, { passive: true });
        syncMobileImmersiveMode();

        function toggleSound() {
            isMuted = !isMuted;
            userManuallyMuted = isMuted;
            updateMuteUI();

            if (currentVideoId) {
                const video = document.getElementById(currentVideoId);
                if (video) video.muted = isMuted;
            }

            if (!isMuted) {
                hideMuteIndicator();
            } else {
                showMuteIndicator();
            }
            syncMutePulse();
        }

        // Global unmute helper — used by tap-to-unmute, sound button, and volume keys
        function unmuteAndDismissHint() {
            if (!isMuted) return;
            isMuted = false;
            updateMuteUI();
            if (currentVideoId) {
                const video = document.getElementById(currentVideoId);
                if (video) video.muted = false;
            }
            hideMuteIndicator();
            syncMutePulse();
        }

        function isCurrentVideoPlaying() {
            if (!hasStartedExperience) return false;
            const video = document.getElementById(currentVideoId);
            return !!(video && !video.paused && !video.ended);
        }

        function syncMutePulse() {
            const soundBtn = document.getElementById('soundBtn');
            if (!soundBtn) return;
            soundBtn.classList.toggle('pulsing', isMuted && isCurrentVideoPlaying());
        }

        function stopUnmutePulse() {
            const soundBtn = document.getElementById('soundBtn');
            if (soundBtn) soundBtn.classList.remove('pulsing');
            hideMuteIndicator();
        }

        function initSoundHint() {
            setTimeout(() => {
                if (isMuted && isCurrentVideoPlaying()) {
                    const soundBtn = document.getElementById('soundBtn');
                    if (soundBtn) soundBtn.classList.add('pulsing');
                    showMuteIndicator();
                } else {
                    syncMutePulse();
                }
            }, 1500);
        }

        function showMuteIndicator() {
            document.querySelectorAll('.mute-indicator').forEach(el => el.classList.remove('visible'));
            if (currentVideoId) {
                const hint = document.querySelector(`.mute-indicator[data-mute-hint="${currentVideoId}"]`) ||
                             document.getElementById('muteHint');
                if (hint) hint.classList.add('visible');
            }
        }

        function hideMuteIndicator() {
            document.querySelectorAll('.mute-indicator').forEach(el => el.classList.remove('visible'));
        }

        function updateMuteUI() {
            const mutedIcon = document.getElementById('mutedIcon');
            const unmutedIcon = document.getElementById('unmutedIcon');
            const btnText = document.getElementById('soundBtnText');
            const soundBtn = document.getElementById('soundBtn');

            if (isMuted) {
                mutedIcon.style.display = 'block';
                unmutedIcon.style.display = 'none';
                btnText.textContent = 'Unmute';
                if (soundBtn) {
                    soundBtn.setAttribute('aria-label', 'Unmute video');
                    soundBtn.title = 'Unmute';
                }
            } else {
                mutedIcon.style.display = 'none';
                unmutedIcon.style.display = 'block';
                btnText.textContent = 'Mute';
                if (soundBtn) {
                    soundBtn.setAttribute('aria-label', 'Mute video');
                    soundBtn.title = 'Mute';
                }
            }
            syncMutePulse();
        }

        // --- Volume key detection: auto-unmute on volume up/down ---
        document.addEventListener('keydown', (e) => {
            if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' ||
                e.key === 'VolumeUp' || e.key === 'VolumeDown') {
                if (isMuted) {
                    unmuteAndDismissHint();
                }
            }
        });

        // --- Like Button Functions ---
        // --- Like Button Functions (Per-Video with Cloudflare Worker) ---

        // IMPORTANT: Replace this with your Cloudflare Worker URL after deployment
        const LIKES_WORKER_URL = 'https://reelsfolio-likes.vibhoresinghal.workers.dev'; // e.g., 'https://reelsfolio-likes.YOUR-SUBDOMAIN.workers.dev'

        let likesCache = {}; // Cache of video likes { videoId: count }
        let pendingLikes = {}; // Pending likes to sync { videoId: count }
        let likeDebounceTimer = null;
        let likesFullyLoaded = false;

        function getCurrentVideoId() {
            const container = document.getElementById('mainScrollContainer');
            if (!container) return 'landing';

            const sections = container.querySelectorAll('.landing-section, .video-section');
            if (!sections.length) return 'landing';

            // Use the section physically closest to the viewport center. This
            // remains accurate when frame sizing, browser chrome, or fullscreen
            // changes make scrollTop / viewport-height calculations drift.
            const containerRect = container.getBoundingClientRect();
            const viewportCenter = containerRect.top + container.clientHeight / 2;
            let closestSection = sections[0];
            let closestDistance = Infinity;

            sections.forEach(section => {
                const rect = section.getBoundingClientRect();
                const sectionCenter = rect.top + rect.height / 2;
                const distance = Math.abs(sectionCenter - viewportCenter);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSection = section;
                }
            });

            return closestSection.getAttribute('data-video-id') ||
                closestSection.id ||
                'landing';
        }

        function toggleLike() {
            const likeBtn = document.getElementById('likeBtn');
            const likeCount = document.getElementById('likeCount');
            const videoId = getCurrentVideoId();

            const userLikes = JSON.parse(localStorage.getItem('userLikedVideos') || '{}');
            const isCurrentlyLiked = !!userLikes[videoId];

            if (isCurrentlyLiked) {
                // === UNLIKE ===
                likeBtn.classList.remove('liked');
                delete userLikes[videoId];

                const currentCount = parseInt(likeCount.textContent) || 0;
                const newCount = Math.max(0, currentCount - 1);
                likeCount.textContent = newCount;

                // Collapse if count reaches 0
                if (newCount === 0) {
                    likeBtn.classList.remove('has-likes');
                    gsap.to(likeCount, { opacity: 0, duration: 0.15, ease: 'power2.in' });
                    gsap.to(likeBtn, {
                        height: 48, duration: 0.3, delay: 0.05, ease: 'power2.out',
                        onComplete: () => { likeCount.textContent = ''; }
                    });
                }

                // Subtle unlike animation
                gsap.fromTo(likeBtn, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' });

                // Update cache & sync
                likesCache[videoId] = newCount;
                pendingLikes[videoId] = (pendingLikes[videoId] || 0) - 1;
            } else {
                // === LIKE ===
                likeBtn.classList.add('liked');
                userLikes[videoId] = true;

                const currentCount = parseInt(likeCount.textContent) || 0;
                const newCount = currentCount + 1;
                likeCount.textContent = newCount;

                // Expand if this is the first like shown
                if (currentCount === 0) {
                    likeBtn.classList.add('has-likes');
                    gsap.to(likeBtn, { height: 68, duration: 0.3, ease: 'power2.out' });
                    gsap.to(likeCount, { opacity: 1, duration: 0.2, delay: 0.1, ease: 'power2.out' });
                }

                // Pulse animation
                likeBtn.classList.remove('pulse');
                void likeBtn.offsetWidth;
                likeBtn.classList.add('pulse');

                // Flying heart + burst
                createFlyingHeart(likeBtn);
                createLikeBurst(likeBtn);

                // Haptic feedback for mobile
                if ('vibrate' in navigator) {
                    try { navigator.vibrate(30); } catch (e) { }
                }

                // Update cache & sync
                likesCache[videoId] = newCount;
                pendingLikes[videoId] = (pendingLikes[videoId] || 0) + 1;
            }

            // Defer persistence off the critical path (INP optimisation).
            // localStorage is synchronous I/O — moving it after paint keeps
            // the interaction response fast.
            const likedState = !isCurrentlyLiked;
            const cachedCount = likesCache[videoId];
            requestAnimationFrame(() => {
                setTimeout(() => {
                    localStorage.setItem('userLikedVideos', JSON.stringify(userLikes));
                    const localLikes = JSON.parse(localStorage.getItem('videoLikes') || '{}');
                    localLikes[videoId] = cachedCount;
                    localStorage.setItem('videoLikes', JSON.stringify(localLikes));
                    trackEvent('like_toggle', { videoId, liked: likedState });
                }, 0);
            });

            clearTimeout(likeDebounceTimer);
            likeDebounceTimer = setTimeout(() => {
                savePendingLikes();
            }, 500);
        }

        async function savePendingLikes() {
            if (!LIKES_WORKER_URL) return; // Worker not configured

            const likesToSave = { ...pendingLikes };
            pendingLikes = {};

            for (const [videoId, increment] of Object.entries(likesToSave)) {
                try {
                    await fetch(`${LIKES_WORKER_URL}/likes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ videoId, increment })
                    });
                } catch (error) {
                    console.warn('Failed to save like:', error);
                    // Re-add to pending on failure
                    pendingLikes[videoId] = (pendingLikes[videoId] || 0) + increment;
                }
            }
        }

        async function loadLikesFromServer() {
            if (!LIKES_WORKER_URL) return null;

            try {
                const response = await fetch(`${LIKES_WORKER_URL}/likes/all`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.warn('Failed to load likes from server:', error);
            }
            return null;
        }

        function createFlyingHeart(button) {
            const rect = button.getBoundingClientRect();
            const svgIcon = button.querySelector('svg');
            const iconRect = svgIcon ? svgIcon.getBoundingClientRect() : rect;

            const centerX = iconRect.left + iconRect.width / 2;
            const centerY = iconRect.top + iconRect.height / 2;

            const flyingHeart = document.createElement('div');
            flyingHeart.className = 'flying-heart';
            flyingHeart.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; fill: url(#heartGradient); stroke: url(#strokeGradient); stroke-width: 3; paint-order: fill stroke; clip-path: url(#heartClip);">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>`;

            Object.assign(flyingHeart.style, {
                left: `${centerX}px`,
                top: `${centerY}px`,
                width: '28px',
                height: '28px',
                opacity: '0'
            });

            document.body.appendChild(flyingHeart);

            // GSAP settings for an organic, curved float away
            const xDrift = (Math.random() - 0.5) * 60;
            const yDrift = - (80 + Math.random() * 50);
            const rot = (Math.random() - 0.5) * 45;

            const tl = gsap.timeline({
                onComplete: () => {
                    if (flyingHeart.parentNode) flyingHeart.remove();
                }
            });

            tl.fromTo(flyingHeart,
                { opacity: 0.8, scale: 0.5, x: 0, y: 0, rotation: 0 },
                { opacity: 1, scale: 1.2, x: xDrift * 0.3, y: yDrift * 0.3, rotation: rot * 0.5, duration: 0.3, ease: "back.out(1.5)" }
            ).to(flyingHeart, {
                opacity: 0,
                scale: 0.8,
                x: xDrift,
                y: yDrift,
                rotation: rot,
                duration: 0.7,
                ease: "power2.out"
            });
        }

        function createLikeBurst(button) {
            const svgIcon = button.querySelector('svg');
            const iconRect = svgIcon ? svgIcon.getBoundingClientRect() : button.getBoundingClientRect();

            const centerX = iconRect.left + iconRect.width / 2;
            const centerY = iconRect.top + iconRect.height / 2;

            const particleCount = 6 + Math.floor(Math.random() * 4); // 6 to 9 particles

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'like-burst-particle';

                // Playful, vibrant colors matching the premium aesthetic
                const colors = ['#ff3b3b', '#e80b91', '#ffffff', '#ff007f', '#ff7eb3'];
                const color = colors[Math.floor(Math.random() * colors.length)];

                const size = 4 + Math.random() * 6; // 4px to 10px

                Object.assign(particle.style, {
                    left: `${centerX - size / 2}px`,
                    top: `${centerY - size / 2}px`,
                    width: `${size}px`,
                    height: `${size}px`,
                    background: color,
                    opacity: '1'
                });

                document.body.appendChild(particle);

                // calculate burst trajectory in full 360 circle
                const angle = (i / particleCount) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
                const distance = 25 + Math.random() * 35;

                gsap.to(particle, {
                    x: Math.cos(angle) * distance,
                    y: Math.sin(angle) * distance,
                    opacity: 0,
                    scale: Math.random() * 0.5 + 0.3,
                    duration: 0.4 + Math.random() * 0.3,
                    ease: "power2.out",
                    onComplete: () => {
                        if (particle.parentNode) particle.remove();
                    }
                });
            }

            // Tiny satisfying structural wobble/shake on the actual button element
            // We use fromTo to ensure it always starts the rotation crisp
            gsap.fromTo(button,
                { rotation: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 4) }, // random slight rotation between 4 and 8 deg
                { rotation: 0, duration: 0.6, ease: "elastic.out(1.2, 0.4)", clearProps: "rotation" }
            );
        }

        function updateLikeButtonVisuals(count, skipAnimation) {
            const likeBtn = document.getElementById('likeBtn');
            const likeCount = document.getElementById('likeCount');
            if (!likeBtn || !likeCount) return;

            // Animate like button based on count
            const hasLikes = count > 0;
            const currentHeight = likeBtn.offsetHeight;
            const targetHeight = hasLikes ? 68 : 48;
            const isAlreadyExpanded = likeBtn.classList.contains('has-likes');

            if (hasLikes) {
                likeCount.textContent = count;
                likeBtn.classList.add('has-likes');

                if (skipAnimation || (isAlreadyExpanded && Math.abs(currentHeight - targetHeight) < 2)) {
                    gsap.set(likeBtn, { height: targetHeight });
                    gsap.set(likeCount, { opacity: 1 });
                } else {
                    gsap.to(likeBtn, { height: targetHeight, duration: 0.3, ease: 'power2.out' });
                    gsap.to(likeCount, { opacity: 1, duration: 0.2, delay: 0.1, ease: 'power2.out' });
                }
            } else {
                likeBtn.classList.remove('has-likes');
                if (skipAnimation || (!isAlreadyExpanded && Math.abs(currentHeight - targetHeight) < 2)) {
                    gsap.set(likeBtn, { height: targetHeight });
                    gsap.set(likeCount, { opacity: 0 });
                    likeCount.textContent = '';
                } else {
                    gsap.to(likeCount, { opacity: 0, duration: 0.15, ease: 'power2.in' });
                    gsap.to(likeBtn, { height: targetHeight, duration: 0.3, delay: 0.05, ease: 'power2.out', onComplete: () => { likeCount.textContent = ''; } });
                }
            }
        }

        async function updateLikeButtonForCurrentVideo(videoIdOverride, skipAnimation = false, forceRender = false) {
            const likeBtn = document.getElementById('likeBtn');
            const videoId = videoIdOverride || getCurrentVideoId();

            if (!likeBtn) return;

            // Check if USER has liked this video (stored locally)
            const userLikes = JSON.parse(localStorage.getItem('userLikedVideos') || '{}');
            if (userLikes[videoId]) {
                likeBtn.classList.add('liked');
            } else {
                likeBtn.classList.remove('liked');
            }

            // Get count from cache first
            let count = likesCache[videoId];

            // If not in cache, try localStorage then fetch from server (NON-BLOCKING)
            if (count === undefined) {
                // Check localStorage first for instant display
                const localLikes = JSON.parse(localStorage.getItem('videoLikes') || '{}');
                count = localLikes[videoId] || 0;

                // Cache immediately so we render
                likesCache[videoId] = count;

                // Background Fetch
                if (LIKES_WORKER_URL && !likesFullyLoaded) {
                    fetch(`${LIKES_WORKER_URL}/likes?videoId=${encodeURIComponent(videoId)}`)
                        .then(r => r.json())
                        .then(data => {
                            const newCount = Math.max(data.count || 0, count);

                            // If server has more, update cache and visuals
                            if (newCount !== likesCache[videoId]) {
                                likesCache[videoId] = newCount;
                                // Only update visually if the user is still on this video OR if we grabbed lock
                                if (forceRender || getCurrentVideoId() === videoId) {
                                    updateLikeButtonVisuals(newCount, false);
                                }
                            }
                        })
                        .catch(e => console.warn('Failed to fetch likes:', e));
                }
            }

            // Render visuals immediately with whatever data we have
            if (forceRender || getCurrentVideoId() === videoId) {
                updateLikeButtonVisuals(count, skipAnimation);
            }
        }

        async function initLikeButton() {
            const likeBtn = document.getElementById('likeBtn');
            const likeCount = document.getElementById('likeCount');

            if (!likeBtn || !likeCount) return;

            // Try to load from server first
            const serverLikes = await loadLikesFromServer();
            if (serverLikes) {
                likesFullyLoaded = true;
                likesCache = serverLikes;
                // Merge with localStorage (keep higher counts)
                const localLikes = JSON.parse(localStorage.getItem('videoLikes') || '{}');
                for (const [videoId, count] of Object.entries(localLikes)) {
                    if (!likesCache[videoId] || localLikes[videoId] > likesCache[videoId]) {
                        likesCache[videoId] = count;
                    }
                }
            } else {
                // Fallback to localStorage
                likesCache = JSON.parse(localStorage.getItem('videoLikes') || '{}');
            }

            // Update display for current video
            updateLikeButtonForCurrentVideo(undefined, true);

            // Note: Like button updates are now handled by the IntersectionObserver in initObserver
            // for more reliable section tracking during scroll snap.
        }

        // Close overlay on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeGridOverlay();
            }
        });

        // Scroll to first video from landing section
        function scrollToFirstVideo() {
            scrollToCategory('zeta');
        }

        // --- Navigation Functions (Simplified for single-page scroll) ---

        // Handle tab button clicks - switch grid panel if in grid mode, otherwise scroll
        function handleTabClick(categoryId) {
            // Update visual state immediately so the browser can paint the active
            // indicator before any heavy scroll / DOM work runs (INP optimisation).
            updateMobileNav(categoryId);
            document.querySelectorAll('.tab-btn').forEach(btn => {
                const tabId = btn.getAttribute('data-tab-id');
                btn.classList.toggle('active', tabId === categoryId);
            });

            const navbarWrapper = document.getElementById('navbarWrapper');
            const isGridMode = navbarWrapper && navbarWrapper.classList.contains('grid-mode');

            // Defer expensive scroll / grid switch + analytics to after next paint
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (isGridMode) {
                        switchGridTab(categoryId);
                    } else {
                        scrollToCategory(categoryId);
                    }
                    trackEvent('tab_visit', { category: categoryId, via: isGridMode ? 'grid' : 'scroll' });
                }, 0);
            });
        }

        // Navigate to the landing/profile section
        function goToLanding() {
            // Paint the active nav state immediately (INP optimisation)
            updateMobileNav('home');
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

            closeGridOverlay();
            const container = document.getElementById('mainScrollContainer');
            if (container) {
                const landingVideo = document.getElementById('landing-video');
                if (landingVideo && hasStartedExperience) {
                    landingVideo.currentTime = 0;
                    landingVideo.muted = isMuted;
                    landingVideo.play().catch(() => { });
                    currentVideoId = 'landing-video';
                    isPlaying = true;
                    userPaused['landing-video'] = false;

                    syncPlayOverlay('landing-video', true);

                    document.getElementById('pauseIcon').style.display = 'block';
                    document.getElementById('playIcon').style.display = 'none';
                }

                const landingSection = container.querySelector('.landing-section');
                const targetColor = landingSection ? landingSection.getAttribute('data-bg-color') : null;

                // Defer heavy scroll to after the next paint frame
                requestAnimationFrame(() => {
                    smartScrollTo(0, container, targetColor);
                    updateLikeButtonForCurrentVideo('landing', false, true);
                });

                // Safety net: if the observer/smartScrollTo race-condition paused
                // or muted the video during the scroll, restore it fully
                setTimeout(() => {
                    const lv = document.getElementById('landing-video');
                    if (lv && hasStartedExperience) {
                        lv.muted = isMuted; // Restore mute state (smartScrollTo mutes all videos)
                        if (lv.paused) {
                            lv.play().catch(() => { });
                            currentVideoId = 'landing-video';
                            isPlaying = true;
                        }
                    }
                }, 1200);
            }
        }

        // Scroll to a category section
        function scrollToCategory(categoryId) {
            const container = document.getElementById('mainScrollContainer');
            if (!container) return;

            const section = document.getElementById(`section-${categoryId}`);
            if (!section) {
                console.warn(`Section not found: section-${categoryId}`);
                return;
            }

            // Find the index of this section among all sections
            const allSections = Array.from(container.querySelectorAll('.landing-section, .video-section'));
            const sectionIndex = allSections.indexOf(section);

            if (sectionIndex >= 0) {
                const targetTop = sectionIndex * getSectionHeight();
                const targetColor = section.getAttribute('data-bg-color');
                smartScrollTo(targetTop, container, targetColor);

                // Update like button for target section immediately
                const videoId = section.getAttribute('data-video-id');
                if (videoId) updateLikeButtonForCurrentVideo(videoId, false, true);
            }
        }

        // Scroll to a specific video by index within the main container
        function scrollToVideoByIndex(index) {
            const container = document.getElementById('mainScrollContainer');
            if (!container) return;

            const sections = container.querySelectorAll('.landing-section, .video-section');
            if (sections[index]) {
                const targetTop = index * getSectionHeight();
                const targetColor = sections[index].getAttribute('data-bg-color');
                smartScrollTo(targetTop, container, targetColor);
            }
        }

        function toggleCurrentGrid() {
            const gridOverlay = document.getElementById('gridOverlay');
            if (gridOverlay.classList.contains('visible')) {
                closeGridOverlay();
            } else {
                openGridOverlay();
            }
        }

        // Track if video was playing before grid opened
        let videoWasPlayingBeforeGrid = false;

        function openGridOverlay(activeCategory = null) {
            const gridOverlay = document.getElementById('gridOverlay');
            const gridPanelsContainer = document.getElementById('gridPanelsContainer');
            const navbarWrapper = document.getElementById('navbarWrapper');
            trackEvent('grid_open', {});

            // Determine which category to show based on current scroll position
            const currentSection = document.querySelector('.video-section.active, .landing-section.active');
            const currentCat = currentSection?.getAttribute('data-category') || 'zeta';
            const effectiveCategory = activeCategory || currentCat;

            // Highlight the correct tab button
            document.querySelectorAll('.tab-btn').forEach(btn => {
                const tabId = btn.getAttribute('data-tab-id');
                btn.classList.toggle('active', tabId === effectiveCategory);
            });

            // Pause current video for performance
            if (currentVideoId) {
                const video = document.getElementById(currentVideoId);
                if (video && !video.paused) {
                    videoWasPlayingBeforeGrid = true;
                    video.pause();
                } else {
                    videoWasPlayingBeforeGrid = false;
                }
            }

            // Generate grid panels for all tabs
            gridPanelsContainer.innerHTML = videosData.tabs.map((tab) => `
                <div class="grid-panel ${tab.id === effectiveCategory ? 'active' : ''}" data-panel-id="${tab.id}">
                    <div class="grid-container">
                        ${tab.videos.map((video, vIndex) => `
                            <div class="grid-item" onclick="goToVideoFromGrid('${tab.id}', ${vIndex})">
                                <img src="${video.thumbnail || 'https://placehold.co/360x640/png?text=Thumbnail'}" 
                                     width="360" height="640"
                                     draggable="false" 
                                     loading="${tab.id === effectiveCategory ? 'eager' : 'lazy'}"
                                     onload="this.classList.add('loaded'); this.parentElement.classList.add('loaded');" />
                                <span class="video-number">${vIndex + 1}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            gridOverlay.classList.add('visible');
            if (navbarWrapper) navbarWrapper.classList.add('grid-mode');
        }

        function switchGridTab(tabId) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                const btnTabId = btn.getAttribute('data-tab-id');
                btn.classList.toggle('active', btnTabId === tabId);
            });
            // Update panels
            document.querySelectorAll('.grid-panel').forEach(panel => {
                const panelId = panel.getAttribute('data-panel-id');
                panel.classList.toggle('active', panelId === tabId);
            });
        }

        function closeGridOverlay() {
            const gridOverlay = document.getElementById('gridOverlay');
            const navbarWrapper = document.getElementById('navbarWrapper');

            if (gridOverlay) gridOverlay.classList.remove('visible');
            if (navbarWrapper) navbarWrapper.classList.remove('grid-mode');

            // Resume video if it was playing before
            if (videoWasPlayingBeforeGrid && currentVideoId) {
                const video = document.getElementById(currentVideoId);
                if (video) video.play();
            }
        }

        function handleGridOverlayClick(event) {
            const isClickOnContent = event.target.closest('.grid-item') ||
                event.target.closest('.grid-tab-nav') ||
                event.target.closest('.grid-close-btn');

            if (!isClickOnContent) {
                closeGridOverlay();
            }
        }

        // Smart scroll function - uses 'Stitched Glide' for distant jumps
        // Smart scroll function - uses 'Warp Zoom' for distant jumps
        function smartScrollTo(targetTop, container, targetColor = null) {
            const currentTop = container.scrollTop;
            const distance = Math.abs(targetTop - currentTop);
            const sectionHeight = getSectionHeight();

            // If jumping more than 4 sections away, use Warp Zoom
            if (distance > sectionHeight * 4) {
                const direction = targetTop > currentTop ? 1 : -1;

                // Start Warp Sequence
                isWarping = true;

                // Provide direct background transition
                if (targetColor) {
                    setBackgroundColor(targetColor);
                }

                // 1. Engage Warp: Blur, shrink, and fade to simulate speed/depth
                container.style.transition = 'filter 0.2s ease-in, transform 0.2s ease-in, opacity 0.2s ease-in';
                container.style.filter = 'blur(12px)';
                container.style.transform = 'scale(0.98)';
                container.style.opacity = '0.8';

                setTimeout(() => {
                    // 2. Transport: Disable snapping and leapfrog
                    container.style.scrollSnapType = 'none';
                    container.style.scrollBehavior = 'auto';

                    // Mute and pause ALL videos before the jump
                    document.querySelectorAll('.video-section video, .landing-section video').forEach(v => {
                        v.muted = true;
                        if (!v.paused) v.pause();
                    });

                    // Jump to 2 sections vertically away from target for more scroll motion
                    container.scrollTop = targetTop - (direction * sectionHeight * 2);

                    // Force reflow
                    void container.offsetHeight;

                    // 3. Arrival: GSAP Smooth Scroll for controlled landing (Native-like feel)
                    gsap.to(container, {
                        scrollTop: targetTop,
                        duration: 0.7,
                        ease: "power2.out"
                    });

                    // 4. Disengage: Clear warp effects (synced with scroll)
                    setTimeout(() => {
                        container.style.transition = 'filter 0.7s ease-out, transform 0.8s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.7s ease-out';
                        container.style.filter = 'blur(0px)';
                        container.style.transform = 'scale(1)';
                        container.style.opacity = '1';

                        // Cleanup styles after animation
                        setTimeout(() => {
                            container.style.transition = '';
                            container.style.filter = '';
                            container.style.transform = '';
                            container.style.opacity = '';
                            container.style.scrollSnapType = '';
                            container.style.scrollBehavior = '';

                            // Enable observer updates again
                            isWarping = false;

                            // Play the target video now that warp is done
                            const targetSection = container.querySelector('.landing-section, .video-section');
                            const snappedIndex = Math.round(container.scrollTop / sectionHeight);
                            const allSections = container.querySelectorAll('.landing-section, .video-section');
                            if (allSections[snappedIndex]) {
                                const vid = allSections[snappedIndex].getAttribute('data-video-id');
                                if (vid) playVideo(vid);
                                else if (allSections[snappedIndex].classList.contains('landing-section')) playVideo('landing-video');
                            }
                        }, 800);
                    }, 100);
                }, 200);
            } else {
                // Near jump - use normal smooth scroll
                isWarping = true; // Block observer updates during scroll

                // Manually update BG since observer is blocked
                if (targetColor) setBackgroundColor(targetColor);

                const originalSnapType = container.style.scrollSnapType;
                container.style.scrollSnapType = 'none';
                container.scrollTo({ top: targetTop, behavior: 'smooth' });

                setTimeout(() => {
                    container.style.scrollSnapType = originalSnapType || '';
                    isWarping = false; // Re-enable observer updates

                    // Play the correct video now that scroll settled
                    const snappedIndex = Math.round(container.scrollTop / sectionHeight);
                    const allSections = container.querySelectorAll('.landing-section, .video-section');
                    if (allSections[snappedIndex]) {
                        const vid = allSections[snappedIndex].getAttribute('data-video-id');
                        if (vid) playVideo(vid);
                        else if (allSections[snappedIndex].classList.contains('landing-section')) playVideo('landing-video');
                    }
                }, 800);
            }
        }

        // Navigate to a video from the grid overlay
        function goToVideoFromGrid(categoryId, videoIndex) {
            closeGridOverlay();

            // Immediately silence all videos before scrolling
            document.querySelectorAll('.video-section video, .landing-section video').forEach(v => {
                v.muted = true;
                if (!v.paused) v.pause();
            });

            const container = document.getElementById('mainScrollContainer');
            if (!container) return;

            // Find the target section among all sections
            const allSections = container.querySelectorAll('.landing-section, .video-section');
            const categorySections = container.querySelectorAll(`[data-category="${categoryId}"]`);

            if (!categorySections[videoIndex]) return;

            const targetSection = categorySections[videoIndex];

            // Find the absolute index of this section
            let absoluteIndex = -1;
            allSections.forEach((s, idx) => {
                if (s === targetSection) {
                    absoluteIndex = idx;
                }
            });

            if (absoluteIndex >= 0) {
                const targetTop = absoluteIndex * getSectionHeight();
                const targetColor = targetSection.getAttribute('data-bg-color');
                smartScrollTo(targetTop, container, targetColor);

                // Explicitly update like button
                const videoId = targetSection.getAttribute('data-video-id');
                if (videoId) updateLikeButtonForCurrentVideo(videoId, false, true);
            }
        }

        let navigationTween = null;
        let navigationScrollStyles = null;

        function restoreNavigationScrollStyles(container) {
            if (!navigationScrollStyles) return;
            container.style.scrollSnapType = navigationScrollStyles.scrollSnapType;
            container.style.scrollBehavior = navigationScrollStyles.scrollBehavior;
            navigationScrollStyles = null;
        }

        function getClosestSectionIndex(container, sections) {
            let closestIndex = 0;
            let closestDistance = Infinity;

            sections.forEach((section, index) => {
                const distance = Math.abs(section.offsetTop - container.scrollTop);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });

            return closestIndex;
        }

        // Scroll to a specific section using its real position. Calculating the
        // destination from viewport height is unreliable when browser chrome or
        // the mobile navigation changes the usable viewport.
        function scrollToVideo(index, smooth = true) {
            const container = document.getElementById('mainScrollContainer');
            if (!container) return;

            const sections = container.querySelectorAll('.landing-section, .video-section');
            if (sections[index]) {
                const targetTop = sections[index].offsetTop;

                if (!smooth) {
                    if (navigationTween) navigationTween.kill();
                    navigationTween = null;
                    restoreNavigationScrollStyles(container);
                    container.scrollTop = targetTop;
                    return;
                }

                // A new click retargets the current movement instead of fighting it.
                if (navigationTween) navigationTween.kill();
                navigationTween = null;
                restoreNavigationScrollStyles(container);

                navigationScrollStyles = {
                    scrollSnapType: container.style.scrollSnapType,
                    scrollBehavior: container.style.scrollBehavior
                };
                container.style.scrollSnapType = 'none';
                container.style.scrollBehavior = 'auto';

                const distance = Math.abs(targetTop - container.scrollTop);
                const duration = Math.min(0.72, Math.max(0.45, distance / 1400));

                navigationTween = gsap.to(container, {
                    scrollTop: targetTop,
                    duration,
                    ease: 'power3.inOut',
                    overwrite: 'auto',
                    onComplete: () => {
                        container.scrollTop = targetTop;
                        navigationTween = null;
                        restoreNavigationScrollStyles(container);
                        isScrolling = false;
                        navigationTargetIndex = null;
                        updateNavArrows();
                        // Playback may have started while scrolling blocked the idle timer.
                        scheduleDesktopImmersiveMode();
                    }
                });
            }
        }

        // Navigate to next/previous section (for keyboard navigation)
        // Queued navigation - allows updating target mid-transition
        let navigationTargetIndex = null;

        function navigate(direction) {
            const container = document.getElementById('mainScrollContainer');
            if (!container) return;

            const sections = container.querySelectorAll('.landing-section, .video-section');
            const totalSections = sections.length;

            // Determine base index: use current target if scrolling, otherwise use current scroll position
            let baseIndex;
            if (isScrolling && navigationTargetIndex !== null) {
                // We're mid-transition - update from current target
                baseIndex = navigationTargetIndex;
            } else {
                // Fresh navigation - use actual section positions.
                baseIndex = getClosestSectionIndex(container, sections);
            }

            let newIndex = baseIndex + direction;

            // Clamp to valid range
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= totalSections) newIndex = totalSections - 1;

            // If already at same index, do nothing
            if (newIndex === navigationTargetIndex && isScrolling) return;

            // Update target and start/restart scroll
            navigationTargetIndex = newIndex;

            if (window.innerWidth <= 600 && newIndex !== baseIndex) {
                mobileNavigationControlsTarget = sections[newIndex].querySelector('video')?.id || null;
                clearTimeout(mobileControlsTimer);
                document.body.classList.add('mobile-controls-visible');
            }

            isScrolling = true;
            scrollToVideo(newIndex);
        }

        // Windows detented wheels can jump through native snap points. Keep macOS
        // entirely native and only claim recognizable wheel steps on Windows.
        // WheelEvent has no reliable mouse/trackpad flag: ambiguous input stays native.
        function initDesktopMouseWheel(container) {
            const platform = navigator.userAgentData?.platform || navigator.platform || '';
            if (!/Win/i.test(platform)) return;
            let lastClaimedAt = -Infinity;
            let nativeUntil = 0;

            container.addEventListener('wheel', (event) => {
                if (window.innerWidth <= 600 || event.defaultPrevented || !event.cancelable ||
                    event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
                    document.fullscreenElement || document.webkitFullscreenElement ||
                    document.body.classList.contains('info-panel-open')) return;

                // Never take over form controls or independently scrollable content.
                if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
                for (let node = event.target; node && node !== container; node = node.parentElement) {
                    if (node.scrollHeight > node.clientHeight + 1 &&
                        /auto|scroll/.test(getComputedStyle(node).overflowY)) return;
                }

                const mode = event.deltaMode;
                const y = Math.abs(event.deltaY);
                if (!y) return;
                const now = performance.now();
                const stepped = event.deltaX === 0 && (mode === 1 || mode === 2 ||
                    (mode === 0 && y >= 100 && Number.isInteger(y) &&
                        (y % 100 === 0 || y % 120 === 0)));
                if (!stepped) {
                    // Preserve the whole trackpad gesture, including larger later deltas.
                    nativeUntil = now + 800;
                    return;
                }
                if (now < nativeUntil) return;

                event.preventDefault();
                const stillInGesture = now - lastClaimedAt < 180;
                lastClaimedAt = now;
                // Do not queue extra reels from wheel bursts, or interrupt arrow motion.
                if (navigationTween || isScrolling || stillInGesture) return;
                navigate(Math.sign(event.deltaY));
            }, { passive: false });
        }

        // Block horizontal scroll on trackpad (prevent visual glitches)
        document.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 3) {
                e.preventDefault();
            }
        }, { passive: false });

        // Horizontal swipe between categories (mobile)
        (function initCategorySwipe() {
            let swipeStartX = 0, swipeStartY = 0, swiping = false;
            const SWIPE_THRESHOLD = 70;
            const ANGLE_LIMIT = 30;

            function getCategoryOrder() {
                if (!videosData || !videosData.tabs) return [];
                return ['home', ...videosData.tabs.map(t => t.id)];
            }

            function getCurrentCategory() {
                const active = document.querySelector('.video-section.active, .landing-section.active');
                if (!active) return 'home';
                if (active.classList.contains('landing-section')) return 'home';
                return active.getAttribute('data-category') || 'home';
            }

            const container = document.getElementById('mainScroll');
            if (!container) return;

            container.addEventListener('touchstart', (e) => {
                if (e.target.closest('.video-seekbar')) return;
                swipeStartX = e.touches[0].clientX;
                swipeStartY = e.touches[0].clientY;
                swiping = true;
            }, { passive: true });

            container.addEventListener('touchend', (e) => {
                if (!swiping) return;
                swiping = false;
                const dx = e.changedTouches[0].clientX - swipeStartX;
                const dy = e.changedTouches[0].clientY - swipeStartY;
                const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

                if (Math.abs(dx) < SWIPE_THRESHOLD) return;
                if (angle > ANGLE_LIMIT && angle < (180 - ANGLE_LIMIT)) return;

                const cats = getCategoryOrder();
                const current = getCurrentCategory();
                const idx = cats.indexOf(current);
                if (idx < 0) return;

                if (dx < 0 && idx < cats.length - 1) {
                    const next = cats[idx + 1];
                    if (next === 'home') goToLanding();
                    else handleTabClick(next);
                } else if (dx > 0 && idx > 0) {
                    const prev = cats[idx - 1];
                    if (prev === 'home') goToLanding();
                    else handleTabClick(prev);
                }
            }, { passive: true });
        })();

        // Keyboard Navigation
        document.addEventListener('keydown', (e) => {
            const isTyping = e.target instanceof HTMLElement &&
                (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));

            if (!isTyping && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey &&
                e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleDesktopFullscreen();
                return;
            }

            if (!isTyping && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey &&
                (e.code === 'Space' || e.key === ' ')) {
                e.preventDefault();
                const video = getActiveVideoForFullscreen();
                if (!video) return;
                if (hasStartedExperience) {
                    toggleVideo(video.id, false);
                } else {
                    startExperienceWithSound(video.id);
                }
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                navigate(1);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                navigate(-1);
            }
        });

        // Touch handling removed - native scroll handles single page navigation

        // Double-tap to like. On mobile, a single tap reveals playback
        // controls; only the center control changes the playback state.
        function initDoubleTapLike() {
            let lastTapTime = 0;
            let tapTimer = null;
            let lastTapVideoId = null;
            const DOUBLE_TAP_DELAY = 280;

            document.addEventListener('click', (e) => {
                if (e.target.closest('.video-seekbar, .control-bar, .nav-arrow-btn, .info-panel')) return;

                const frame = e.target.closest('[data-tap-video]');
                const controlsVisible = document.body.classList.contains('mobile-controls-visible');
                const isMobile = window.innerWidth <= 600;
                const tappedPlaybackControl = !!e.target.closest('.play-overlay-btn');

                if (isMobile && controlsVisible && !e.target.closest('.play-overlay-btn')) {
                    hideMobilePlaybackControls();
                    if (!frame) return;
                }

                if (!frame) return;

                const videoId = frame.getAttribute('data-tap-video');

                if (tappedPlaybackControl && !isMobile) {
                    clearTimeout(tapTimer);
                    lastTapTime = 0;
                    lastTapVideoId = null;
                    if (hasStartedExperience) {
                        toggleVideo(videoId);
                    } else {
                        startExperienceWithSound(videoId);
                    }
                    return;
                }

                // Mobile likes work before playback starts, including on the center control.
                // Defer its single-tap action so a second tap can like without starting playback.
                if (!isMobile && !hasStartedExperience) return;

                const now = Date.now();
                const video = document.getElementById(videoId);
                const isMobilePlaying = isMobile &&
                    video && !video.paused && !video.ended;

                if (isMobilePlaying && !controlsVisible) showMobilePlaybackControls();

                if (lastTapVideoId === videoId && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
                    clearTimeout(tapTimer);
                    tapTimer = null;
                    lastTapTime = 0;
                    lastTapVideoId = null;
                    doubleTapLike(e, videoId);
                } else {
                    lastTapTime = now;
                    lastTapVideoId = videoId;
                    clearTimeout(tapTimer);

                    // Provide immediate visual feedback before the delay resolves.
                    // This satisfies INP by painting a response frame within ~50ms.
                    if (window.innerWidth > 600 &&
                        video && !video.paused && isMuted && !userManuallyMuted) {
                        // First-tap-unmute path — execute immediately, no delay needed
                        lastTapTime = 0;
                        lastTapVideoId = null;
                        unmuteAndDismissHint();
                        return;
                    }

                    tapTimer = setTimeout(() => {
                        tapTimer = null;
                        lastTapTime = 0;
                        lastTapVideoId = null;
                        // A queued tap must not start a reel after the user navigates away.
                        if (getActiveVideoForFullscreen()?.id !== videoId) return;
                        if (isMobile) {
                            if (tappedPlaybackControl) {
                                if (hasStartedExperience) toggleVideo(videoId);
                                else startExperienceWithSound(videoId);
                            }
                        } else {
                            toggleVideo(videoId);
                        }
                    }, DOUBLE_TAP_DELAY);
                }
            });
        }

        let _dtTapCount = 0;
        let _dtResetTimer = null;
        let _dtActiveHeart = null;
        let _dtActiveTl = null;

        function doubleTapLike(e, videoId) {
            // Show the heart animation + haptic immediately (visual response)
            _dtTapCount++;
            clearTimeout(_dtResetTimer);
            _dtResetTimer = setTimeout(() => { _dtTapCount = 0; }, 1200);
            pumpCenterHeart(e.clientX, e.clientY, _dtTapCount);
            if (navigator.vibrate) navigator.vibrate(30);

            // Defer the like toggle (localStorage I/O) to after the next paint
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const userLikes = JSON.parse(localStorage.getItem('userLikedVideos') || '{}');
                    if (!userLikes[getCurrentVideoId()]) {
                        toggleLike();
                    }
                }, 0);
            });
        }

        const _dtHeartSVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
            <defs>
                <linearGradient id="dtHeartFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#F2282B"/>
                    <stop offset="100%" stop-color="#FF2C9D"/>
                </linearGradient>
                <linearGradient id="dtHeartStroke" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>
                    <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
                </linearGradient>
                <clipPath id="dtHeartClip">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </clipPath>
            </defs>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  fill="url(#dtHeartFill)" stroke="url(#dtHeartStroke)" stroke-width="3" paint-order="fill stroke" clip-path="url(#dtHeartClip)"/>
        </svg>`;

        function getHeartSize(tapCount) {
            const base = 120;
            const grow = 30;
            const max = 340;
            return Math.min(base + (tapCount - 1) * grow, max);
        }

        function pumpCenterHeart(x, y, tapCount) {
            const size = getHeartSize(tapCount);

            if (_dtActiveHeart && _dtActiveTl) {
                _dtActiveTl.kill();
                const rot = (Math.random() - 0.5) * 18;

                const tl = gsap.timeline();
                _dtActiveTl = tl;

                tl.to(_dtActiveHeart, {
                    width: size,
                    height: size,
                    scale: 1.2,
                    rotation: rot,
                    duration: 0.15,
                    ease: 'power3.out',
                    overwrite: true
                }).to(_dtActiveHeart, {
                    scale: 1,
                    duration: 0.5,
                    ease: 'elastic.out(1.1, 0.3)'
                });

                clearTimeout(_dtActiveHeart._exitTimer);
                _dtActiveHeart._exitTimer = setTimeout(() => dismissHeart(_dtActiveHeart), 650);
                return;
            }

            const heart = document.createElement('div');
            heart.className = 'flying-heart';
            heart.innerHTML = _dtHeartSVG;

            Object.assign(heart.style, {
                left: `${x}px`,
                top: `${y - 80}px`,
                width: `${size}px`,
                height: `${size}px`,
                opacity: '0',
                filter: 'drop-shadow(0 6px 28px rgba(0,0,0,0.5))'
            });

            document.body.appendChild(heart);
            _dtActiveHeart = heart;

            const rot = (Math.random() - 0.5) * 14;
            const tl = gsap.timeline();
            _dtActiveTl = tl;

            tl.fromTo(heart,
                { opacity: 0, scale: 0, y: 50 },
                { opacity: 1, scale: 1.2, y: 0, rotation: rot, duration: 0.22, ease: 'back.out(2.5)' }
            ).to(heart,
                { scale: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.3)' }
            );

            heart._exitTimer = setTimeout(() => dismissHeart(heart), 650);
        }

        function dismissHeart(heart) {
            if (heart !== _dtActiveHeart) { heart.remove(); return; }
            _dtActiveHeart = null;
            _dtActiveTl = null;

            const floatY = -(140 + Math.random() * 100);
            const driftX = (Math.random() - 0.5) * 60;
            const rot = (Math.random() - 0.5) * 35;

            gsap.to(heart, {
                opacity: 0,
                y: floatY,
                x: driftX,
                rotation: rot,
                duration: 0.75,
                ease: 'power2.in',
                onComplete: () => heart.remove()
            });
        }

        initDoubleTapLike();

        // --- Info Panel (Instagram-style bottom sheet) ---
        // The SAME video stays playing — we just CSS-transform the section and
        // slide a bottom sheet up. No second <video> element, no re-buffering.
        (function initInfoPanel() {
            const sheet = document.getElementById('infoPanelSheet');
            const contentEl = document.getElementById('infoPanelContent');
            const dragger = document.getElementById('infoPanelDragger');
            if (!sheet || !contentEl || !dragger) return;

            // The sheet height = viewport − video area. We express state as
            // sheetRatio ∈ [0, MAX_SHEET] where 0 = closed, MAX_SHEET = fully open.
            const MAX_SHEET = 0.62;   // sheet can cover up to 62 % of viewport
            let OPEN_SHEET = 0.50; // Measured from the current project's content.
            const toolbar = document.getElementById('infoPanelToolbar');
            const titleEl = document.getElementById('infoPanelTitle');
            const closeButton = document.getElementById('infoPanelClose');
            const playbackButton = document.getElementById('infoPanelPlayback');
            const trigger = document.getElementById('infoPanelBtn');
            let returnFocus = null;
            let previousOverflow = '';
            const panelDuration = (seconds) => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : seconds;
            // Use the existing site icons as the source of truth.
            const closeIcon = document.querySelector('.grid-toggle-btn .close-icon, .close-icon')?.cloneNode(true);
            if (closeIcon) {
                closeIcon.removeAttribute('class');
                closeIcon.setAttribute('aria-hidden', 'true');
                closeButton.replaceChildren(closeIcon);
            }

            function syncPanelPlayback() {
                const video = _activeFrame?.querySelector('video');
                const icon = document.getElementById(video && !video.paused ? 'pauseIcon' : 'playIcon').cloneNode(true);
                icon.removeAttribute('id');
                icon.removeAttribute('style');
                icon.setAttribute('aria-hidden', 'true');
                playbackButton.replaceChildren(icon);
                playbackButton.setAttribute('aria-label', video && !video.paused ? 'Pause video' : 'Play video');
            }
            function togglePanelPlayback() {
                const video = _activeFrame?.querySelector('video');
                if (!video) return;
                if (!hasStartedExperience) startExperienceWithSound(video.id);
                else toggleVideo(video.id, false);
                syncPanelPlayback();
            }
            playbackButton.addEventListener('click', togglePanelPlayback);
            closeButton.addEventListener('click', () => closeInfoPanel());
            document.addEventListener('play', syncPanelPlayback, true);
            document.addEventListener('pause', syncPanelPlayback, true);

            let _open = false;
            let _sheetRatio = 0;      // current fraction
            let _activeSection = null;
            let _activeFrame = null;
            let _isDragging = false;
            let _dragStartY = 0;
            let _dragStartRatio = 0;

            function getVideoFrame() {
                const vid = getCurrentVideoId();
                if (!vid) return { section: null, frame: null };
                if (vid === 'landing-video' || vid === 'landing') {
                    const sec = document.querySelector('.landing-section');
                    return { section: sec, frame: sec ? sec.querySelector('.landing-video-frame') : null };
                }
                const sec = document.querySelector('.video-section.active') ||
                            document.querySelector(`[data-video-id="${vid}"]`);
                return { section: sec, frame: sec ? sec.querySelector('.video-frame') : null };
            }

            function frameLayout(ratio) {
                if (!_activeFrame || ratio === 0) return { videoScale: 1, ty: 0 };
                const availableHeight = window.innerHeight * (1 - ratio);
                const bounds = _activeFrame.getBoundingClientRect();
                const currentY = parseFloat(getComputedStyle(_activeFrame).getPropertyValue('--ip-ty')) || 0;
                const originalCenter = bounds.top + bounds.height / 2 - currentY;
                return {
                    videoScale: Math.min(1, Math.max(0, availableHeight - 24) / _activeFrame.offsetHeight,
                        (window.innerWidth - 24) / _activeFrame.offsetWidth),
                    ty: availableHeight / 2 - originalCenter
                };
            }

            function applyLayout(ratio, animate) {
                _sheetRatio = Math.max(0, Math.min(MAX_SHEET, ratio));
                const vh = window.innerHeight;
                const sheetH = _sheetRatio * vh;
                // Shrink the video slightly more than the available area
                // so there's visible padding above and below it.
                const { videoScale, ty } = frameLayout(_sheetRatio);

                const t = Math.max(0, (_sheetRatio - 0.05) / (MAX_SHEET - 0.05));
                const radius = t * 32;

                // Center the video in the area above the sheet, nudged down
                // to compensate for the dragger/border-radius visual weight.

                if (animate) {
                    gsap.to(sheet, { y: -sheetH, duration: 0.4, ease: 'power3.out' });
                    if (_activeFrame) {
                        gsap.to(_activeFrame, {
                            '--ip-scale': videoScale,
                            '--ip-radius': radius + 'px',
                            '--ip-ty': ty + 'px',
                            duration: 0.4,
                            ease: 'power3.out'
                        });
                    }
                } else {
                    gsap.set(sheet, { y: -sheetH });
                    if (_activeFrame) {
                        _activeFrame.style.setProperty('--ip-scale', videoScale);
                        _activeFrame.style.setProperty('--ip-radius', radius + 'px');
                        _activeFrame.style.setProperty('--ip-ty', ty + 'px');
                    }
                }

                const draggerH = (dragger.offsetHeight || 32) + toolbar.offsetHeight;
                contentEl.style.maxHeight = Math.max(0, sheetH - draggerH) + 'px';
            }

            function applyLayoutSnap(targetRatio, goingUp) {
                const clamped = Math.max(0, Math.min(MAX_SHEET, targetRatio));
                const vh = window.innerHeight;
                const sheetH = clamped * vh;
                const { videoScale, ty } = frameLayout(clamped);
                const t = Math.max(0, (clamped - 0.05) / (MAX_SHEET - 0.05));
                const radius = t * 32;

                // A small shared overshoot makes the sheet and video settle together.
                const ease = goingUp ? 'back.out(0.8)' : 'power3.out';
                const dur = panelDuration(goingUp ? 0.5 : 0.4);

                gsap.to(sheet, { y: -sheetH, duration: dur, ease,
                    overwrite: true,
                    onComplete: () => { if (_open && !sheet.contains(document.activeElement)) closeButton.focus({ preventScroll: true }); }
                });
                if (_activeFrame) {
                    gsap.to(_activeFrame, {
                        '--ip-scale': videoScale,
                        '--ip-radius': radius + 'px',
                        '--ip-ty': ty + 'px',
                        duration: dur,
                        overwrite: true,
                        ease
                    });
                }

                _sheetRatio = clamped;
                const draggerH = (dragger.offsetHeight || 32) + toolbar.offsetHeight;
                contentEl.style.maxHeight = Math.max(0, sheetH - draggerH) + 'px';
            }

            function getVideoData() {
                const vid = getCurrentVideoId();
                if (!vid) return null;
                if (vid === 'landing-video' || vid === 'landing') {
                    return {
                        title: videosData.landingSection.name,
                        description: videosData.landingSection.bio,
                        comments: [],
                        link: null
                    };
                }
                for (const tab of videosData.tabs) {
                    const found = tab.videos.find(v => v.id === vid);
                    if (found) return found;
                }
                return null;
            }

            function populateContent(videoData) {
                if (!videoData) { contentEl.innerHTML = ''; return; }
                titleEl.textContent = videoData.title || 'Project details';
                let html = '<div class="info-panel-header">';
                if (videoData.description) html += `<p class="info-panel-desc">${videoData.description}</p>`;
                if (videoData.link) html += `<a class="info-panel-link" href="${videoData.link.url}" target="_blank" rel="noopener noreferrer"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clip-rule="evenodd" /></svg>${videoData.link.text}</a>`;
                html += '</div>';
                if (videoData.comments && videoData.comments.length > 0) {
                    html += '<p class="info-panel-comments-heading">Highlights</p>';
                    videoData.comments.forEach(c => {
                        const bg = c.avatarColor || (c.type === 'avatar' ? '#3498db' : 'rgba(255,255,255,0.12)');
                        html += `<div class="info-panel-comment">
                            <div class="info-panel-comment-icon" style="--comment-accent:${bg}" aria-hidden="true">${getCommentIcon(c.type)}</div>
                            <div class="info-panel-comment-text">${c.text}</div>
                        </div>`;
                    });
                }
                contentEl.innerHTML = html;
                const projectLink = contentEl.querySelector('.info-panel-link');
                if (projectLink && videoData.link?.text === 'Figma Community') {
                    projectLink.lastChild.textContent = 'View Figma project';
                }
            }

            window.openInfoPanel = function() {
                if (_open || document.body.classList.contains('info-panel-open') || window.innerWidth > 600) return;
                const { section, frame } = getVideoFrame();
                if (!section || !frame) return;
                _open = true;
                _activeSection = section;
                _activeFrame = frame;
                returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
                sheet.inert = false;
                sheet.setAttribute('aria-hidden', 'false');
                trigger.setAttribute('aria-expanded', 'true');
                syncPanelPlayback();

                section.classList.add('info-panel-active');
                document.body.classList.add('info-panel-open');

                // Hide side UI while panel is open
                const navArrows = document.getElementById('fixedNavArrows');
                const mobileNav = document.getElementById('mobileBottomNav');
                if (navArrows) gsap.to(navArrows, { opacity: 0, duration: 0.25, onComplete: () => { navArrows.style.pointerEvents = 'none'; } });
                if (mobileNav) gsap.to(mobileNav, { opacity: 0, duration: 0.25, onComplete: () => { mobileNav.style.pointerEvents = 'none'; } });

                // Hide all video overlays (descriptions, seekbar, profile info)
                section.querySelectorAll('.content-info-left, .landing-profile-info, .video-seekbar').forEach(el => {
                    gsap.to(el, { opacity: 0, duration: 0.25 });
                });
                // Force-hide mute hints (their .visible class overrides GSAP opacity)
                document.querySelectorAll('.mute-indicator').forEach(el => el.classList.remove('visible'));

                // Populate and open (content scroll locked until sheet reaches max)
                populateContent(getVideoData());
                contentEl.scrollTop = 0;
                contentEl.style.maxHeight = 'none';
                const contentStyle = getComputedStyle(contentEl);
                const naturalHeight = Array.from(contentEl.children).reduce((height, child) => {
                    const style = getComputedStyle(child);
                    return height + child.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
                }, parseFloat(contentStyle.paddingTop) + parseFloat(contentStyle.paddingBottom));
                OPEN_SHEET = Math.min(MAX_SHEET, Math.max(0.25,
                    (naturalHeight + dragger.offsetHeight + toolbar.offsetHeight + 8) / window.innerHeight));
                lockContentScroll(false);
                sheet.classList.add('visible');

                // Disable page scroll
                const mainScroll = document.getElementById('mainScrollContainer');
                if (mainScroll) {
                    previousOverflow = mainScroll.style.overflow;
                    mainScroll.style.overflow = 'hidden';
                }

                applyLayoutSnap(OPEN_SHEET, true);
                closeButton.focus({ preventScroll: true });
            };

            window.closeInfoPanel = function() {
                if (!_open) return;
                _open = false;
                _isDragging = false;
                _dragSource = null;
                sheet.inert = true;
                sheet.setAttribute('aria-hidden', 'true');
                trigger.setAttribute('aria-expanded', 'false');

                // Animate sheet down + video back to full
                gsap.to(sheet, {
                    y: 0,
                    duration: panelDuration(0.45),
                    ease: 'power2.out',
                    overwrite: true,
                    onComplete: () => {
                        sheet.classList.remove('visible');
                        document.body.classList.remove('info-panel-open');
                        showMobilePlaybackControls();
                        (returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : trigger).focus({ preventScroll: true });
                    }
                });

                const closingFrame = _activeFrame;
                const closingSection = _activeSection;

                if (closingFrame) {
                    gsap.to(closingFrame, {
                        '--ip-scale': 1,
                        '--ip-radius': '0px',
                        '--ip-ty': '0px',
                        duration: panelDuration(0.45),
                        ease: 'power2.out',
                        overwrite: true,
                        onComplete: () => {
                            closingFrame.style.removeProperty('--ip-scale');
                            closingFrame.style.removeProperty('--ip-radius');
                            closingFrame.style.removeProperty('--ip-ty');
                            if (closingSection) closingSection.classList.remove('info-panel-active');
                        }
                    });
                }

                // Restore UI
                const navArrows = document.getElementById('fixedNavArrows');
                const mobileNav = document.getElementById('mobileBottomNav');
                if (navArrows) { navArrows.style.pointerEvents = ''; gsap.to(navArrows, { opacity: 1, duration: 0.25 }); }
                if (mobileNav) { mobileNav.style.pointerEvents = ''; gsap.to(mobileNav, { opacity: 1, duration: 0.25 }); }

                if (closingSection) {
                    closingSection.querySelectorAll('.content-info-left, .landing-profile-info, .video-seekbar').forEach(el => {
                        gsap.to(el, { opacity: 1, duration: 0.3, delay: 0.15 });
                    });
                    // Restore mute hint if still muted
                    if (isMuted) {
                        setTimeout(() => { if (typeof showMuteIndicator === 'function') showMuteIndicator(); }, 350);
                    }
                }

                const mainScroll = document.getElementById('mainScrollContainer');
                if (mainScroll) mainScroll.style.overflow = previousOverflow;

                _activeSection = null;
                _activeFrame = null;
                _sheetRatio = 0;
            };

            // Tap the video to return to the feed; playback stays in the sheet toolbar.
            document.addEventListener('click', (e) => {
                if (!_open) return;
                const frame = e.target.closest('.video-frame, .landing-video-frame');
                if (frame && frame === _activeFrame) {
                    e.stopPropagation();
                    e.preventDefault();
                    closeInfoPanel();
                }
            }, true); // capture phase

            // --- Drag interaction ---
            // Dragger handle: always draggable.
            // Content area: only becomes a drag when scrolled to top AND user
            // pulls downward (to dismiss). This prevents hijacking normal scrolls.
            let _touchStartY = 0;
            let _dragSource = null; // 'dragger' | 'content' | null

            function isSheetAtMax() {
                return Math.abs(_sheetRatio - MAX_SHEET) < 0.01;
            }

            function lockContentScroll(lock) {
                contentEl.style.overflowY = lock ? 'hidden' : 'auto';
            }

            function onDragStart(e) {
                const y = e.touches ? e.touches[0].clientY : e.clientY;
                const fromDragger = dragger.contains(e.target);
                const fromContent = contentEl.contains(e.target);

                if (fromDragger) {
                    _isDragging = true;
                    _dragSource = 'dragger';
                    _dragStartY = y;
                    _dragStartRatio = _sheetRatio;
                } else if (fromContent) {
                    _touchStartY = y;
                    _dragSource = 'content';
                }
            }

            function onDragMove(e) {
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                if (_dragSource === 'content' && !_isDragging) {
                    const delta = clientY - _touchStartY;
                    const isScrollUp = delta < 0;
                    const isScrollDown = delta > 0;

                    // Scrolling UP on content: if sheet isn't at max, expand
                    // the sheet instead of scrolling content.
                    if (isScrollUp && !isSheetAtMax() && Math.abs(delta) > 6) {
                        _isDragging = true;
                        _dragStartY = _touchStartY;
                        _dragStartRatio = _sheetRatio;
                        lockContentScroll(true);
                    }
                    // Scrolling DOWN on content: if content is at top, start
                    // collapsing the sheet (pull-to-dismiss).
                    else if (isScrollDown && contentEl.scrollTop <= 0 && delta > 6) {
                        _isDragging = true;
                        _dragStartY = _touchStartY;
                        _dragStartRatio = _sheetRatio;
                        lockContentScroll(true);
                    }
                    else {
                        return;
                    }
                }

                if (!_isDragging) return;
                const deltaY = _dragStartY - clientY;
                const vh = window.innerHeight;
                const newRatio = _dragStartRatio + (deltaY / vh);

                // If dragging up past max, clamp and unlock content scroll
                if (newRatio >= MAX_SHEET) {
                    applyLayout(MAX_SHEET, false);
                    lockContentScroll(false);
                    // Hand off to content scroll — reset drag state
                    _isDragging = false;
                    _dragSource = null;
                    return;
                }

                applyLayout(newRatio, false);
            }

            function onDragEnd() {
                _dragSource = null;
                lockContentScroll(false);
                if (!_isDragging) return;
                _isDragging = false;

                if (_sheetRatio < OPEN_SHEET * 0.65) {
                    closeInfoPanel();
                } else {
                    const mid = (OPEN_SHEET + MAX_SHEET) / 2;
                    const target = _sheetRatio > mid ? MAX_SHEET : OPEN_SHEET;
                    const goingUp = target > _sheetRatio;
                    applyLayoutSnap(target, goingUp);
                }
            }

            sheet.addEventListener('touchstart', onDragStart, { passive: true });
            sheet.addEventListener('mousedown', onDragStart);
            window.addEventListener('touchmove', onDragMove, { passive: true });
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('touchend', onDragEnd);
            window.addEventListener('mouseup', onDragEnd);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && _open) {
                    e.preventDefault();
                    closeInfoPanel();
                }
            });
            window.addEventListener('resize', () => {
                if (!_open) return;
                if (window.innerWidth > 600) closeInfoPanel();
                else applyLayout(_sheetRatio, false);
            });

            // Tap on description area opens the info panel on mobile
            document.addEventListener('click', (e) => {
                if (_open) return;
                if (window.innerWidth > 600) return;
                if (e.target.closest('.content-info-left') || e.target.closest('.landing-profile-info')) {
                    e.stopPropagation();
                    openInfoPanel();
                }
            }, true);
        })();

        // Initialize
        initApp();
