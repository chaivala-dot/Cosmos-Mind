const db = require('./db');

const exportData = () => {
    const bookmarks = db.getAllBookmarks();
    const stacks = db.getStacks();

    return {
        metadata: {
            app: "Cosmos Mind",
            version: "1.0.0",
            exportDate: new Date().toISOString()
        },
        bookmarks,
        stacks
    };
};

const importData = (data) => {
    let addedBookmarks = 0;
    let addedStacks = 0;
    let errors = [];

    // 1. Import Bookmarks
    if (data.bookmarks && Array.isArray(data.bookmarks)) {
        const existing = db.getAllBookmarks();
        const existingUrls = new Set(existing.map(b => b.url));

        data.bookmarks.forEach(b => {
            if (!existingUrls.has(b.url)) {
                try {
                    db.addBookmark({
                        url: b.url,
                        title: b.title || '',
                        description: b.description || '',
                        image: b.image || '',
                        tags: JSON.stringify(b.tags || []),
                        email: b.email || null
                    });
                    addedBookmarks++;
                } catch (err) {
                    errors.push(`Failed to add bookmark ${b.url}: ${err.message}`);
                }
            }
        });
    }

    // 2. Import Stacks
    if (data.stacks && Array.isArray(data.stacks)) {
        data.stacks.forEach(s => {
            try {
                // Check if stack exists (by name) - simple dedup
                const existingStacks = db.getStacks(); // This gets all stacks every time, slightly inefficient but safe
                let stackId = existingStacks.find(ex => ex.name === s.name)?.id;

                if (!stackId) {
                    const newStack = db.createStack(s.name);
                    stackId = newStack.id;
                    addedStacks++;
                }

                // Add items to stack
                if (s.items && Array.isArray(s.items)) {
                    s.items.forEach(item => {
                        // Find bookmark ID by URL
                        const bookmark = db.getAllBookmarks().find(b => b.url === item.url);
                        if (bookmark) {
                            db.addToStack(stackId, bookmark.id);
                        }
                    });
                }
            } catch (err) {
                errors.push(`Failed to process stack ${s.name}: ${err.message}`);
            }
        });
    }

    return { addedBookmarks, addedStacks, errors };
};

module.exports = { exportData, importData };
