import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * TimeMachineControls
 *
 * A dark UI bar rendered above the graph in time-machine mode.
 * Lets the user scrub through available monthly snapshots and play them back.
 *
 * Props:
 *   onSnapshotChange(date: string) — called when slider position changes (debounced 300ms)
 *   onExitTimeMachine()            — called when user clicks "Live" / Exit button
 *   isActive: boolean              — whether time machine mode is currently active
 */
const TimeMachineControls = ({ onSnapshotChange, onExitTimeMachine, isActive }) => {
    const [snapshots, setSnapshots] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [buildStatus, setBuildStatus] = useState(null); // null | 'building' | 'done' | 'error'
    const playIntervalRef = useRef(null);
    const debounceTimerRef = useRef(null);

    // ── Fetch snapshot list on mount ──────────────────────────────────────────
    useEffect(() => {
        if (!isActive) return;
        fetchSnapshots();
    }, [isActive]);

    const fetchSnapshots = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/timeline/snapshots');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setSnapshots(Array.isArray(data) ? data : []);
            // Start at last (most recent) month
            setCurrentIndex(data.length > 0 ? data.length - 1 : 0);
        } catch (err) {
            console.error('[TimeMachineControls] fetchSnapshots error:', err);
            setSnapshots([]);
        } finally {
            setLoading(false);
        }
    };

    // ── Playback logic ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isPlaying) {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
            return;
        }
        playIntervalRef.current = setInterval(() => {
            setCurrentIndex(prev => {
                if (prev >= snapshots.length - 1) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 1200);

        return () => {
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        };
    }, [isPlaying, snapshots.length]);

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    // ── Notify parent on index change (debounced 300ms) ───────────────────────
    useEffect(() => {
        if (snapshots.length === 0) return;
        const date = snapshots[currentIndex]?.date;
        if (!date) return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            onSnapshotChange && onSnapshotChange(date);
        }, 300);
    }, [currentIndex, snapshots]);

    // ── Build snapshots handler ───────────────────────────────────────────────
    const handleBuildSnapshots = async () => {
        setBuildStatus('building');
        try {
            const res = await fetch('/api/timeline/build', { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setBuildStatus('done');
            // Refresh snapshot list after a brief delay
            setTimeout(() => {
                fetchSnapshots();
                setBuildStatus(null);
            }, 1500);
        } catch (err) {
            console.error('[TimeMachineControls] buildSnapshots error:', err);
            setBuildStatus('error');
        }
    };

    // ── Derived values ────────────────────────────────────────────────────────
    const currentSnapshot = snapshots[currentIndex] || null;
    const noSnapshots = !loading && snapshots.length === 0;
    const hasNoPreBuilt = !loading && snapshots.length > 0 && snapshots.every(s => !s.hasSnapshot);

    /**
     * Format 'YYYY-MM' → 'Month YYYY' for display.
     */
    const formatMonth = (dateStr) => {
        if (!dateStr) return '';
        const [y, m] = dateStr.split('-');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
        ];
        return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    };

    // ── Visible month markers (every 3rd month) ───────────────────────────────
    const markerIndices = snapshots
        .map((_, i) => i)
        .filter(i => i % 3 === 0 || i === snapshots.length - 1);

    if (!isActive) return null;

    return (
        <div className="bg-zinc-900/90 border border-zinc-700/50 rounded-2xl p-4 mb-6 backdrop-blur-md select-none">

            {/* ── Row 1: Label + controls ── */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    {/* Time machine icon + date label */}
                    <span className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">
                        ⏳ Time Machine
                    </span>
                    <span className="text-sm font-bold text-white">
                        {loading
                            ? 'Loading...'
                            : currentSnapshot
                                ? formatMonth(currentSnapshot.date)
                                : 'No data'}
                    </span>
                    {currentSnapshot && (
                        <span className="text-xs text-zinc-500">
                            {currentSnapshot.bookmarkCount} bookmark{currentSnapshot.bookmarkCount !== 1 ? 's' : ''}
                            {currentSnapshot.hasSnapshot && (
                                <span className="ml-1 text-emerald-500">●</span>
                            )}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Play / Pause */}
                    <button
                        onClick={() => setIsPlaying(p => !p)}
                        disabled={loading || snapshots.length < 2}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white text-sm"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>

                    {/* Live / Exit */}
                    <button
                        onClick={() => {
                            setIsPlaying(false);
                            onExitTimeMachine && onExitTimeMachine();
                        }}
                        className="px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                        title="Return to live graph"
                    >
                        ⏹ Live
                    </button>
                </div>
            </div>

            {/* ── Row 2: Slider ── */}
            {!loading && snapshots.length > 0 && (
                <div className="mb-1">
                    <input
                        type="range"
                        min={0}
                        max={snapshots.length - 1}
                        value={currentIndex}
                        onChange={e => {
                            setIsPlaying(false);
                            setCurrentIndex(Number(e.target.value));
                        }}
                        className="w-full accent-zinc-100 cursor-pointer"
                        style={{ height: '4px' }}
                    />
                </div>
            )}

            {/* ── Row 3: Month markers ── */}
            {!loading && snapshots.length > 1 && (
                <div className="relative flex justify-between mt-1 mb-2 px-0">
                    {markerIndices.map(i => (
                        <button
                            key={i}
                            onClick={() => {
                                setIsPlaying(false);
                                setCurrentIndex(i);
                            }}
                            className={`text-[10px] transition-colors truncate max-w-[60px] ${
                                i === currentIndex
                                    ? 'text-white font-bold'
                                    : 'text-zinc-600 hover:text-zinc-400'
                            }`}
                            title={formatMonth(snapshots[i]?.date)}
                        >
                            {snapshots[i]?.date?.slice(0, 7) || ''}
                        </button>
                    ))}
                </div>
            )}

            {/* ── No snapshots / empty state ── */}
            {noSnapshots && (
                <p className="text-xs text-zinc-500 text-center mt-1">
                    No timeline data found.
                </p>
            )}

            {/* ── Build snapshots button (only if no pre-built snapshots exist) ── */}
            {(noSnapshots || hasNoPreBuilt) && (
                <div className="flex justify-center mt-3">
                    <button
                        onClick={handleBuildSnapshots}
                        disabled={buildStatus === 'building'}
                        className="px-4 py-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors border border-zinc-600"
                    >
                        {buildStatus === 'building'
                            ? '⚙ Building...'
                            : buildStatus === 'done'
                                ? '✓ Done! Refreshing...'
                                : buildStatus === 'error'
                                    ? '✗ Error — retry?'
                                    : '⚙ Build Snapshots'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TimeMachineControls;
