/**
 * timelineService.js — Phase 2 (Time Machine)
 *
 * Implements:
 *   getAvailableSnapshots() — months with bookmark activity
 *   getSnapshot(isoDate)    — graph state at a given date via snapshot+delta model
 *   buildMonthlySnapshots() — builds/caches monthly graph_snapshots for all active months
 */

const db = require('../db');

// ============================================================
// HELPERS
// ============================================================

/**
 * Parse a date string to 'YYYY-MM' month key.
 * @param {string} dateStr
 * @returns {string}
 */
const toMonthKey = (dateStr) => {
    const d = new Date(dateStr);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

/**
 * Return last day of a given YYYY-MM month as 'YYYY-MM-DD 23:59:59'.
 * @param {string} yearMonth — 'YYYY-MM'
 * @returns {string}
 */
const lastMomentOfMonth = (yearMonth) => {
    const [y, m] = yearMonth.split('-').map(Number);
    // Day 0 of next month = last day of this month
    const lastDay = new Date(Date.UTC(y, m, 0));
    const dd = String(lastDay.getUTCDate()).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${y}-${mm}-${dd} 23:59:59`;
};

/**
 * Return an array of YYYY-MM strings from startMonth to endMonth (inclusive).
 * @param {string} startMonth — 'YYYY-MM'
 * @param {string} endMonth   — 'YYYY-MM'
 * @returns {string[]}
 */
const monthRange = (startMonth, endMonth) => {
    const months = [];
    let [y, m] = startMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return months;
};

/**
 * Current month as 'YYYY-MM'.
 * @returns {string}
 */
const currentMonth = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

// ============================================================
// CORE STATE RECONSTRUCTION
// ============================================================

/**
 * Apply a single event to the in-memory state Map.
 * @param {Map} state - Map<bookmarkId, { id, title, url, tags, created_at }>
 * @param {object} event - row from bookmark_events
 */
const applyEvent = (state, event) => {
    let payload = {};
    try { payload = JSON.parse(event.payload || '{}'); } catch { payload = {}; }

    switch (event.event_type) {
        case 'created':
            state.set(event.bookmark_id, {
                id: event.bookmark_id,
                title: payload.title || '',
                url: payload.url || '',
                tags: payload.tags || [],
                created_at: event.occurred_at,
            });
            break;

        case 'deleted':
            state.delete(event.bookmark_id);
            break;

        case 'restored':
            // If payload has bookmark data use it; otherwise re-create minimal record
            state.set(event.bookmark_id, {
                id: event.bookmark_id,
                title: payload.title || '',
                url: payload.url || '',
                tags: payload.tags || [],
                created_at: event.occurred_at,
            });
            break;

        case 'tag_updated':
            if (state.has(event.bookmark_id)) {
                state.get(event.bookmark_id).tags = payload.tags || [];
            }
            break;

        // stack_added / stack_removed — no structural change to bookmark node set
        default:
            break;
    }
};

/**
 * Convert a state Map to a graph object { nodes, links, date }.
 * Matches the node format expected by NetworkGraph.jsx.
 * @param {Map} state
 * @param {string} isoDate
 * @returns {{ nodes: object[], links: object[], date: string }}
 */
const stateToGraph = (state, isoDate) => {
    const nodes = [];
    const links = [];
    const tagCounts = new Map(); // tag → count

    for (const bm of state.values()) {
        nodes.push({
            id: `bookmark-${bm.id}`,
            type: 'bookmark',
            name: bm.title || bm.url,
            url: bm.url,
            val: 5,
            color: '#60A5FA',
            originalId: bm.id,
            tags: bm.tags || [],
        });

        for (const tag of (bm.tags || [])) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            links.push({ source: `bookmark-${bm.id}`, target: `tag-${tag}`, value: 1 });
        }
    }

    for (const [tag, count] of tagCounts.entries()) {
        nodes.push({
            id: `tag-${tag}`,
            type: 'tag',
            name: tag,
            val: 10 + count * 2,
            color: '#F472B6',
            isTag: true,
        });
    }

    return { nodes, links, date: isoDate };
};

// ============================================================
// getAvailableSnapshots
// ============================================================

/**
 * Returns array of { date: 'YYYY-MM', bookmarkCount: N, hasSnapshot: bool }
 * sorted oldest first. Falls back to just the current month if no activity.
 */
const getAvailableSnapshots = async () => {
    try {
        // Get all events ordered by time
        const allEvents = db.db.prepare(
            'SELECT bookmark_id, event_type, occurred_at FROM bookmark_events ORDER BY occurred_at'
        ).all();

        // Get existing pre-built snapshots
        const existingSnapshots = db.getAllSnapshots();
        const snapshotDateSet = new Set(existingSnapshots.map(s => s.snapshot_date));

        if (allEvents.length === 0) {
            // No events yet — return current month only
            const cur = currentMonth();
            const live = db.getAllBookmarks();
            return [{
                date: cur,
                bookmarkCount: live.length,
                hasSnapshot: snapshotDateSet.has(cur),
            }];
        }

        // Group events by month, tracking running bookmark count
        // We need to compute bookmarkCount at each month's end by running the delta
        const state = new Map();

        // Collect all months with activity
        const monthSet = new Set(allEvents.map(e => toMonthKey(e.occurred_at)));

        // Ensure we always include current month
        monthSet.add(currentMonth());

        const sortedMonths = Array.from(monthSet).sort();

        // Build month → snapshot info by replaying events month by month
        const result = [];
        let eventIdx = 0;
        const sortedEvents = allEvents; // already ordered by occurred_at

        for (const month of sortedMonths) {
            const cutoff = lastMomentOfMonth(month);

            // Apply all events up to end of this month
            while (eventIdx < sortedEvents.length) {
                const ev = sortedEvents[eventIdx];
                if (ev.occurred_at <= cutoff) {
                    applyEvent(state, ev);
                    eventIdx++;
                } else {
                    break;
                }
            }

            result.push({
                date: month,
                bookmarkCount: state.size,
                hasSnapshot: snapshotDateSet.has(month),
            });
        }

        return result;
    } catch (err) {
        console.error('[timelineService] getAvailableSnapshots error:', err.message);
        return [{ date: currentMonth(), bookmarkCount: 0, hasSnapshot: false }];
    }
};

// ============================================================
// getSnapshot
// ============================================================

/**
 * Returns graph data representing state at isoDate (YYYY-MM or YYYY-MM-DD).
 * Uses nearest pre-built snapshot + delta events model.
 * Falls back to live getAllBookmarks() if events table is empty.
 *
 * @param {string} isoDate — e.g. '2025-03' or '2025-03-15'
 * @returns {{ nodes: object[], links: object[], date: string }}
 */
const getSnapshot = async (isoDate) => {
    if (!isoDate) {
        // No date: return live graph state
        return getLiveGraph();
    }

    try {
        // Normalise: if YYYY-MM, use last moment of that month as cutoff
        let cutoffDate;
        if (/^\d{4}-\d{2}$/.test(isoDate)) {
            cutoffDate = lastMomentOfMonth(isoDate);
        } else {
            // Assume YYYY-MM-DD — use end of that day
            cutoffDate = `${isoDate} 23:59:59`;
        }

        // Check if events table has any data
        const eventCount = db.db.prepare('SELECT COUNT(*) AS cnt FROM bookmark_events').get();
        if (!eventCount || eventCount.cnt === 0) {
            // No events — fall back to live state (existing bookmarks pre-feature)
            return getLiveGraph(isoDate);
        }

        // 1. Find nearest pre-built snapshot at or before isoDate
        const preBuilt = db.db.prepare(`
            SELECT snapshot_date, data
            FROM graph_snapshots
            WHERE snapshot_date <= ?
            ORDER BY snapshot_date DESC
            LIMIT 1
        `).get(isoDate);

        let state = new Map();
        let snapshotCutoff = null;

        if (preBuilt) {
            // Restore state from pre-built snapshot
            const graphData = JSON.parse(preBuilt.data);
            snapshotCutoff = lastMomentOfMonth(preBuilt.snapshot_date);

            // Reconstruct state from bookmark nodes in snapshot
            for (const node of (graphData.nodes || [])) {
                if (node.type === 'bookmark') {
                    state.set(node.originalId, {
                        id: node.originalId,
                        title: node.name,
                        url: node.url,
                        tags: node.tags || [],
                        created_at: null,
                    });
                }
            }
        }

        // 2. Get delta events: from after snapshot date up to cutoffDate
        let deltaEvents;
        if (snapshotCutoff) {
            deltaEvents = db.db.prepare(`
                SELECT * FROM bookmark_events
                WHERE occurred_at > ? AND occurred_at <= ?
                ORDER BY occurred_at
            `).all(snapshotCutoff, cutoffDate);
        } else {
            deltaEvents = db.db.prepare(`
                SELECT * FROM bookmark_events
                WHERE occurred_at <= ?
                ORDER BY occurred_at
            `).all(cutoffDate);
        }

        // 3. Apply delta events
        for (const event of deltaEvents) {
            applyEvent(state, event);
        }

        return stateToGraph(state, isoDate);
    } catch (err) {
        console.error('[timelineService] getSnapshot error:', err.message);
        return { nodes: [], links: [], date: isoDate };
    }
};

/**
 * Returns current live graph state from all active bookmarks.
 * Used as fallback when no events exist yet.
 * @param {string} [dateLabel]
 * @returns {{ nodes: object[], links: object[], date: string }}
 */
const getLiveGraph = (dateLabel) => {
    const bookmarks = db.getAllBookmarks();
    const state = new Map();
    for (const bm of bookmarks) {
        state.set(bm.id, {
            id: bm.id,
            title: bm.title || '',
            url: bm.url || '',
            tags: bm.tags || [],
            created_at: bm.created_at,
        });
    }
    return stateToGraph(state, dateLabel || currentMonth());
};

// ============================================================
// buildMonthlySnapshots
// ============================================================

/**
 * Builds and caches monthly snapshots for all months with activity.
 * Idempotent — uses INSERT OR REPLACE. Safe to re-run.
 * Also synthesizes 'created' events for existing bookmarks if events table is empty.
 */
const buildMonthlySnapshots = async () => {
    try {
        console.log('[timelineService] buildMonthlySnapshots: starting...');

        // Check if events table is empty — synthesize events for all existing bookmarks
        const eventCount = db.db.prepare('SELECT COUNT(*) AS cnt FROM bookmark_events').get();
        if (!eventCount || eventCount.cnt === 0) {
            console.log('[timelineService] No events found. Synthesizing created events for existing bookmarks...');
            const bookmarks = db.getAllBookmarks();
            if (bookmarks.length === 0) {
                console.log('[timelineService] No bookmarks found. Nothing to snapshot.');
                return;
            }
            // Synthesize created events using each bookmark's created_at
            const insertEvent = db.db.prepare(`
                INSERT INTO bookmark_events (bookmark_id, event_type, payload, occurred_at)
                VALUES (?, 'created', ?, ?)
            `);
            const synthesize = db.db.transaction(() => {
                for (const bm of bookmarks) {
                    const payload = JSON.stringify({ title: bm.title, url: bm.url, tags: bm.tags });
                    insertEvent.run(bm.id, payload, bm.created_at);
                }
            });
            synthesize();
            console.log(`[timelineService] Synthesized ${bookmarks.length} created events.`);
        }

        // Get all events to determine month range
        const firstEvent = db.db.prepare('SELECT MIN(occurred_at) AS earliest FROM bookmark_events').get();
        if (!firstEvent || !firstEvent.earliest) {
            console.log('[timelineService] No events found after synthesis check. Aborting.');
            return;
        }

        const startMonth = toMonthKey(firstEvent.earliest);
        const endMonth = currentMonth();
        const months = monthRange(startMonth, endMonth);

        console.log(`[timelineService] Building snapshots for ${months.length} month(s): ${months[0]} → ${months[months.length - 1]}`);

        // Process chronologically — each month can use previous as base
        // We replay all events from scratch month by month for correctness
        const allEvents = db.db.prepare(
            'SELECT * FROM bookmark_events ORDER BY occurred_at'
        ).all();

        const state = new Map();
        let eventIdx = 0;

        for (const month of months) {
            const cutoff = lastMomentOfMonth(month);

            // Apply events up to end of this month
            while (eventIdx < allEvents.length && allEvents[eventIdx].occurred_at <= cutoff) {
                applyEvent(state, allEvents[eventIdx]);
                eventIdx++;
            }

            const graphData = stateToGraph(state, month);

            // Save snapshot (INSERT OR REPLACE — idempotent)
            db.saveSnapshot(month, graphData);
            console.log(`[timelineService]   Saved snapshot for ${month} (${state.size} bookmarks)`);
        }

        console.log('[timelineService] buildMonthlySnapshots: complete.');
    } catch (err) {
        console.error('[timelineService] buildMonthlySnapshots error:', err.message);
    }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = { getAvailableSnapshots, getSnapshot, buildMonthlySnapshots };
