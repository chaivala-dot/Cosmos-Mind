const express = require('express');
const cors = require('cors');
const db = require('./db');
const { getMetadata } = require('./metadata');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API Routes

// GET all bookmarks
app.get('/api/bookmarks', (req, res) => {
    try {
        const bookmarks = db.getAllBookmarks();
        res.json(bookmarks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new bookmark
app.post('/api/bookmarks', async (req, res) => {
    const { url, title, description, tags, email } = req.body;
    try {
        let metaTitle = title;
        let metaDesc = description;
        let metaImage = '';
        let fetchedTags = [];

        // Fetch Metadata & Auto-tags
        const metadata = await getMetadata(url);
        metaTitle = metaTitle || metadata.title;
        metaDesc = metaDesc || metadata.description;
        metaImage = metadata.image;
        fetchedTags = metadata.suggestedTags || [];

        // Merge User Tags with Auto Tags
        const allTags = Array.from(new Set([...(tags || []).map(t => t.toLowerCase()), ...fetchedTags.map(t => t.toLowerCase())]));

        const newBookmark = db.addBookmark({
            url,
            title: metaTitle,
            description: metaDesc,
            image: metaImage,
            tags: JSON.stringify(allTags),
            email
        });
        res.status(201).json(newBookmark);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH update tags
app.patch('/api/bookmarks/:id/tags', (req, res) => {
    try {
        const { tags } = req.body;
        db.updateTags(req.params.id, tags);
        res.json({ message: 'Tags updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update bookmark
app.put('/api/bookmarks/:id', (req, res) => {
    try {
        const { url, title, description, image, tags } = req.body;
        const updated = db.updateBookmark(req.params.id, {
            url,
            title,
            description,
            image,
            tags: JSON.stringify((tags || []).map(t => t.toLowerCase()))
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE bookmark
app.delete('/api/bookmarks/:id', (req, res) => {
    try {
        db.deleteBookmark(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookmarks/:id/restore', (req, res) => {
    try {
        const bookmark = db.restoreBookmark(req.params.id);
        res.json(bookmark);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookmarks/bulk/delete', (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) throw new Error("ids must be an array");
        const result = db.bulkDeleteBookmarks(ids);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookmarks/bulk/restore', (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) throw new Error("ids must be an array");
        const result = db.bulkRestoreBookmarks(ids);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stacks/:id/bulk-add', (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) throw new Error("ids must be an array");
        const result = db.bulkAddToStack(req.params.id, ids);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- STACK ROUTES ---

app.get('/api/stacks', (req, res) => {
    try {
        const stacks = db.getStacks();
        res.json(stacks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stacks', (req, res) => {
    try {
        const { name } = req.body;
        const newStack = db.createStack(name);
        res.status(201).json(newStack);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/stacks/:id', (req, res) => {
    try {
        db.deleteStack(req.params.id);
        res.json({ message: 'Stack deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stacks/:id/items', (req, res) => {
    try {
        const { bookmarkId } = req.body;
        db.addToStack(req.params.id, bookmarkId);
        res.json({ message: 'Added to stack' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/stacks/:id/items/:bookmarkId', (req, res) => {
    try {
        db.removeFromStack(req.params.id, req.params.bookmarkId);
        res.json({ message: 'Removed from stack' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- EXPORT / IMPORT ROUTES ---

app.get('/api/export', (req, res) => {
    try {
        const { exportData } = require('./export');
        const data = exportData();
        res.header('Content-Type', 'application/json');
        res.attachment(`cosmos-mind-export-${new Date().toISOString().split('T')[0]}.json`);
        res.send(JSON.stringify(data, null, 2));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import', (req, res) => {
    try {
        const { importData } = require('./export');
        const result = importData(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
