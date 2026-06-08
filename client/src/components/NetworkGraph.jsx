import React, { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';

const NetworkGraph = ({ bookmarks, onNodeClick, onTagAssignment, similarities = [], snapshotMode = false }) => {
    const [focusedTag, setFocusedTag] = React.useState(null);
    const [hoveredNode, setHoveredNode] = React.useState(null);
    const [showSemanticLinks, setShowSemanticLinks] = React.useState(false);

    // ── Build base graph data from bookmarks ────────────────────────────────
    const baseData = useMemo(() => {
        const nodes = [];
        const links = [];
        const tagSet = new Set();
        const tagCounts = {};

        bookmarks.forEach(b => {
            nodes.push({
                id: `bookmark-${b.id}`,
                type: 'bookmark',
                name: b.title || b.url,
                url: b.url,
                val: 5,
                color: '#60A5FA',
                originalId: b.id,
                tags: b.tags
            });

            b.tags.forEach(tag => {
                const normalizedTag = tag.trim().toLowerCase();
                if (!normalizedTag) return;

                tagSet.add(normalizedTag);
                tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;

                links.push({
                    source: `bookmark-${b.id}`,
                    target: `tag-${normalizedTag}`,
                    value: 1,
                    type: 'tag'
                });
            });
        });

        tagSet.forEach(tag => {
            nodes.push({
                id: `tag-${tag}`,
                type: 'tag',
                name: tag,
                val: 10 + (tagCounts[tag] * 2),
                color: '#F472B6',
                isTag: true
            });
        });

        return { nodes, links };
    }, [bookmarks]);

    // ── Build semantic links from similarities prop ──────────────────────────
    const semanticLinks = useMemo(() => {
        if (!showSemanticLinks || !similarities.length) return [];
        // similarities shape from getSimilarities(): { id, title, url, image, score }
        // These are results for a specific bookmark_id_a → bookmark_id_b
        // For the graph we need pairs. Since similarities prop may be partial, we build what we can.
        return similarities
            .map(s => ({
                source: `bookmark-${s.bookmark_id_a || s.a}`,
                target: `bookmark-${s.id || s.bookmark_id_b || s.b}`,
                value: s.score || 0,
                type: 'semantic'
            }))
            .filter(l => l.source !== l.target && l.source !== 'bookmark-undefined' && l.target !== 'bookmark-undefined');
    }, [similarities, showSemanticLinks]);

    // ── Merge base data with semantic links ─────────────────────────────────
    const data = useMemo(() => ({
        nodes: baseData.nodes,
        links: [...baseData.links, ...semanticLinks]
    }), [baseData, semanticLinks]);

    const [dragState, setDragState] = React.useState({ active: false, node: null, target: null });

    const handleNodeDrag = (node) => {
        // Find closest Tag node
        const threshold = 50;
        let closestTag = null;
        let minDistance = Infinity;

        // Only look for tags to connect to
        data.nodes.forEach(targetNode => {
            if (targetNode.type === 'tag' && !node.tags.includes(targetNode.name)) {
                const dx = node.x - targetNode.x;
                const dy = node.y - targetNode.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < threshold && distance < minDistance) {
                    minDistance = distance;
                    closestTag = targetNode;
                }
            }
        });

        if (closestTag) {
            setDragState({ active: true, node: node, target: closestTag });
        } else {
            setDragState({ active: true, node: node, target: null });
        }
    };

    const handleNodeDragEnd = (node) => {
        if (dragState.target && onTagAssignment) {
            onTagAssignment(node.originalId, dragState.target.name);

            // Snap visual feedback
            node.x = dragState.target.x;
            node.y = dragState.target.y;
        }
        setDragState({ active: false, node: null, target: null });
    };

    const fgRef = React.useRef();

    React.useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-550);
            fgRef.current.d3Force('collide', d3.forceCollide(node => node.val + 12));
            fgRef.current.d3Force('link').distance(110);
            fgRef.current.d3ReheatSimulation();
        }
    }, [data]);

    return (
        <div className="border border-zinc-800/50 rounded-xl overflow-hidden bg-zinc-950/50 backdrop-blur-sm h-[600px] w-full relative">
            {/* Legend / Controls Overlay */}
            <div className="absolute top-4 left-4 z-10 bg-zinc-900/80 p-4 rounded-lg backdrop-blur-md border border-zinc-800/50 shadow-xl select-none">
                <div className="pointer-events-none">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-zinc-100 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                        <span className="text-xs text-zinc-400 font-medium tracking-wide">CLUSTERS</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-zinc-500"></div>
                        <span className="text-xs text-zinc-400 font-medium tracking-wide">BOOKMARKS</span>
                    </div>
                    {snapshotMode && (
                        <div className="mt-2 text-xs text-amber-400 font-bold border-t border-zinc-700 pt-2">
                            ⏳ SNAPSHOT MODE
                        </div>
                    )}
                    {focusedTag && (
                        <div className="mt-2 text-xs text-blue-400 font-bold border-t border-zinc-700 pt-2 animate-pulse">
                            FOCUSED: {focusedTag}
                        </div>
                    )}
                    {dragState.target && (
                        <div className="mt-4 pt-2 border-t border-zinc-700 text-green-400 text-xs font-bold animate-pulse">
                            RELEASE TO CONNECT: {dragState.target.name}
                        </div>
                    )}
                </div>

                {/* Semantic Links Toggle — needs pointer events */}
                <button
                    onClick={() => setShowSemanticLinks(v => !v)}
                    className={`text-xs px-2 py-1 rounded border transition-colors mt-2 w-full text-left ${
                        showSemanticLinks
                            ? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10'
                            : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    {showSemanticLinks ? '◉' : '○'} Semantic Links
                </button>
            </div>

            {/* Hover Card */}
            {hoveredNode && hoveredNode.type === 'bookmark' && (
                <div
                    className="absolute z-20 pointer-events-none transition-opacity duration-200"
                    style={{
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl p-4 shadow-2xl max-w-sm">
                        {bookmarks.find(b => b.id === hoveredNode.originalId)?.image && (
                            <div className="mb-3 rounded-lg overflow-hidden">
                                <img
                                    src={bookmarks.find(b => b.id === hoveredNode.originalId).image}
                                    alt={hoveredNode.name}
                                    className="w-full h-32 object-cover"
                                />
                            </div>
                        )}
                        <h3 className="text-sm font-semibold text-zinc-100 mb-1 line-clamp-2">
                            {hoveredNode.name}
                        </h3>
                        <p className="text-xs text-zinc-400 mb-2 line-clamp-2">
                            {bookmarks.find(b => b.id === hoveredNode.originalId)?.description || hoveredNode.url}
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {hoveredNode.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-zinc-800/50 text-zinc-400 text-[10px] rounded-full">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <ForceGraph2D
                ref={fgRef}
                graphData={data}
                nodeLabel="name"
                nodeColor="color"
                nodeVal="val"
                linkWidth={(link) => link.type === 'semantic' ? 0.3 : 0.5}
                linkCurvature={0.25}
                linkDirectionalParticles={1}
                linkDirectionalParticleSpeed={0.005}
                linkLineDash={(link) => link.type === 'semantic' ? [2, 4] : null}
                onNodeHover={(node) => {
                    setHoveredNode(node);
                }}
                linkColor={(link) => {
                    if (link.type === 'semantic') {
                        return `rgba(251,191,36,${(link.value || 0.3) * 0.6})`; // amber, opacity by score
                    }
                    if (focusedTag) {
                        return (link.target.name === focusedTag || link.source.name === focusedTag) ? "#3f3f46" : "rgba(0,0,0,0)";
                    }
                    return "#3f3f46";
                }}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    // --- RENDER LOGIC START ---
                    let isDimmed = false;
                    if (focusedTag) {
                        if (node.type === 'tag') {
                            isDimmed = node.name !== focusedTag;
                        } else {
                            isDimmed = !node.tags.includes(focusedTag);
                        }
                    }

                    const label = node.name;
                    const fontSize = node.type === 'tag' ? 14 / globalScale : 14 / globalScale;
                    ctx.font = `${fontSize}px Inter, sans-serif`;

                    ctx.globalAlpha = isDimmed ? 0.1 : 1;

                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);

                    if (node.type === 'tag') {
                        ctx.fillStyle = snapshotMode ? '#f4f4f5' : '#f4f4f5';
                        if (!isDimmed) {
                            ctx.shadowBlur = 15;
                            ctx.shadowColor = snapshotMode
                                ? 'rgba(217,119,6,0.4)'
                                : 'rgba(255,255,255,0.3)';
                        }
                    } else {
                        // Snapshot mode: amber tint for bookmark nodes
                        if (snapshotMode) {
                            ctx.fillStyle = '#d97706'; // amber
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = 'rgba(217,119,6,0.5)';
                        } else if (hoveredNode && hoveredNode.id === node.id) {
                            ctx.fillStyle = '#60A5FA'; // Blue highlight
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = '#60A5FA';
                        } else {
                            ctx.fillStyle = '#71717a';
                            ctx.shadowBlur = 0;
                        }
                    }

                    ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    if (node.type === 'tag') {
                        ctx.fillStyle = snapshotMode ? '#fef3c7' : '#ffffff';
                        if (globalScale > 0.4 || !isDimmed) ctx.fillText(label, node.x, node.y + node.val + 6);
                    } else {
                        if (globalScale > 1.2 && !isDimmed) {
                            ctx.fillStyle = '#a1a1aa';
                            ctx.fillText(label, node.x, node.y + node.val + 6);
                        }
                    }
                    ctx.globalAlpha = 1;
                    // --- RENDER LOGIC END ---

                    // Draw Visual Connection Line during drag
                    if (dragState.active && dragState.node === node && dragState.target) {
                        ctx.beginPath();
                        ctx.moveTo(node.x, node.y);
                        ctx.lineTo(dragState.target.x, dragState.target.y);
                        ctx.strokeStyle = '#4ade80';
                        ctx.lineWidth = 2 / globalScale;
                        ctx.setLineDash([5 / globalScale, 5 / globalScale]);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }}
                onNodeClick={(node) => {
                    if (node.type === 'tag') {
                        setFocusedTag(prev => prev === node.name ? null : node.name);
                    } else if (node.type === 'bookmark') {
                        if (onNodeClick) onNodeClick(node.originalId);
                        window.open(node.url, '_blank');
                    }
                }}
                onBackgroundClick={() => setFocusedTag(null)}
                onNodeDrag={handleNodeDrag}
                onNodeDragEnd={handleNodeDragEnd}
                backgroundColor="rgba(0,0,0,0)"
            />
        </div>
    );
};

export default NetworkGraph;
