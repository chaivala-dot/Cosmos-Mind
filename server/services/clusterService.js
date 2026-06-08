/**
 * clusterService.js — Phase 4 Implementation
 * Automatic tag clustering using co-occurrence + Jaccard similarity,
 * optionally enhanced by semantic similarity data from Phase 3.
 */

// Palette for auto-generated cluster colors
const CLUSTER_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
    '#f97316', '#a855f7', '#06b6d4', '#84cc16'
];

/**
 * Generate a cluster name from a list of tags.
 * Uses the alphabetically-first tag as the cluster name.
 * @param {string[]} tags
 * @returns {string}
 */
const generateClusterName = (tags) => {
    if (!tags || tags.length === 0) return 'Unnamed';
    return [...tags].sort()[0];
};

/**
 * Computes auto-clusters from bookmark tag data and optional pre-computed similarities.
 *
 * Algorithm:
 *  1. Build tag co-occurrence matrix from all bookmarks
 *  2. Compute Jaccard similarity between each tag pair
 *  3. Greedy cluster assignment (most-frequent tags become seeds)
 *  4. Optional semantic enhancement: merge clusters bridged by highly similar bookmarks
 *  5. Filter empty clusters, assign names and colors
 *
 * @param {Array<{ id: number, tags: string[], title: string }>} bookmarks
 * @param {Array<{ a: number, b: number, score: number }>} similarities
 * @returns {Promise<Array<{ name: string, color: string, tags: string[] }>>}
 */
const computeClusters = async (bookmarks, similarities = []) => {
    if (!bookmarks || bookmarks.length === 0) return [];

    // -------------------------------------------------------
    // Step 1: Build co-occurrence matrix and tag document counts
    // -------------------------------------------------------
    const allTags = new Set();
    const coOccurrence = {}; // { tagA: { tagB: count } }
    const tagDocCount = {};  // { tag: bookmarkCount }

    bookmarks.forEach(bookmark => {
        // Normalize tags: lowercase, trim, filter empties
        const rawTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
        const tags = [...new Set(rawTags.map(t => t.toLowerCase().trim()).filter(Boolean))];

        tags.forEach(tag => {
            allTags.add(tag);
            tagDocCount[tag] = (tagDocCount[tag] || 0) + 1;
            if (!coOccurrence[tag]) coOccurrence[tag] = {};
        });

        // Build co-occurrence pairs for this bookmark
        for (let i = 0; i < tags.length; i++) {
            for (let j = i + 1; j < tags.length; j++) {
                const tagA = tags[i];
                const tagB = tags[j];
                coOccurrence[tagA][tagB] = (coOccurrence[tagA][tagB] || 0) + 1;
                if (!coOccurrence[tagB]) coOccurrence[tagB] = {};
                coOccurrence[tagB][tagA] = (coOccurrence[tagB][tagA] || 0) + 1;
            }
        }
    });

    const tags = Array.from(allTags);
    if (tags.length === 0) return [];

    // -------------------------------------------------------
    // Step 2: Jaccard similarity function
    // Jaccard(A, B) = co-occurrence(A,B) / (docCount(A) + docCount(B) - co-occurrence(A,B))
    // -------------------------------------------------------
    const jaccardSim = (tagA, tagB) => {
        const cooc = (coOccurrence[tagA] && coOccurrence[tagA][tagB]) || 0;
        if (cooc === 0) return 0;
        const union = tagDocCount[tagA] + tagDocCount[tagB] - cooc;
        return union <= 0 ? 0 : cooc / union;
    };

    // -------------------------------------------------------
    // Step 3: Greedy clustering
    // Threshold: tags with avg Jaccard > 0.2 to a cluster join it, else start new cluster
    // -------------------------------------------------------
    const JACCARD_THRESHOLD = 0.2;
    const assigned = new Map(); // tag -> clusterIndex
    const clusters = [];        // [{ tags: Set<string> }]

    // Sort tags by document frequency descending — most common become seeds first
    const sortedTags = [...tags].sort((a, b) => (tagDocCount[b] || 0) - (tagDocCount[a] || 0));

    sortedTags.forEach(tag => {
        if (assigned.has(tag)) return;

        // Find best existing cluster by average Jaccard similarity to all members
        let bestCluster = -1;
        let bestScore = JACCARD_THRESHOLD; // must exceed threshold to join

        clusters.forEach((cluster, i) => {
            const members = [...cluster.tags];
            if (members.length === 0) return;
            const scores = members.map(member => jaccardSim(tag, member));
            const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            if (avgScore > bestScore) {
                bestScore = avgScore;
                bestCluster = i;
            }
        });

        if (bestCluster >= 0) {
            clusters[bestCluster].tags.add(tag);
            assigned.set(tag, bestCluster);
        } else {
            // Start a new cluster seeded by this tag
            const idx = clusters.length;
            clusters.push({ tags: new Set([tag]) });
            assigned.set(tag, idx);
        }
    });

    // -------------------------------------------------------
    // Step 4: Optional semantic enhancement
    // If similarity data is provided, merge clusters whose tags are bridged
    // by bookmarks with high semantic similarity scores.
    // -------------------------------------------------------
    if (similarities && similarities.length > 0) {
        const SEM_MERGE_THRESHOLD = 0.75;

        // Build bookmark-to-tags index
        const bookmarkTags = new Map();
        bookmarks.forEach(b => {
            const rawTags = Array.isArray(b.tags) ? b.tags : [];
            bookmarkTags.set(b.id, rawTags.map(t => t.toLowerCase().trim()).filter(Boolean));
        });

        const clusterForTag = (tag) => {
            const idx = assigned.get(tag);
            return idx !== undefined ? idx : -1;
        };

        // Process high-similarity bookmark pairs — merge their tag clusters
        similarities.forEach(({ a: bmA, b: bmB, score }) => {
            if (score < SEM_MERGE_THRESHOLD) return;
            const tagsA = bookmarkTags.get(bmA) || [];
            const tagsB = bookmarkTags.get(bmB) || [];

            tagsA.forEach(tA => {
                tagsB.forEach(tB => {
                    if (tA === tB) return;
                    const cA = clusterForTag(tA);
                    const cB = clusterForTag(tB);
                    if (cA === -1 || cB === -1 || cA === cB) return;

                    // Merge smaller cluster into larger to preserve cohesion
                    const [keep, remove] = clusters[cA].tags.size >= clusters[cB].tags.size
                        ? [cA, cB]
                        : [cB, cA];

                    clusters[remove].tags.forEach(t => {
                        clusters[keep].tags.add(t);
                        assigned.set(t, keep);
                    });
                    clusters[remove].tags.clear();
                });
            });
        });
    }

    // -------------------------------------------------------
    // Step 5: Filter empty clusters, assign names and colors
    // -------------------------------------------------------
    const result = clusters
        .filter(c => c.tags.size > 0)
        .map((c, i) => ({
            name: generateClusterName([...c.tags]),
            color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
            tags: [...c.tags].sort()
        }));

    return result;
};

module.exports = { computeClusters };
