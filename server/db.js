const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('bookmarks.db');

// Initialize Table
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
    )
`);

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
    return { id: info.lastInsertRowid, ...bookmark, tags: JSON.parse(bookmark.tags) };
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
    return getBookmark(id);
};

// Soft Delete a bookmark
const deleteBookmark = (id) => {
    db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?').run(id);
    return { id };
};

// Restore a bookmark
const restoreBookmark = (id) => {
    db.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?').run(id);
    return getBookmark(id);
};

// --- STACKS (COLLECTIONS) ---

// Initialize Stacks Tables
db.exec(`
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

const createStack = (name) => {
    const stmt = db.prepare('INSERT INTO stacks (name) VALUES (?)');
    const info = stmt.run(name);
    return { id: info.lastInsertRowid, name, items: [] };
};

const getStacks = () => {
    const stacks = db.prepare('SELECT * FROM stacks ORDER BY created_at DESC').all();

    // Get items for each stack
    // We only include items that are not deleted from bookmarks
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
        return { success: true };
    } catch (err) {
        console.error(err);
        throw err;
    }
};

const removeFromStack = (stackId, bookmarkId) => {
    const stmt = db.prepare('DELETE FROM stack_items WHERE stack_id = ? AND bookmark_id = ?');
    stmt.run(stackId, bookmarkId);
    return { success: true };
};

const deleteStack = (id) => {
    const deleteItems = db.prepare('DELETE FROM stack_items WHERE stack_id = ?');
    const deleteStack = db.prepare('DELETE FROM stacks WHERE id = ?');

    const transaction = db.transaction(() => {
        deleteItems.run(id);
        deleteStack.run(id);
    });

    transaction();
    return { id };
};

// --- BULK OPERATIONS ---

const bulkDeleteBookmarks = (ids) => {
    const stmt = db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?');
    const transaction = db.transaction((bookmarkIds) => {
        for (const id of bookmarkIds) stmt.run(id);
    });
    transaction(ids);
    return { count: ids.length };
};

const bulkRestoreBookmarks = (ids) => {
    const stmt = db.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?');
    const transaction = db.transaction((bookmarkIds) => {
        for (const id of bookmarkIds) stmt.run(id);
    });
    transaction(ids);
    return { count: ids.length };
};

const bulkAddToStack = (stackId, bookmarkIds) => {
    const stmt = db.prepare('INSERT OR IGNORE INTO stack_items (stack_id, bookmark_id) VALUES (?, ?)');
    const transaction = db.transaction((bmIds) => {
        for (const id of bmIds) stmt.run(stackId, id);
    });
    transaction(bookmarkIds);
    return { success: true, count: bookmarkIds.length };
};

module.exports = {
    getAllBookmarks,
    addBookmark,
    deleteBookmark,
    updateBookmark,
    restoreBookmark,
    bulkDeleteBookmarks,
    bulkRestoreBookmarks,
    getBookmark,
    createStack,
    getStacks,
    addToStack,
    bulkAddToStack,
    removeFromStack,
    deleteStack
};
