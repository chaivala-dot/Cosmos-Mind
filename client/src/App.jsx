import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LayoutGrid, Network, Plus, X, Database, Trash2 } from 'lucide-react';
import BookmarkList from './components/BookmarkList';
import NetworkGraph from './components/NetworkGraph';
import StacksSidebar from './components/StacksSidebar';
import SearchOverlay from './components/SearchOverlay';
import BookmarkDetailPanel from './components/BookmarkDetailPanel';
import TimeMachineControls from './components/TimeMachineControls';
import ClusterManager from './components/ClusterManager';

import { Toaster, toast } from 'sonner';
import SettingsModal from './components/SettingsModal';
import ExportImportModal from './components/ExportImportModal';
import StatsDashboard from './components/StatsDashboard';

function App() {
    const [bookmarks, setBookmarks] = useState([]);
    const [view, setView] = useState('list');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const [newTags, setNewTags] = useState('');
    const [loading, setLoading] = useState(false);

    const [editingBookmark, setEditingBookmark] = useState(null);
    const [stacks, setStacks] = useState([]);
    const [showStackModal, setShowStackModal] = useState(false);
    const [newStackName, setNewStackName] = useState('');
    const [showStacks, setShowStacks] = useState(false);
    const [selectedStack, setSelectedStack] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showDataModal, setShowDataModal] = useState(false);

    // ── New feature state ──────────────────────────────────────────────────────
    const [showSearch, setShowSearch] = useState(false);
    const [selectedBookmark, setSelectedBookmark] = useState(null); // for detail panel
    const [timeMachine, setTimeMachine] = useState({ active: false, date: null, snapshot: null });
    const [similarities, setSimilarities] = useState([]); // for graph semantic links

    useEffect(() => {
        fetchBookmarks();
        fetchStacks();

        const handleKeyDown = (e) => {
            // Ctrl+Shift+K → open Add Modal
            if (e.key === 'k' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                e.preventDefault();
                setEditingBookmark(null);
                setNewUrl('');
                setNewTags('');
                setShowAddModal(true);
                return;
            }
            // Ctrl+K → open Search Overlay
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setShowSearch(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const fetchBookmarks = async () => {
        try {
            const { data } = await axios.get('http://localhost:3000/api/bookmarks');
            setBookmarks(data);
        } catch (err) {
            toast.error("Failed to sync with universe");
        }
    };

    const fetchStacks = async () => {
        try {
            const { data } = await axios.get('http://localhost:3000/api/stacks');
            setStacks(data);
        } catch (err) {
            toast.error("Failed to load stacks");
        }
    };

    // ── Fetch similarities status (silent, non-critical) ───────────────────────
    const fetchSimilarities = async () => {
        try {
            const { data } = await axios.get('http://localhost:3000/api/embeddings/status');
            if (!data.lastComputed && bookmarks.length > 0) {
                // Silently trigger background compute
                axios.post('http://localhost:3000/api/embeddings/compute').catch(() => {});
            }
        } catch (err) { /* non-critical */ }
    };

    // ── Time Machine snapshot handler ──────────────────────────────────────────
    const handleSnapshotChange = async (date) => {
        if (!date) {
            setTimeMachine({ active: false, date: null, snapshot: null });
            return;
        }
        try {
            const { data } = await axios.get(`http://localhost:3000/api/timeline/snapshot?date=${date}`);
            setTimeMachine({ active: true, date, snapshot: data });
        } catch (err) {
            toast.error('Failed to load snapshot');
        }
    };

    const handleEdit = (bookmark) => {
        setEditingBookmark(bookmark);
        setNewUrl(bookmark.url);
        setNewTags(bookmark.tags.join(', '));
        setShowAddModal(true);
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setEditingBookmark(null);
        setNewUrl('');
        setNewTags('');
    };

    const handleSelectStack = (stackId) => {
        setSelectedStack(stackId);
    };

    const addOrUpdateBookmark = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);

            if (editingBookmark) {
                // Update
                await axios.put(`http://localhost:3000/api/bookmarks/${editingBookmark.id}`, {
                    ...editingBookmark,
                    url: newUrl,
                    tags: tagsArray
                });
                toast.success("Element evolved successfully");
            } else {
                // Create
                await axios.post('http://localhost:3000/api/bookmarks', {
                    url: newUrl,
                    tags: tagsArray
                });
                toast.success("Element captured successfully");
            }

            handleCloseModal();
            fetchBookmarks();
        } catch (err) {
            toast.error(editingBookmark ? "Failed to evolve element" : "Failed to capture element");
        } finally {
            setLoading(false);
        }
    };

    const deleteBookmark = async (id) => {
        try {
            await axios.delete(`http://localhost:3000/api/bookmarks/${id}`);
            fetchBookmarks();
            const idsToRestore = [id];
            toast.success("Bookmark deleted", {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await axios.post(`http://localhost:3000/api/bookmarks/${id}/restore`);
                            fetchBookmarks();
                            toast.success("Restored");
                        } catch (err) {
                            toast.error("Failed to restore");
                        }
                    }
                },
                duration: 4000,
            });
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete bookmark");
        }
    };

    const handleTagAssignment = async (bookmarkId, newTag) => {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;

        if (bookmark.tags.some(t => t.toLowerCase() === newTag.toLowerCase())) {
            toast.error(`Already tagged with #${newTag}`);
            return;
        }

        const updatedTags = [...bookmark.tags, newTag];
        try {
            await axios.patch(`http://localhost:3000/api/bookmarks/${bookmarkId}/tags`, {
                tags: updatedTags
            });
            fetchBookmarks();
            toast.success(`Tagged with #${newTag}`);
        } catch (err) {
            toast.error("Failed to update tags");
        }
    };

    const createStack = async () => {
        if (!newStackName.trim()) return;
        try {
            await axios.post('http://localhost:3000/api/stacks', { name: newStackName });
            setNewStackName('');
            setShowStackModal(false);
            fetchStacks();
            toast.success(`Stack "${newStackName}" created`);
        } catch (err) {
            toast.error("Failed to create stack");
        }
    };

    const deleteStack = async (id) => {
        try {
            await axios.delete(`http://localhost:3000/api/stacks/${id}`);
            fetchStacks();
            toast.success("Stack deleted");
        } catch (err) {
            toast.error("Failed to delete stack");
        }
    };

    const addBookmarkToStack = async (stackId, bookmarkId) => {
        try {
            await axios.post(`http://localhost:3000/api/stacks/${stackId}/items`, { bookmarkId });
            fetchStacks();
            toast.success("Added to stack");
        } catch (err) {
            toast.error("Failed to add to stack");
        }
    };

    const removeBookmarkFromStack = async (stackId, bookmarkId) => {
        try {
            await axios.delete(`http://localhost:3000/api/stacks/${stackId}/items/${bookmarkId}`);
            fetchStacks();
            toast.success("Removed from stack");
        } catch (err) {
            toast.error("Failed to remove from stack");
        }
    };

    // --- BULK OPERATIONS ---
    const [selectedIds, setSelectedIds] = useState(new Set());

    const toggleSelection = (id) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.size} bookmarks?`)) return;
        const idsToDelete = Array.from(selectedIds);

        try {
            await axios.post('http://localhost:3000/api/bookmarks/bulk/delete', {
                ids: idsToDelete
            });
            clearSelection();
            fetchBookmarks();
            toast.success(`${idsToDelete.length} items deleted`, {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await axios.post('http://localhost:3000/api/bookmarks/bulk/restore', { ids: idsToDelete });
                            fetchBookmarks();
                            toast.success("Restored");
                        } catch (e) { toast.error("Failed to restore"); }
                    }
                }
            });
        } catch (err) {
            toast.error("Failed to delete items");
        }
    };

    const handleBulkAddToStack = async (stackId) => {
        try {
            await axios.post(`http://localhost:3000/api/stacks/${stackId}/bulk-add`, {
                ids: Array.from(selectedIds)
            });
            clearSelection();
            toast.success("Added to stack");
        } catch (err) {
            toast.error("Failed to add to stack");
        }
    };


    return (
        <div className="min-h-screen text-zinc-200 selection:bg-zinc-700/50 pb-20"> {/* pb-20 for floating bar */}
            <Toaster position="bottom-right" theme="dark" />

            {/* Search Overlay */}
            <SearchOverlay
                isOpen={showSearch}
                onClose={() => setShowSearch(false)}
                bookmarks={bookmarks}
                stacks={stacks}
            />

            {/* Bookmark Detail Panel */}
            {selectedBookmark && (
                <BookmarkDetailPanel
                    bookmark={selectedBookmark}
                    onClose={() => setSelectedBookmark(null)}
                    stacks={stacks}
                    onEdit={(bm) => { setSelectedBookmark(null); handleEdit(bm); }}
                    onDelete={(id) => { setSelectedBookmark(null); deleteBookmark(id); }}
                />
            )}

            {/* Header - Minimalist */}
            <header className="sticky top-0 z-50 px-8 py-5 flex justify-between items-center bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900/50">
                <div className="flex items-center gap-3">
                    <div className="bg-zinc-100 rounded-full p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        <div className="w-3 h-3 bg-black rounded-full" />
                    </div>
                    <h1 className="text-lg font-medium tracking-tight text-zinc-100">
                        Cosmos Mind
                    </h1>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                        <button
                            onClick={() => setView('list')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'list'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Index
                        </button>
                        <button
                            onClick={() => setView('graph')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'graph'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Graph
                        </button>
                        <button
                            onClick={() => setView('stats')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'stats'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Stats
                        </button>
                        <button
                            onClick={() => setView('clusters')}
                            className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${view === 'clusters'
                                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Clusters
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            setEditingBookmark(null);
                            setNewUrl('');
                            setNewTags('');
                            setShowAddModal(true);
                        }}
                        className="bg-zinc-100 hover:bg-zinc-200 text-black px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                    >
                        <Plus size={16} className="inline mr-1" strokeWidth={3} />
                        Save
                    </button>

                    <button
                        onClick={() => setShowSearch(true)}
                        className="px-3 py-2 rounded-full transition-all bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50 hover:border-zinc-700 text-sm flex items-center gap-2"
                        title="Search (Ctrl+K)"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <kbd className="text-[10px] font-mono text-zinc-600">⌃K</kbd>
                    </button>

                    <button
                        onClick={() => setShowStacks(!showStacks)}
                        className={`p-2 rounded-full transition-all ${showStacks
                            ? 'bg-zinc-100 text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                            : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50'
                            }`}
                        title="Toggle Stacks"
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7h18M3 12h18M3 17h18" />
                        </svg>
                    </button>

                    <button
                        onClick={() => setShowDataModal(true)}
                        className="p-2 rounded-full transition-all bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50 hover:border-zinc-700"
                        title="Data & Backup"
                    >
                        <Database size={18} strokeWidth={2} />
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-full transition-all bg-zinc-900/50 text-zinc-400 hover:text-zinc-100 border border-zinc-800/50 hover:border-zinc-700"
                        title="Settings"
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="9" r="3" />
                            <path d="M9 1v2M9 15v2M3.93 3.93l1.41 1.41M12.66 12.66l1.41 1.41M1 9h2M15 9h2M3.93 14.07l1.41-1.41M12.66 5.34l1.41-1.41" />
                        </svg>
                    </button>
                </div>
            </header>

            <div className="flex">
                {/* Main Content */}
                <div className="flex-1 max-w-[1600px] mx-auto p-8">
                    <main className="animate-fade-in">
                        {(() => {
                            // Filter bookmarks if a stack is selected
                            const displayBookmarks = selectedStack
                                ? stacks.find(s => s.id === selectedStack)?.items || []
                                : bookmarks;

                            if (view === 'list') {
                                return (
                                    <BookmarkList
                                        bookmarks={displayBookmarks}
                                        onDelete={deleteBookmark}
                                        onEdit={handleEdit}
                                        stacks={stacks}
                                        onAddToStack={addBookmarkToStack}
                                        selectedIds={selectedIds}
                                        onToggleSelection={toggleSelection}
                                        onBookmarkClick={(bookmark) => setSelectedBookmark(bookmark)}
                                    />
                                );
                            } else if (view === 'graph') {
                                return (
                                    <>
                                        {selectedStack && (
                                            <div className="mb-6 flex items-center gap-3">
                                                <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full">
                                                    <span className="text-sm text-purple-300">
                                                        Viewing: <strong>{stacks.find(s => s.id === selectedStack)?.name}</strong>
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedStack(null)}
                                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                                >
                                                    Clear filter
                                                </button>
                                            </div>
                                        )}
                                        <TimeMachineControls
                                            onSnapshotChange={handleSnapshotChange}
                                            onExitTimeMachine={() => setTimeMachine({ active: false, date: null, snapshot: null })}
                                            isActive={timeMachine.active}
                                        />
                                        {!timeMachine.active && (
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => setTimeMachine(prev => ({ ...prev, active: true }))}
                                                    className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                                                    title="Open Time Machine"
                                                >
                                                    ⏳ Time Machine
                                                </button>
                                            </div>
                                        )}
                                        <NetworkGraph
                                            bookmarks={timeMachine.active
                                                ? (timeMachine.snapshot?.rawBookmarks || displayBookmarks)
                                                : displayBookmarks}
                                            onNodeClick={(id) => console.log(id)}
                                            onTagAssignment={handleTagAssignment}
                                            similarities={similarities}
                                            snapshotMode={timeMachine.active}
                                        />
                                    </>
                                );
                            } else if (view === 'stats') {
                                return <StatsDashboard bookmarks={bookmarks} stacks={stacks} />;
                            } else if (view === 'clusters') {
                                return <ClusterManager bookmarks={bookmarks} />;
                            }
                        })()}
                    </main>
                </div>

                {/* Stacks Sidebar - Conditionally rendered */}
                {showStacks && (
                    <StacksSidebar
                        stacks={stacks}
                        bookmarks={bookmarks}
                        selectedStack={selectedStack}
                        onSelectStack={handleSelectStack}
                        onCreateStack={() => setShowStackModal(true)}
                        onDeleteStack={deleteStack}
                        onAddToStack={addBookmarkToStack}
                        onRemoveFromStack={removeBookmarkFromStack}
                    />
                )}
            </div>

            {/* Bulk Action Floating Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in fade-in slide-in-from-bottom-4 transition-all">
                    <div className="flex items-center gap-2 border-r border-zinc-700 pr-4">
                        <span className="bg-zinc-100 text-zinc-900 text-xs font-bold px-2 py-0.5 rounded-full">
                            {selectedIds.size}
                        </span>
                        <span className="text-sm text-zinc-300">Selected</span>
                    </div>

                    <button
                        onClick={() => {
                            const stackName = prompt("Enter stack name to add to (case sensitive for now):");
                            if (stackName) {
                                const stack = stacks.find(s => s.name === stackName);
                                if (stack) handleBulkAddToStack(stack.id);
                                else toast.error("Stack not found");
                            }
                        }}
                        className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1"
                        title="Add to Stack"
                    >
                        <span className="text-sm font-medium">Add to Stack</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={handleBulkDelete}
                        className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                    >
                        <Trash2 size={16} />
                        <span className="text-sm font-medium">Delete</span>
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-800"></div>

                    <button
                        onClick={clearSelection}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-2xl shadow-2xl relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-light text-zinc-100">
                                {editingBookmark ? 'Edit Element' : 'Capture Element'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-zinc-500 hover:text-zinc-200 transition-colors"
                            >
                                <X size={24} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <input
                                type="text"
                                placeholder="https://..."
                                value={newUrl}
                                onChange={(e) => setNewUrl(e.target.value)}
                                className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-4 outline-none transition-all placeholder:text-zinc-700 text-lg font-light rounded-t-lg"
                                autoFocus
                            />

                            <input
                                type="text"
                                placeholder="Tags (comma separated)..."
                                value={newTags}
                                onChange={(e) => setNewTags(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addOrUpdateBookmark(e)}
                                className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-4 outline-none transition-all placeholder:text-zinc-700 font-light"
                            />

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={addOrUpdateBookmark}
                                    disabled={loading}
                                    className="px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-xl font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'PROCESSING...' : (editingBookmark ? 'SAVE CHANGES' : 'CAPTURE')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stack Creation Modal */}
            {showStackModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md shadow-2xl relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-light text-zinc-100">Create Stack</h2>
                            <button onClick={() => setShowStackModal(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                                <X size={24} strokeWidth={1.5} />
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Stack name..."
                            value={newStackName}
                            onChange={(e) => setNewStackName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createStack()}
                            className="w-full bg-zinc-950/50 border-b-2 border-zinc-800 focus:border-zinc-100 text-zinc-100 p-3 outline-none transition-all placeholder:text-zinc-700 text-lg font-light rounded-t-lg mb-4"
                            autoFocus
                        />

                        <button
                            onClick={createStack}
                            className="w-full bg-zinc-100 hover:bg-white text-zinc-900 py-3 rounded-xl font-bold tracking-wide transition-all"
                        >
                            CREATE STACK
                        </button>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

            {/* Export/Import Modal */}
            <ExportImportModal
                isOpen={showDataModal}
                onClose={() => setShowDataModal(false)}
                onRefresh={() => {
                    fetchBookmarks();
                    fetchStacks();
                }}
            />
        </div>
    );
}

export default App;
