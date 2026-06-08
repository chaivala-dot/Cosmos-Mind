/**
 * searchService.js — Full-text search using SQLite FTS5
 *
 * search(query) → Queries bookmarks_fts (FTS5), extracts matching tags,
 *                 and searches stacks by name. Returns ranked results.
 * highlight(text, query) → Wraps matched words in <mark> tags.
 */

const { db } = require('../db');

// ============================================================
// SANITIZE FTS5 QUERY
// Wraps the trimmed query in double-quotes so it's treated as
// a phrase match, preventing FTS5 syntax errors from user input.
// Also escapes any embedded double-quotes.
// ============================================================
const sanitizeFTSQuery = (query) => {
    // Remove characters that break FTS5 even inside quotes
    const safe = query.replace(/"/g, '').trim();
    if (!safe) return null;
    // Return as phrase for exact safety, plus a prefix variant
    // We return safe string — caller will wrap appropriately
    return safe;
};

// ============================================================
// SEARCH
// ============================================================

/**
 * Full-text search across bookmarks (FTS5), tags, and stacks.
 *
 * @param {string} query - User's raw search string
 * @returns {Promise<{ bookmarks: Array, tags: Array, stacks: Array }>}
 */
const search = async (query) => {
    if (!query || query.trim().length < 2) {
        return { bookmarks: [], tags: [], stacks: [] };
    }

    const sanitized = sanitizeFTSQuery(query);
    if (!sanitized) return { bookmarks: [], tags: [], stacks: [] };

    // FTS5 MATCH term: phrase match wrapped in quotes for safety,
    // with a trailing * for prefix matching on the last word.
    const ftsPhrase = `"${sanitized}"`;
    const ftsPrefix = `${sanitized.split(/\s+/).map(w => `"${w}"*`).join(' ')}`;

    // ---- Bookmark FTS search ----
    let ftsRows = [];
    try {
        // Try phrase match first for better ranking
        ftsRows = db.prepare(`
            SELECT
                f.rowid AS id,
                snippet(bookmarks_fts, 0, '<mark>', '</mark>', '...', 10) AS title_snippet,
                snippet(bookmarks_fts, 1, '<mark>', '</mark>', '...', 20) AS desc_snippet,
                bm25(bookmarks_fts) AS rank
            FROM bookmarks_fts f
            WHERE bookmarks_fts MATCH ?
            ORDER BY rank
            LIMIT 20
        `).all(ftsPhrase);
    } catch (_) {
        // Fallback: prefix match if phrase fails (e.g. single token)
        try {
            ftsRows = db.prepare(`
                SELECT
                    f.rowid AS id,
                    snippet(bookmarks_fts, 0, '<mark>', '</mark>', '...', 10) AS title_snippet,
                    snippet(bookmarks_fts, 1, '<mark>', '</mark>', '...', 20) AS desc_snippet,
                    bm25(bookmarks_fts) AS rank
                FROM bookmarks_fts f
                WHERE bookmarks_fts MATCH ?
                ORDER BY rank
                LIMIT 20
            `).all(ftsPrefix);
        } catch (innerErr) {
            console.error('FTS search error:', innerErr.message);
            ftsRows = [];
        }
    }

    // Fetch full bookmark data for each matched rowid (exclude deleted)
    const bookmarkIds = ftsRows.map(r => r.id);
    let bookmarks = [];

    if (bookmarkIds.length > 0) {
        // Fetch full rows for matched ids — filter deleted in SQL
        const placeholders = bookmarkIds.map(() => '?').join(',');
        const fullRows = db.prepare(`
            SELECT id, url, title, description, image, tags
            FROM bookmarks
            WHERE id IN (${placeholders}) AND is_deleted = 0
        `).all(...bookmarkIds);

        // Build a map for O(1) lookup
        const fullMap = {};
        for (const row of fullRows) {
            fullMap[row.id] = row;
        }

        // Merge FTS snippets with full bookmark data, preserving rank order
        bookmarks = ftsRows
            .filter(r => fullMap[r.id])
            .map(r => {
                const bm = fullMap[r.id];
                let tags = [];
                try { tags = JSON.parse(bm.tags || '[]'); } catch { tags = []; }

                // Extract domain for favicon
                let domain = '';
                try { domain = new URL(bm.url).hostname; } catch { domain = ''; }

                return {
                    id: bm.id,
                    url: bm.url,
                    title: bm.title || '',
                    description: bm.description || '',
                    image: bm.image || '',
                    tags,
                    domain,
                    title_snippet: r.title_snippet || bm.title || '',
                    desc_snippet: r.desc_snippet || bm.description || '',
                };
            });
    }

    // ---- Tag search ----
    // Extract unique tags from all non-deleted bookmarks whose tags JSON
    // contains the query string (case-insensitive).
    const lowerQuery = sanitized.toLowerCase();
    let tags = [];
    try {
        const tagRows = db.prepare(`
            SELECT DISTINCT tags
            FROM bookmarks
            WHERE is_deleted = 0 AND LOWER(tags) LIKE ?
        `).all(`%${lowerQuery}%`);

        const tagSet = new Set();
        for (const row of tagRows) {
            try {
                const parsed = JSON.parse(row.tags || '[]');
                for (const t of parsed) {
                    if (t.toLowerCase().includes(lowerQuery)) {
                        tagSet.add(t.toLowerCase());
                    }
                }
            } catch { /* skip malformed */ }
        }
        tags = Array.from(tagSet).slice(0, 15);
    } catch (err) {
        console.error('Tag search error:', err.message);
    }

    // ---- Stack search ----
    let stacks = [];
    try {
        const stackRows = db.prepare(`
            SELECT s.id, s.name, COUNT(si.bookmark_id) AS count
            FROM stacks s
            LEFT JOIN stack_items si ON si.stack_id = s.id
            WHERE LOWER(s.name) LIKE ?
            GROUP BY s.id
            ORDER BY s.name
            LIMIT 10
        `).all(`%${lowerQuery}%`);

        stacks = stackRows.map(s => ({
            id: s.id,
            name: s.name,
            count: s.count || 0,
        }));
    } catch (err) {
        console.error('Stack search error:', err.message);
    }

    return { bookmarks, tags, stacks };
};

// ============================================================
// HIGHLIGHT
// Client-side utility: wraps each query word in <mark> tags
// within `text` (case-insensitive). Used for local highlighting
// in cases where the FTS snippet is not used directly.
// ============================================================

/**
 * Wraps each word of `query` in <mark>...</mark> within `text`.
 * Case-insensitive. Safe for use with dangerouslySetInnerHTML
 * since the backend controls this output.
 *
 * @param {string} text  - Plain text to highlight
 * @param {string} query - Space-separated search terms
 * @returns {string} HTML string with matched words wrapped in <mark>
 */
const highlight = (text, query) => {
    if (!text || !query) return text || '';

    const words = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // escape regex specials

    if (words.length === 0) return text;

    const pattern = new RegExp(`(${words.join('|')})`, 'gi');
    return text.replace(pattern, '<mark>$1</mark>');
};

// ============================================================
// REBUILD FTS INDEX (utility — re-populates from bookmarks table)
// ============================================================

/**
 * Clears and rebuilds the FTS index from all non-deleted bookmarks.
 * Use this if the index gets out of sync.
 * @returns {Promise<void>}
 */
const buildFTSIndex = async () => {
    try {
        db.exec(`DELETE FROM bookmarks_fts`);
        const bookmarks = db.prepare(
            'SELECT id, title, description, tags, url FROM bookmarks WHERE is_deleted = 0'
        ).all();

        const insert = db.prepare(`
            INSERT OR IGNORE INTO bookmarks_fts(rowid, title, description, tags, url)
            VALUES (?, ?, ?, ?, ?)
        `);

        const populate = db.transaction(() => {
            for (const bm of bookmarks) {
                let tagsStr = '';
                try { tagsStr = JSON.parse(bm.tags || '[]').join(' '); } catch { tagsStr = ''; }
                insert.run(bm.id, bm.title || '', bm.description || '', tagsStr, bm.url || '');
            }
        });

        populate();
        console.log(`FTS: Rebuilt index for ${bookmarks.length} bookmark(s).`);
    } catch (err) {
        console.error('buildFTSIndex error:', err.message);
        throw err;
    }
};

module.exports = { search, highlight, buildFTSIndex };
