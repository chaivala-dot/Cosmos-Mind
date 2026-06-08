const express = require('express');
const cors = require('cors');
const db = require('./db');
const { getMetadata } = require('./metadata');

// Service stubs — each feature agent fills these in
const searchService = require('./services/searchService');
const timelineService = require('./services/timelineService');
const embeddingService = require('./services/embeddingService');
const clusterService = require('./services/clusterService');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ============================================================
// BOOKMARK ROUTES (existing — preserved exactly)
// ============================================================

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

// PATCH update tags — calls db.updateTags() (proper db function)
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

// ============================================================
// STACK ROUTES (existing — preserved exactly)
// ============================================================

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

// ============================================================
// EXPORT / IMPORT ROUTES (existing — preserved exactly)
// ============================================================

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

// ============================================================
// SEARCH ROUTES (Phase 1 — Agent 1 implements searchService)
// ============================================================

app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ bookmarks: [], tags: [], stacks: [] });
        }
        const results = await searchService.search(q.trim());
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// TIMELINE ROUTES (Phase 2 — Agent 2 implements timelineService)
// ============================================================

app.get('/api/timeline/snapshots', async (req, res) => {
    try {
        const snapshots = await timelineService.getAvailableSnapshots();
        res.json(snapshots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/timeline/snapshot', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required' });
        const snapshot = await timelineService.getSnapshot(date);
        res.json(snapshot);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/timeline/build', async (req, res) => {
    try {
        timelineService.buildMonthlySnapshots(); // fire and forget, non-blocking
        res.json({ status: 'building' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// SEMANTIC ROUTES (Phase 3 — Agent 3 implements embeddingService)
// ============================================================

app.get('/api/bookmarks/:id/related', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const related = db.getSimilarities(id, 5);
        // If no cached results, trigger async compute and return empty immediately
        if (related.length === 0) {
            const bookmarks = db.getAllBookmarks();
            embeddingService.computeAllSimilarities(bookmarks).catch(console.error); // non-blocking
            return res.json([]);
        }
        res.json(related);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/embeddings/compute', async (req, res) => {
    try {
        const bookmarks = db.getAllBookmarks();
        embeddingService.computeAllSimilarities(bookmarks).catch(console.error); // async, non-blocking
        res.json({ status: 'computing', provider: embeddingService.getProviderName(), bookmarkCount: bookmarks.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/embeddings/status', async (req, res) => {
    try {
        const lastComputed = await embeddingService.getLastComputed();
        res.json({ provider: embeddingService.getProviderName(), lastComputed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// CLUSTER ROUTES (Phase 4 — Agent 4 implements clusterService)
// ============================================================

app.get('/api/clusters', async (req, res) => {
    try {
        const clusters = db.getClusters();
        res.json(clusters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clusters/compute', async (req, res) => {
    try {
        const bookmarks = db.getAllBookmarks();

        // Gather similarity data if available (top-3 per bookmark, first 50 bookmarks)
        let similarities = [];
        try {
            const lastComputed = db.getLastSimilarityComputed();
            if (lastComputed) {
                bookmarks.slice(0, 50).forEach(b => {
                    const s = db.getSimilarities(b.id, 3);
                    s.forEach(r => similarities.push({ a: b.id, b: r.id, score: r.score }));
                });
            }
        } catch (e) { /* similarity data not available, skip */ }

        const computedClusters = await clusterService.computeClusters(bookmarks, similarities);
        db.saveClusters(computedClusters);
        res.json(db.getClusters());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clusters', async (req, res) => {
    try {
        const { name, color } = req.body;
        const cluster = db.createCluster(name, color || '#6366f1');
        res.status(201).json(cluster);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clusters/:id', async (req, res) => {
    try {
        const { name, color } = req.body;
        const cluster = db.updateCluster(Number(req.params.id), name, color);
        res.json(cluster);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clusters/:id', async (req, res) => {
    try {
        db.deleteCluster(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clusters/:id/tags', async (req, res) => {
    try {
        const { tagName, tag } = req.body;
        const resolvedTag = tagName || tag;
        if (!resolvedTag) return res.status(400).json({ error: 'tagName is required' });
        db.addTagToCluster(Number(req.params.id), resolvedTag, 0);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clusters/:id/tags/:tag', async (req, res) => {
    try {
        db.removeTagFromCluster(Number(req.params.id), req.params.tag);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
