const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('bookmarks.db');

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// CORE TABLES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        image TEXT,
        tags TEXT DEFAULT '[]',
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stack_items (
        stack_id INTEGER,
        bookmark_id INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (stack_id, bookmark_id),
        FOREIGN KEY(stack_id) REFERENCES stacks(id) ON DELETE CASCADE,
        FOREIGN KEY(bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
    );
`);

// ============================================================
// SAFE COLUMN MIGRATIONS (existing)
// ============================================================

// Migration: Safely add image column
try {
    const columns = db.prepare(`PRAGMA table_info(bookmarks)`).all();
    const hasImageCol = columns.some(c => c.name === 'image');
    if (!hasImageCol) {
        db.exec('ALTER TABLE bookmarks ADD COLUMN image TEXT');
        console.log("Migration: Added 'image' column to bookmarks table.");
    }
} catch (err) {
    console.error("Migration Error:", err.message);
}

// Migration for is_deleted column
try {
    db.prepare('ALTER TABLE bookmarks ADD COLUMN is_deleted INTEGER DEFAULT 0').run();
} catch (error) {
    if (!error.message.includes('duplicate column name')) {
        console.error('Migration failed:', error);
    }
}

// ============================================================
// NEW TABLES — Phase 1: FTS5 Full-Text Search
// ============================================================

try {
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
            title, description, tags, url,
            content='bookmarks', content_rowid='id'
        );
    `);
} catch (err) {
    if (!err.message.includes('already exists')) {
        console.error('FTS5 table creation error:', err.message);
    }
}

// ============================================================
// NEW TABLES — Phase 2: Time Machine
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS bookmark_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bookmark_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT DEFAULT '{}',
        occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS graph_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_bookmark ON bookmark_events(bookmark_id);`);
} catch (err) { /* index already exists */ }
try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_time ON bookmark_events(occurred_at);`);
} catch (err) { /* index already exists */ }

// ============================================================
// NEW TABLES — Phase 3: Semantic Similarity Cache
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS bookmark_similarities (
        bookmark_id_a INTEGER NOT NULL,
        bookmark_id_b INTEGER NOT NULL,
        score REAL NOT NULL,
        computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (bookmark_id_a, bookmark_id_b)
    );
`);

try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sim_a ON bookmark_similarities(bookmark_id_a, score DESC);`);
} catch (err) { /* index already exists */ }

// ============================================================
// NEW TABLES — Phase 4: Tag Clusters
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS tag_clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tag_cluster_members (
        cluster_id INTEGER NOT NULL REFERENCES tag_clusters(id) ON DELETE CASCADE,
        tag_name TEXT NOT NULL,
        is_auto INTEGER DEFAULT 1,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (cluster_id, tag_name)
    );
`);

// ============================================================
// FTS SYNC HELPERS
// ============================================================

const syncFTSInsert = (id, title, description, tags, url) => {
    try {
        db.prepare(`
            INSERT INTO bookmarks_fts(rowid, title, description, tags, url)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, title || '', description || '', tags || '', url || '');
    } catch (err) {
        console.error('FTS insert error:', err.message);
    }
};

const syncFTSUpdate = (id, title, description, tags, url) => {
    try {
        db.prepare(`
            INSERT OR REPLACE INTO bookmarks_fts(rowid, title, description, tags, url)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, title || '', description || '', tags || '', url || '');
    } catch (err) {
        console.error('FTS update error:', err.message);
    }
};

const syncFTSDelete = (id) => {
    try {
        db.prepare(`DELETE FROM bookmarks_fts WHERE rowid = ?`).run(id);
    } catch (err) {
        console.error('FTS delete error:', err.message);
    }
};

// Idempotent startup population of FTS for all existing bookmarks
try {
    const existing = db.prepare('SELECT id, title, description, tags, url FROM bookmarks WHERE is_deleted = 0').all();
    const insertFts = db.prepare(`
        INSERT OR IGNORE INTO bookmarks_fts(rowid, title, description, tags, url)
        VALUES (?, ?, ?, ?, ?)
    `);
    const populateFts = db.transaction(() => {
        for (const bm of existing) {
            const tagsStr = (() => {
                try { return JSON.parse(bm.tags || '[]').join(' '); } catch { return ''; }
            })();
            insertFts.run(bm.id, bm.title || '', bm.description || '', tagsStr, bm.url || '');
        }
    });
    populateFts();
    console.log(`FTS: Populated index for ${existing.length} existing bookmark(s).`);
} catch (err) {
    console.error('FTS population error:', err.message);
}

// ============================================================
// EVENT LOGGING
// ============================================================

const logEvent = (bookmarkId, eventType, payload = {}) => {
    try {
        db.prepare(`
            INSERT INTO bookmark_events (bookmark_id, event_type, payload)
            VALUES (?, ?, ?)
        `).run(bookmarkId, eventType, JSON.stringify(payload));
    } catch (err) {
        console.error('Event log error:', err.message);
    }
};

// ============================================================
// CORE BOOKMARK FUNCTIONS (with FTS + event hooks)
// ============================================================

const getBookmark = (id) => {
    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id);
    if (bookmark && bookmark.tags) {
        bookmark.tags = JSON.parse(bookmark.tags);
    }
    return bookmark;
};

// Get all bookmarks (active only)
const getAllBookmarks = () => {
    return db.prepare('SELECT * FROM bookmarks WHERE is_deleted = 0 ORDER BY created_at DESC').all().map(b => ({
        ...b,
        tags: JSON.parse(b.tags)
    }));
};

// Add a bookmark
const addBookmark = (bookmark) => {
    const { url, title, description, image, tags, email } = bookmark;
    const stmt = db.prepare(`
        INSERT INTO bookmarks (url, title, description, image, tags, email)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(url, title, description, image, tags, email);
    const id = info.lastInsertRowid;

    // Parse tags for FTS
    const parsedTags = (() => {
        try { return JSON.parse(tags || '[]'); } catch { return []; }
    })();
    syncFTSInsert(id, title, description, parsedTags.join(' '), url);
    logEvent(id, 'created', { url, title, tags: parsedTags });

    return { id, ...bookmark, tags: parsedTags };
};

// Update a bookmark
const updateBookmark = (id, updates) => {
    const { url, title, description, image, tags } = updates;
    const stmt = db.prepare(`
        UPDATE bookmarks
        SET url = ?, title = ?, description = ?, image = ?, tags = ?
        WHERE id = ?
    `);
    stmt.run(url, title, description, image, tags, id);

    const parsedTags = (() => {
        try { return JSON.parse(tags || '[]'); } catch { return []; }
    })();
    syncFTSUpdate(id, title, description, parsedTags.join(' '), url);
    logEvent(id, 'updated', {});

    return getBookmark(id);
};

// Update tags (proper db function — called from PATCH /api/bookmarks/:id/tags)
const updateTags = (id, tags) => {
    db.prepare('UPDATE bookmarks SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id);
    const bm = getBookmark(id);
    syncFTSUpdate(id, bm.title, bm.description, tags.join(' '), bm.url);
    logEvent(id, 'tag_updated', { tags });
};

// Soft Delete a bookmark
const deleteBookmark = (id) => {
    db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?').run(id);
    syncFTSDelete(id);
    logEvent(id, 'deleted', {});
    return { id };
};

// Restore a bookmark
const restoreBookmark = (id) => {
    db.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?').run(id);
    const bm = getBookmark(id);
    if (bm) {
        const tagsStr = Array.isArray(bm.tags) ? bm.tags.join(' ') : '';
        syncFTSInsert(id, bm.title, bm.description, tagsStr, bm.url);
        logEvent(id, 'restored', {});
    }
    return bm;
};

// ============================================================
// STACKS (with event hooks)
// ============================================================

const createStack = (name) => {
    const stmt = db.prepare('INSERT INTO stacks (name) VALUES (?)');
    const info = stmt.run(name);
    return { id: info.lastInsertRowid, name, items: [] };
};

const getStacks = () => {
    const stacks = db.prepare('SELECT * FROM stacks ORDER BY created_at DESC').all();
    const getItems = db.prepare(`
        SELECT b.*
        FROM bookmarks b
        JOIN stack_items si ON b.id = si.bookmark_id
        WHERE si.stack_id = ? AND b.is_deleted = 0
        ORDER BY si.added_at DESC
    `);
    return stacks.map(stack => ({
        ...stack,
        items: getItems.all(stack.id).map(b => ({ ...b, tags: JSON.parse(b.tags) }))
    }));
};

const addToStack = (stackId, bookmarkId) => {
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO stack_items (stack_id, bookmark_id) VALUES (?, ?)');
        stmt.run(stackId, bookmarkId);
        logEvent(bookmarkId, 'stack_added', { stackId });
        return { success: true };
    } catch (err) {
        console.error(err);
        throw err;
    }
};

const removeFromStack = (stackId, bookmarkId) => {
    const stmt = db.prepare('DELETE FROM stack_items WHERE stack_id = ? AND bookmark_id = ?');
    stmt.run(stackId, bookmarkId);
    logEvent(bookmarkId, 'stack_removed', { stackId });
    return { success: true };
};

const deleteStack = (id) => {
    const deleteItems = db.prepare('DELETE FROM stack_items WHERE stack_id = ?');
    const deleteStackStmt = db.prepare('DELETE FROM stacks WHERE id = ?');
    const transaction = db.transaction(() => {
        deleteItems.run(id);
        deleteStackStmt.run(id);
    });
    transaction();
    return { id };
};

// ============================================================
// BULK OPERATIONS
// ============================================================

const bulkDeleteBookmarks = (ids) => {
    const stmt = db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?');
    const transaction = db.transaction((bookmarkIds) => {
        for (const id of bookmarkIds) {
            stmt.run(id);
            syncFTSDelete(id);
            logEvent(id, 'deleted', {});
        }
    });
    transaction(ids);
    return { count: ids.length };
};

const bulkRestoreBookmarks = (ids) => {
    const stmt = db.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?');
    const transaction = db.transaction((bookmarkIds) => {
        for (const id of bookmarkIds) {
            stmt.run(id);
            const bm = getBookmark(id);
            if (bm) {
                const tagsStr = Array.isArray(bm.tags) ? bm.tags.join(' ') : '';
                syncFTSInsert(id, bm.title, bm.description, tagsStr, bm.url);
                logEvent(id, 'restored', {});
            }
        }
    });
    transaction(ids);
    return { count: ids.length };
};

const bulkAddToStack = (stackId, bookmarkIds) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO stack_items (stack_id, bookmark_id) VALUES (?, ?)');
    const transaction = db.transaction((bmIds) => {
        for (const id of bmIds) {
            stmt.run(stackId, id);
            logEvent(id, 'stack_added', { stackId });
        }
    });
    transaction(bookmarkIds);
    return { success: true, count: bookmarkIds.length };
};

// ============================================================
// TIMELINE / SNAPSHOT FUNCTIONS (Phase 2)
// ============================================================

const getEarliestBookmarkDate = () => {
    try {
        const row = db.prepare('SELECT MIN(created_at) AS earliest FROM bookmarks').get();
        return row ? row.earliest : null;
    } catch (err) {
        console.error('getEarliestBookmarkDate error:', err.message);
        return null;
    }
};

const getEventsInRange = (startDate, endDate) => {
    try {
        return db.prepare(`
            SELECT * FROM bookmark_events
            WHERE occurred_at BETWEEN ? AND ?
            ORDER BY occurred_at
        `).all(startDate, endDate);
    } catch (err) {
        console.error('getEventsInRange error:', err.message);
        return [];
    }
};

const getSnapshot = (date) => {
    try {
        const row = db.prepare('SELECT data FROM graph_snapshots WHERE snapshot_date = ?').get(date);
        return row ? JSON.parse(row.data) : null;
    } catch (err) {
        console.error('getSnapshot error:', err.message);
        return null;
    }
};

const saveSnapshot = (date, data) => {
    try {
        db.prepare(`
            INSERT OR REPLACE INTO graph_snapshots (snapshot_date, data)
            VALUES (?, ?)
        `).run(date, JSON.stringify(data));
    } catch (err) {
        console.error('saveSnapshot error:', err.message);
    }
};

const getAllSnapshots = () => {
    try {
        return db.prepare(`
            SELECT snapshot_date, created_at FROM graph_snapshots
            ORDER BY snapshot_date
        `).all();
    } catch (err) {
        console.error('getAllSnapshots error:', err.message);
        return [];
    }
};

// ============================================================
// SIMILARITY CACHE FUNCTIONS (Phase 3)
// ============================================================

const getSimilarities = (bookmarkId, limit = 5) => {
    try {
        return db.prepare(`
            SELECT b.id, b.title, b.url, b.image, s.score
            FROM bookmark_similarities s
            JOIN bookmarks b ON b.id = s.bookmark_id_b
            WHERE s.bookmark_id_a = ? AND b.is_deleted = 0
            ORDER BY s.score DESC
            LIMIT ?
        `).all(bookmarkId, limit);
    } catch (err) {
        console.error('getSimilarities error:', err.message);
        return [];
    }
};

const upsertSimilarities = (pairs) => {
    // pairs = [{ a, b, score }]
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO bookmark_similarities (bookmark_id_a, bookmark_id_b, score, computed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const transaction = db.transaction((ps) => {
            for (const { a, b, score } of ps) {
                stmt.run(a, b, score);
            }
        });
        transaction(pairs);
    } catch (err) {
        console.error('upsertSimilarities error:', err.message);
    }
};

const getLastSimilarityComputed = () => {
    try {
        const row = db.prepare('SELECT MAX(computed_at) AS last_computed FROM bookmark_similarities').get();
        return row ? row.last_computed : null;
    } catch (err) {
        console.error('getLastSimilarityComputed error:', err.message);
        return null;
    }
};

const clearSimilarities = () => {
    try {
        db.prepare('DELETE FROM bookmark_similarities').run();
    } catch (err) {
        console.error('clearSimilarities error:', err.message);
    }
};

// ============================================================
// CLUSTER MANAGEMENT FUNCTIONS (Phase 4)
// ============================================================

const getClusters = () => {
    try {
        const clusters = db.prepare('SELECT * FROM tag_clusters ORDER BY created_at DESC').all();
        const getMembers = db.prepare(`
            SELECT tag_name, is_auto, added_at
            FROM tag_cluster_members
            WHERE cluster_id = ?
            ORDER BY tag_name
        `);
        return clusters.map(cluster => ({
            ...cluster,
            tags: getMembers.all(cluster.id)
        }));
    } catch (err) {
        console.error('getClusters error:', err.message);
        return [];
    }
};

const createCluster = (name, color = '#6366f1') => {
    try {
        const info = db.prepare('INSERT INTO tag_clusters (name, color) VALUES (?, ?)').run(name, color);
        return { id: info.lastInsertRowid, name, color, tags: [] };
    } catch (err) {
        console.error('createCluster error:', err.message);
        throw err;
    }
};

const deleteCluster = (id) => {
    try {
        db.prepare('DELETE FROM tag_clusters WHERE id = ?').run(id);
        return { id };
    } catch (err) {
        console.error('deleteCluster error:', err.message);
        throw err;
    }
};

const updateCluster = (id, name, color) => {
    try {
        db.prepare('UPDATE tag_clusters SET name = ?, color = ? WHERE id = ?').run(name, color, id);
        return getClusters().find(c => c.id === id) || null;
    } catch (err) {
        console.error('updateCluster error:', err.message);
        throw err;
    }
};

const addTagToCluster = (clusterId, tagName, isAuto = 0) => {
    try {
        db.prepare(`
            INSERT OR IGNORE INTO tag_cluster_members (cluster_id, tag_name, is_auto)
            VALUES (?, ?, ?)
        `).run(clusterId, tagName, isAuto ? 1 : 0);
        return { success: true };
    } catch (err) {
        console.error('addTagToCluster error:', err.message);
        throw err;
    }
};

const removeTagFromCluster = (clusterId, tagName) => {
    try {
        db.prepare('DELETE FROM tag_cluster_members WHERE cluster_id = ? AND tag_name = ?').run(clusterId, tagName);
        return { success: true };
    } catch (err) {
        console.error('removeTagFromCluster error:', err.message);
        throw err;
    }
};

const clearAutoClusters = () => {
    try {
        const clearAuto = db.transaction(() => {
            // Remove all auto-assigned tags
            db.prepare('DELETE FROM tag_cluster_members WHERE is_auto = 1').run();
            // Delete clusters that are now empty
            db.prepare(`
                DELETE FROM tag_clusters
                WHERE id NOT IN (SELECT DISTINCT cluster_id FROM tag_cluster_members)
            `).run();
        });
        clearAuto();
    } catch (err) {
        console.error('clearAutoClusters error:', err.message);
        throw err;
    }
};

const saveClusters = (clusters) => {
    // clusters = [{ name, color, tags: [tagName, ...] }]
    try {
        const insertCluster = db.prepare('INSERT INTO tag_clusters (name, color) VALUES (?, ?)');
        const insertMember = db.prepare(`
            INSERT OR IGNORE INTO tag_cluster_members (cluster_id, tag_name, is_auto)
            VALUES (?, ?, 1)
        `);
        const save = db.transaction(() => {
            clearAutoClusters();
            for (const cluster of clusters) {
                const info = insertCluster.run(cluster.name, cluster.color || '#6366f1');
                const cid = info.lastInsertRowid;
                for (const tag of (cluster.tags || [])) {
                    insertMember.run(cid, tag);
                }
            }
        });
        save();
    } catch (err) {
        console.error('saveClusters error:', err.message);
        throw err;
    }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    // Core bookmark operations
    getAllBookmarks,
    addBookmark,
    deleteBookmark,
    updateBookmark,
    updateTags,
    restoreBookmark,
    getBookmark,

    // Bulk operations
    bulkDeleteBookmarks,
    bulkRestoreBookmarks,
    bulkAddToStack,

    // Stack operations
    createStack,
    getStacks,
    addToStack,
    removeFromStack,
    deleteStack,

    // FTS sync helpers
    syncFTSInsert,
    syncFTSUpdate,
    syncFTSDelete,

    // Event logging
    logEvent,

    // Timeline / snapshot (Phase 2)
    getEarliestBookmarkDate,
    getEventsInRange,
    getSnapshot,
    saveSnapshot,
    getAllSnapshots,

    // Similarity cache (Phase 3)
    getSimilarities,
    upsertSimilarities,
    getLastSimilarityComputed,
    clearSimilarities,

    // Cluster management (Phase 4)
    getClusters,
    createCluster,
    deleteCluster,
    updateCluster,
    addTagToCluster,
    removeTagFromCluster,
    clearAutoClusters,
    saveClusters,

    // Raw db instance for services that need it
    db,
};
