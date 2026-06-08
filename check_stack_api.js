async function testStacks() {
    const BASE_URL = 'http://localhost:3000/api';
    let stackId;
    let bookmarkId;

    async function request(url, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(url, options);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Request failed: ${res.status} ${text}`);
        }
        return res.json();
    }

    try {
        console.log("1. Creating a stack...");
        const stack = await request(`${BASE_URL}/stacks`, 'POST', { name: "Test Stack" });
        stackId = stack.id;
        console.log("Stack created:", stack);

        console.log("2. Creating a bookmark to add...");
        const bm = await request(`${BASE_URL}/bookmarks`, 'POST', { url: "https://example.com/test", title: "Test BM" });
        bookmarkId = bm.id;
        console.log("Bookmark created:", bm);

        console.log("3. Adding bookmark to stack...");
        await request(`${BASE_URL}/stacks/${stackId}/items`, 'POST', { bookmarkId });
        console.log("Added to stack.");

        console.log("4. Fetching stacks to verify...");
        const stacks = await request(`${BASE_URL}/stacks`);
        const foundStack = stacks.find(s => s.id === stackId);

        if (foundStack && foundStack.items.some(i => i.id === bookmarkId)) {
            console.log("Verification SUCCESS: Bookmark found in stack.");
        } else {
            console.error("Verification FAILED: Bookmark not found in stack.", foundStack);
        }

        console.log("5. Removing from stack...");
        await request(`${BASE_URL}/stacks/${stackId}/items/${bookmarkId}`, 'DELETE');
        console.log("Removed from stack.");

        console.log("6. Deleting stack...");
        // API requires stack ID in URL. Wait, index.js says:
        // app.delete('/api/stacks/:id', ...
        await request(`${BASE_URL}/stacks/${stackId}`, 'DELETE');
        console.log("Stack deleted.");

        // Cleanup bookmark
        await request(`${BASE_URL}/bookmarks/${bookmarkId}`, 'DELETE');

    } catch (err) {
        console.error("Error:", err.message);
    }
}

testStacks();
