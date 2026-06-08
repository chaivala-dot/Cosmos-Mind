import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = 'http://localhost:3000';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const getAssignedTags = (clusters) =>
    new Set(clusters.flatMap(c => (c.tags || []).map(m => m.tag_name)));

const getAllBookmarkTags = (bookmarks) =>
    [...new Set(bookmarks.flatMap(b => Array.isArray(b.tags) ? b.tags : []))];

const countBookmarksForCluster = (cluster, bookmarks) => {
    const memberNames = new Set((cluster.tags || []).map(m => m.tag_name));
    return bookmarks.filter(b =>
        Array.isArray(b.tags) && b.tags.some(t => memberNames.has(t))
    ).length;
};

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function TagPill({ tagName, onRemove, clusterId }) {
    const [hovered, setHovered] = useState(false);

    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-zinc-700 bg-zinc-800 text-zinc-300 transition-colors hover:border-zinc-600"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {tagName}
            {onRemove && hovered && (
                <button
                    onClick={() => onRemove(clusterId, tagName)}
                    className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors leading-none focus:outline-none"
                    title="Remove tag from cluster"
                    aria-label={`Remove ${tagName}`}
                >
                    ×
                </button>
            )}
        </span>
    );
}

function ClusterCard({
    cluster,
    bookmarks,
    editingClusterId,
    editName,
    onStartEdit,
    onEditChange,
    onRename,
    onCancelEdit,
    onDelete,
    onRemoveTag,
}) {
    const bookmarkCount = countBookmarksForCluster(cluster, bookmarks);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') onRename(cluster.id);
        if (e.key === 'Escape') onCancelEdit();
    };

    return (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex flex-col gap-3 group">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Color dot */}
                    <span
                        className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/10"
                        style={{ backgroundColor: cluster.color || '#6366f1' }}
                    />

                    {/* Inline rename or label */}
                    {editingClusterId === cluster.id ? (
                        <input
                            value={editName}
                            onChange={(e) => onEditChange(e.target.value)}
                            onBlur={() => onRename(cluster.id)}
                            onKeyDown={handleKeyDown}
                            className="bg-transparent border-b border-zinc-600 text-zinc-100 outline-none text-sm flex-1 min-w-0"
                            autoFocus
                            aria-label="Rename cluster"
                        />
                    ) : (
                        <span
                            onDoubleClick={() => onStartEdit(cluster.id, cluster.name)}
                            className="text-sm font-medium text-zinc-100 cursor-pointer hover:text-white truncate select-none"
                            title="Double-click to rename"
                        >
                            {cluster.name}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Bookmark count badge */}
                    <span className="text-xs text-zinc-500 tabular-nums">
                        {bookmarkCount} bookmark{bookmarkCount !== 1 ? 's' : ''}
                    </span>

                    {/* Delete button */}
                    <button
                        onClick={() => onDelete(cluster.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400 text-sm focus:outline-none focus:opacity-100"
                        title="Delete cluster"
                        aria-label={`Delete cluster ${cluster.name}`}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Tag pills */}
            {(cluster.tags || []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {(cluster.tags || []).map(m => (
                        <TagPill
                            key={m.tag_name}
                            tagName={m.tag_name}
                            clusterId={cluster.id}
                            onRemove={onRemoveTag}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-xs text-zinc-600 italic">No tags in this cluster yet.</p>
            )}
        </div>
    );
}

function CreateClusterForm({ onCreated, onCancel }) {
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) { setError('Name is required'); return; }
        setSubmitting(true);
        setError('');
        try {
            const { data } = await axios.post(`${API}/api/clusters`, { name: trimmed });
            onCreated(data);
            setName('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create cluster');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center mt-2">
            <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="Cluster name…"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors"
                autoFocus
                disabled={submitting}
            />
            <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
                {submitting ? '…' : 'Add'}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors"
            >
                Cancel
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
        </form>
    );
}

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function ClusterManager({ bookmarks = [] }) {
    const [clusters, setClusters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [computing, setComputing] = useState(false);
    const [error, setError] = useState('');
    const [editingClusterId, setEditingClusterId] = useState(null);
    const [editName, setEditName] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    // ── Fetch clusters ──
    const fetchClusters = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/api/clusters`);
            setClusters(Array.isArray(data) ? data : []);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load clusters');
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchClusters().finally(() => setLoading(false));
    }, [fetchClusters]);

    // ── Compute clusters ──
    const handleCompute = async () => {
        setComputing(true);
        setError('');
        try {
            const { data } = await axios.post(`${API}/api/clusters/compute`);
            setClusters(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to compute clusters');
        } finally {
            setComputing(false);
        }
    };

    // ── Delete cluster ──
    const handleDelete = async (id) => {
        if (!window.confirm('Delete this cluster?')) return;
        try {
            await axios.delete(`${API}/api/clusters/${id}`);
            setClusters(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete cluster');
        }
    };

    // ── Rename cluster ──
    const handleRename = async (id) => {
        const trimmed = editName.trim();
        if (!trimmed) { setEditingClusterId(null); return; }
        const cluster = clusters.find(c => c.id === id);
        if (!cluster) { setEditingClusterId(null); return; }
        // No change — cancel silently
        if (trimmed === cluster.name) { setEditingClusterId(null); return; }

        try {
            const { data } = await axios.put(`${API}/api/clusters/${id}`, {
                name: trimmed,
                color: cluster.color
            });
            setClusters(prev => prev.map(c => (c.id === id ? { ...c, name: data?.name || trimmed } : c)));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to rename cluster');
        } finally {
            setEditingClusterId(null);
        }
    };

    const handleCancelEdit = () => setEditingClusterId(null);

    // ── Remove tag from cluster ──
    const handleRemoveTag = async (clusterId, tagName) => {
        try {
            await axios.delete(`${API}/api/clusters/${clusterId}/tags/${encodeURIComponent(tagName)}`);
            setClusters(prev =>
                prev.map(c =>
                    c.id === clusterId
                        ? { ...c, tags: (c.tags || []).filter(m => m.tag_name !== tagName) }
                        : c
                )
            );
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to remove tag');
        }
    };

    // ── Add tag from unassigned to a cluster ──
    const handleAddTagToCluster = async (clusterId, tagName) => {
        try {
            await axios.post(`${API}/api/clusters/${clusterId}/tags`, { tagName });
            // Refresh to get updated state
            await fetchClusters();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add tag');
        }
    };

    // ── Cluster created callback ──
    const handleClusterCreated = (newCluster) => {
        setClusters(prev => [{ ...newCluster, tags: [] }, ...prev]);
        setShowCreateForm(false);
    };

    // ── Derive unassigned tags ──
    const assignedTags = getAssignedTags(clusters);
    const allTags = getAllBookmarkTags(bookmarks);
    const unassigned = allTags.filter(t => !assignedTags.has(t)).sort();

    // ──────────────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-zinc-500">
                <span className="animate-pulse text-sm">Loading clusters…</span>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100">Tag Clusters</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} ·{' '}
                        {assignedTags.size} assigned tag{assignedTags.size !== 1 ? 's' : ''} ·{' '}
                        {unassigned.length} unassigned
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowCreateForm(v => !v)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm transition-colors"
                    >
                        + New Cluster
                    </button>
                    <button
                        onClick={handleCompute}
                        disabled={computing || bookmarks.length === 0}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title={bookmarks.length === 0 ? 'No bookmarks to cluster' : 'Auto-compute clusters from tag co-occurrence'}
                    >
                        {computing && (
                            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        )}
                        {computing ? 'Computing…' : '⚡ Compute Clusters'}
                    </button>
                </div>
            </div>

            {/* ── Create form ── */}
            {showCreateForm && (
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                    <p className="text-sm text-zinc-400 mb-2">Create a new cluster</p>
                    <CreateClusterForm
                        onCreated={handleClusterCreated}
                        onCancel={() => setShowCreateForm(false)}
                    />
                </div>
            )}

            {/* ── Error banner ── */}
            {error && (
                <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="ml-4 text-red-500 hover:text-red-300">×</button>
                </div>
            )}

            {/* ── Two-column layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: Cluster list (2/3 width) */}
                <div className="lg:col-span-2 space-y-3">
                    {clusters.length === 0 ? (
                        <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-8 text-center">
                            <p className="text-zinc-500 text-sm">No clusters yet.</p>
                            <p className="text-zinc-600 text-xs mt-1">
                                {bookmarks.length === 0
                                    ? 'Add some bookmarks with tags first, then compute clusters.'
                                    : 'Click "⚡ Compute Clusters" to auto-group your tags, or create one manually.'}
                            </p>
                        </div>
                    ) : (
                        clusters.map(cluster => (
                            <ClusterCard
                                key={cluster.id}
                                cluster={cluster}
                                bookmarks={bookmarks}
                                editingClusterId={editingClusterId}
                                editName={editName}
                                onStartEdit={(id, name) => { setEditingClusterId(id); setEditName(name); }}
                                onEditChange={setEditName}
                                onRename={handleRename}
                                onCancelEdit={handleCancelEdit}
                                onDelete={handleDelete}
                                onRemoveTag={handleRemoveTag}
                            />
                        ))
                    )}
                </div>

                {/* Right: Unassigned tags panel (1/3 width) */}
                <div className="lg:col-span-1">
                    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-4 sticky top-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-zinc-300">Unassigned Tags</h3>
                            <span className="text-xs text-zinc-500 tabular-nums">{unassigned.length}</span>
                        </div>

                        {unassigned.length === 0 ? (
                            <p className="text-xs text-zinc-600 italic">
                                {allTags.length === 0
                                    ? 'No tags found in your bookmarks.'
                                    : 'All tags are assigned to clusters. 🎉'}
                            </p>
                        ) : (
                            <>
                                <p className="text-xs text-zinc-600 mb-2">
                                    Click a tag to add it to a cluster.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {unassigned.map(tag => (
                                        <UnassignedTagPill
                                            key={tag}
                                            tag={tag}
                                            clusters={clusters}
                                            onAddToCluster={handleAddTagToCluster}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Unassigned tag pill with cluster picker dropdown
// ──────────────────────────────────────────────────────────
function UnassignedTagPill({ tag, clusters, onAddToCluster }) {
    const [open, setOpen] = useState(false);

    if (clusters.length === 0) {
        return (
            <span className="px-2 py-0.5 rounded-full text-xs border border-zinc-700 bg-zinc-800/60 text-zinc-400">
                {tag}
            </span>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="px-2 py-0.5 rounded-full text-xs border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-indigo-500 hover:text-indigo-300 transition-colors focus:outline-none"
                title="Click to assign to a cluster"
            >
                {tag}
            </button>

            {open && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    {/* Dropdown */}
                    <div className="absolute left-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg min-w-[140px] py-1 overflow-hidden">
                        <p className="text-xs text-zinc-600 px-3 py-1 border-b border-zinc-800">Add to cluster…</p>
                        {clusters.map(c => (
                            <button
                                key={c.id}
                                onClick={() => { onAddToCluster(c.id, tag); setOpen(false); }}
                                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: c.color || '#6366f1' }}
                                />
                                <span className="truncate">{c.name}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
