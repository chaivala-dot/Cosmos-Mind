const fs = require('fs');
const path = require('path');
const db = require('./db');
const { getMetadata } = require('./metadata');

const DATA_FILE = path.join(__dirname, '../ai_tools_database.json');

const importTools = async () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            console.error('Database file not found:', DATA_FILE);
            return;
        }

        const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
        const tools = JSON.parse(rawData);

        console.log(`Found ${tools.length} tools to process...`);

        // Get existing URLs to avoid duplicates
        const existingBookmarks = db.getAllBookmarks();
        const existingUrls = new Set(existingBookmarks.map(b => b.url));

        let addedCount = 0;
        let skippedCount = 0;

        // Process in chunks to be nice/safe
        for (const tool of tools) {
            if (existingUrls.has(tool.url)) {
                skippedCount++;
                process.stdout.write('S'); // S for Skipped
                continue;
            }

            console.log(`\nImporting: ${tool.name} (${tool.url})`);

            // Fetch Metadata for Image & Description
            let meta = { description: '', image: '', suggestedTags: [] };
            try {
                // Add a small delay to avoid rate limiting
                await new Promise(r => setTimeout(r, 1000));
                meta = await getMetadata(tool.url);
            } catch (err) {
                console.warn(`  Failed to fetch metadata: ${err.message}`);
            }

            // Combine Tags
            const jsonTags = tool.tags ? tool.tags.split(',').map(t => t.trim().toLowerCase()) : [];
            const suggestedTags = meta.suggestedTags.map(t => t.toLowerCase());
            const allTags = Array.from(new Set([...jsonTags, ...suggestedTags]));

            const newBookmark = {
                url: tool.url,
                title: tool.name || meta.title,
                description: meta.description || `AI tool for ${jsonTags.join(', ')}`,
                image: meta.image || '',
                tags: JSON.stringify(allTags),
                email: 'system' // or null
            };

            db.addBookmark(newBookmark);
            addedCount++;
            process.stdout.write('.'); // . for Success
        }

        console.log(`\n\nImport Complete!`);
        console.log(`Added: ${addedCount}`);
        console.log(`Skipped: ${skippedCount}`);

    } catch (err) {
        console.error('Import failed:', err);
    }
};

importTools();
