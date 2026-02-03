import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceX, forceY, forceCollide } from 'd3-force';

export default function LibraryGraph({ books, onNodeClick, searchQuery, selectedTags, onOpenFolder }) {
    const graphRef = useRef();
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef(null);
    const [draggedNode, setDraggedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);

    // Force controls
    const [repulsion, setRepulsion] = useState(180);
    const [linkDistance, setLinkDistance] = useState(55);
    const [gravity, setGravity] = useState(0.08);
    const [showCategoryLabels, setShowCategoryLabels] = useState(true);
    const [showTagLabels, setShowTagLabels] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Hiding Logic
    const [hiddenNodes, setHiddenNodes] = useState(new Set());
    const [contextMenu, setContextMenu] = useState(null); // { x, y, node }

    // Hover State
    const hoverTimeoutRef = useRef(null);
    const mousePosRef = useRef({ x: 0, y: 0 });
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

    // Robust Hover Handler
    const handleNodeHover = useCallback((node) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }

        if (node) {
            setHoveredNode(node);
            setPopupPos(mousePosRef.current);
        } else {
            // Delay clearing to allow moving to popup
            hoverTimeoutRef.current = setTimeout(() => {
                setHoveredNode(null);
            }, 300); // 300ms grace period
        }
    }, []);

    // Track mouse for hover card
    const handleMouseMove = useCallback((e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        mousePosRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }, []);

    // Close context menu on click elsewhere
    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // Intelligent Auto-Optimize
    const handleAutoOptimize = useCallback(() => {
        const nodeCount = graphData.nodes.length;
        if (nodeCount === 0) return;

        graphData.nodes.forEach(n => {
            n.fx = undefined;
            n.fy = undefined;
        });

        const targetRepulsion = Math.min(1500, Math.max(120, nodeCount * 1.8 + 100));
        const targetLinkDist = Math.min(400, Math.max(50, nodeCount * 0.25 + 45));

        setRepulsion(Math.round(targetRepulsion));
        setLinkDistance(Math.round(targetLinkDist));

        setTimeout(() => {
            graphRef.current?.d3ReheatSimulation();
            graphRef.current?.zoomToFit(600);
        }, 100);
    }, [graphData.nodes]);

    // Shuffle Physics (Reset Pins)
    const handleShufflePhysics = useCallback(() => {
        graphData.nodes.forEach(n => {
            n.fx = undefined;
            n.fy = undefined;
        });
        graphRef.current?.d3ReheatSimulation();
        graphRef.current?.zoomToFit(500);
    }, [graphData.nodes]);

    const handleHideNode = (nodeId) => {
        setHiddenNodes(prev => {
            const next = new Set(prev);
            next.add(nodeId);
            return next;
        });
        setContextMenu(null);
    };

    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setContainerDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Apply forces
    useEffect(() => {
        if (!graphRef.current) return;
        const fg = graphRef.current;
        fg.d3Force('charge').strength(-repulsion);
        fg.d3Force('link')
            .distance(link => link.distanceOverride || linkDistance)
            .strength(link => link.strength || 0.1);

        fg.d3Force('center', null);
        fg.d3Force('x', forceX(0).strength(gravity));
        fg.d3Force('y', forceY(0).strength(gravity));
        fg.d3Force('collide', forceCollide(18));
        fg.d3ReheatSimulation();

        // Auto-zoom if needed, but 0,0 is now always center
    }, [repulsion, linkDistance, gravity]);

    // Process Graph Data
    useEffect(() => {
        if (!books || books.length === 0) {
            setGraphData({ nodes: [], links: [] });
            return;
        }

        const nodes = [];
        const links = [];
        const nodeMap = new Map();
        const BROAD_TAGS = ['Fiction', 'Non-Fiction'];

        books.forEach(book => {
            const bookId = book.filepath;
            // Early skip if book is hidden (optional, but good for filtering)
            if (hiddenNodes.has(bookId)) return;

            if (!nodeMap.has(bookId)) {
                nodes.push({
                    id: bookId,
                    name: book.title || book.filepath.split('\\').pop(),
                    type: 'book',
                    val: 4,
                    color: '#818cf8',
                    bookData: book
                });
                nodeMap.set(bookId, true);
            }

            const categories = book.master_tags
                ? book.master_tags.split(',').map(t => t.trim()).filter(t => t && !BROAD_TAGS.includes(t))
                : [];

            let tags = [];
            if (book.tags) {
                try {
                    tags = typeof book.tags === 'string'
                        ? (book.tags.startsWith('[') ? JSON.parse(book.tags) : book.tags.split(',').map(t => t.trim()))
                        : book.tags;
                } catch (e) {
                    tags = typeof book.tags === 'string' ? book.tags.split(',').map(t => t.trim()) : [];
                }
            }
            tags = [...new Set(tags.filter(t => t && t.trim() && !categories.includes(t.trim()) && !BROAD_TAGS.includes(t.trim())))];

            categories.forEach(cat => {
                const catId = `tag-${cat}`;
                if (hiddenNodes.has(catId)) return; // Skip hidden Categories

                if (!nodeMap.has(catId)) {
                    nodes.push({ id: catId, name: cat, type: 'tag', isCategory: true, val: 7, color: '#fbbf24' });
                    nodeMap.set(catId, true);
                }
                if (tags.length > 0) {
                    tags.forEach(tag => {
                        const tagId = `tag-${tag}`;
                        if (!hiddenNodes.has(tagId)) {
                            links.push({ source: catId, target: tagId, strength: 0.25 });
                        }
                    });
                } else {
                    links.push({ source: catId, target: bookId, distanceOverride: 40, strength: 0.5 });
                }
            });

            tags.forEach((tag, idx) => {
                const tagId = `tag-${tag}`;
                if (hiddenNodes.has(tagId)) return; // Skip hidden Tags

                if (!nodeMap.has(tagId)) {
                    nodes.push({ id: tagId, name: tag, type: 'tag', isCategory: false, val: 5, color: '#34d399' });
                    nodeMap.set(tagId, true);
                }
                links.push({ source: tagId, target: bookId, distanceOverride: 25, strength: 1.0 });
                if (idx < tags.length - 1) {
                    links.push({ source: tagId, target: `tag-${tags[idx + 1]}`, strength: 0.1 });
                }
            });
        });

        // Filter valid links (both source and target must exist in nodeMap)
        // Since we skipped adding nodes if hidden, we just need to ensure links resolve.
        // But our link-building logic above optimistically pushed some links.
        // Let's safe filter.
        const validLinks = links.filter(l => {
            // Source/Target can be objects or ID strings depending on d3 state... 
            // In init, they are strings. on Re-init, they might be objects.
            // But we are rebuilding from scratch every time books or hiddenNodes changes.
            const s = l.source.id || l.source;
            const t = l.target.id || l.target;
            return nodeMap.has(s) && nodeMap.has(t);
        });

        const seenLinks = new Set();
        const uniqueLinks = validLinks.filter(l => {
            const key = `${l.source}-${l.target}`;
            if (seenLinks.has(key)) return false;
            seenLinks.add(key);
            return true;
        });

        // SORT NODES: Books(bottom) -> Tags(middle) -> Categories(top)
        // Canvas draws in order, so last item is on top.
        nodes.sort((a, b) => {
            const score = (type, isCat) => {
                if (type === 'book') return 1;
                if (type === 'tag' && !isCat) return 2;
                if (type === 'tag' && isCat) return 3;
                return 0;
            };
            return score(a.type, a.isCategory) - score(b.type, b.isCategory);
        });

        setGraphData({ nodes, links: uniqueLinks });

        // Auto-optimize after a short delay on first load/significant change
        // This ensures physics settle and camera centers correctly
        if (nodes.length > 0) {
            setTimeout(handleAutoOptimize, 300);
        }

    }, [books, hiddenNodes]);

    // V20: Hierarchical Neighbor Filtering
    const findChildren = useCallback((node) => {
        const children = new Set();
        graphData.links.forEach(link => {
            const source = link.source.id ? link.source : graphData.nodes.find(n => n.id === link.source);
            const target = link.target.id ? link.target : graphData.nodes.find(n => n.id === link.target);

            const sid = source.id;
            const tid = target.id;

            if (sid === node.id) {
                if (node.isCategory && (target.type === 'tag' || target.type === 'book')) children.add(target);
                if (node.type === 'tag' && !node.isCategory && target.type === 'book') children.add(target);
            }
            if (tid === node.id) {
                if (node.isCategory && (source.type === 'tag' || source.type === 'book')) children.add(source);
                if (node.type === 'tag' && !node.isCategory && source.type === 'book') children.add(source);
            }
        });
        return Array.from(children);
    }, [graphData.links, graphData.nodes]);

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="w-full h-full bg-neutral-950 rounded-2xl overflow-hidden border border-white/5 relative flex flex-col shadow-2xl"
        >
            {/* Minimal Legend */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none select-none">
                <div className="flex flex-col gap-1.5 bg-black/40 backdrop-blur-xl p-2.5 rounded-xl border border-white/10 shadow-xl">
                    <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-0.5 ml-0.5">Legend</div>

                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24] shadow-[0_0_6px_rgba(251,191,36,0.4)]"></div>
                        <span className="text-[10px] font-bold text-neutral-300">Categories</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#34d399] shadow-[0_0_6px_rgba(52,211,153,0.4)]"></div>
                        <span className="text-[10px] font-medium text-neutral-400">Tags</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#818cf8] shadow-[0_0_6px_rgba(129,140,248,0.4)]"></div>
                        <span className="text-[10px] font-medium text-neutral-400">Books</span>
                    </div>
                </div>
            </div>

            {/* Context Overlay (Search/Tags) */}
            {/* Context Overlay (Search/Tags) */}
            {(searchQuery || (selectedTags && selectedTags.length > 0)) && (
                <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-none select-none opacity-90 hover:opacity-100 transition-opacity p-2">
                    {searchQuery && (
                        <div className="flex items-center gap-3 bg-black/80 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/15 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-500">
                            <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">Search</span>
                            <span className="text-base font-bold text-indigo-300 shadow-indigo-500/20 drop-shadow-sm">{searchQuery}</span>
                        </div>
                    )}
                    {selectedTags?.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5 max-w-[300px]">
                            {selectedTags.map(tag => (
                                <span key={tag} className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-[10px] font-medium border border-emerald-500/30 backdrop-blur-md shadow-lg">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Custom Context Menu */}
            {contextMenu && (
                <div
                    className="absolute z-50 bg-neutral-900 border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="px-3 py-1.5 text-[10px] text-neutral-500 font-bold uppercase tracking-wider border-b border-white/5 mb-1">
                        {contextMenu.type === 'background' ? 'Graph Actions' :
                            (contextMenu.node.type === 'tag' ? (contextMenu.node.isCategory ? 'Category' : 'Tag') : 'Book')}
                    </div>

                    {contextMenu.type === 'background' ? (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const canvas = containerRef.current.querySelector('canvas');
                                    if (canvas) {
                                        const link = document.createElement('a');
                                        link.download = `library-graph-${Date.now()}.png`;
                                        link.href = canvas.toDataURL();
                                        link.click();
                                    }
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-3 py-2 text-neutral-300 hover:bg-white/5 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Save Image
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const canvas = containerRef.current.querySelector('canvas');
                                    if (canvas) {
                                        canvas.toBlob(blob => {
                                            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                                        });
                                    }
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-3 py-2 text-neutral-300 hover:bg-white/5 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy Image
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleHideNode(contextMenu.node.id);
                            }}
                            className="w-full text-left px-3 py-2 text-red-400 hover:bg-white/5 hover:text-red-300 text-xs font-medium flex items-center gap-2 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            Hide from View
                        </button>
                    )}
                </div>
            )}

            {/* Enhanced Hover Card (Book) */}
            {hoveredNode?.type === 'book' && !draggedNode && !contextMenu && (
                <div
                    className="absolute z-40 pointer-events-auto bg-neutral-900/95 backdrop-blur-2xl p-4 rounded-2xl border border-white/15 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] w-72 flex flex-col gap-3 transition-opacity animate-in fade-in zoom-in duration-150"
                    style={{
                        left: Math.min(popupPos.x + 20, containerDimensions.width - 300),
                        top: Math.min(popupPos.y + 20, containerDimensions.height - 240)
                    }}
                    onMouseEnter={() => {
                        if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = null;
                        }
                    }}
                    onMouseLeave={() => {
                        hoverTimeoutRef.current = setTimeout(() => {
                            setHoveredNode(null);
                        }, 300);
                    }}
                >
                    <div className="space-y-1">
                        <div className="text-xs font-bold text-white line-clamp-2 leading-tight">
                            {hoveredNode.bookData.title || hoveredNode.name}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                            {hoveredNode.bookData.author} • {hoveredNode.bookData.year}
                        </div>
                    </div>

                    {hoveredNode.bookData.summary && (
                        <div className="text-[10px] text-neutral-300 leading-relaxed line-clamp-4 bg-white/5 p-2 rounded-lg italic">
                            {hoveredNode.bookData.summary}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3 mt-1">
                        <div className="text-[8px] text-neutral-500 font-mono truncate flex-1 opacity-50">
                            {hoveredNode.bookData.filepath}
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenFolder?.(hoveredNode.bookData.filepath);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-bold flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            Open Folder
                        </button>
                    </div>
                </div>
            )}

            {/* Compact Control Panel */}
            <div className={`absolute bottom-6 right-6 z-10 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-10 h-10 p-0 rounded-full' : 'w-44 p-4 rounded-2xl'} bg-neutral-900/80 backdrop-blur-2xl border border-white/10 text-neutral-300 shadow-2xl overflow-hidden`}>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={`absolute ${isCollapsed ? 'inset-0 w-full h-full flex items-center justify-center' : 'top-3 right-3'} text-neutral-500 hover:text-white transition-colors`}
                >
                    {isCollapsed ?
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> :
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                </button>

                {!isCollapsed && (
                    <div className="space-y-4 pr-1">
                        <div className="space-y-1">
                            <div className="flex justify-between items-center px-0.5">
                                <span className="text-[9px] font-medium text-neutral-500 uppercase">Repulsion</span>
                                <span className="text-[9px] font-mono text-indigo-400">{repulsion}</span>
                            </div>
                            <input type="range" min="10" max="1500" step="10" value={repulsion} onChange={(e) => setRepulsion(Number(e.target.value))} className="w-full h-1 bg-white/5 rounded-full appearance-none accent-indigo-500" />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-center px-0.5">
                                <span className="text-[9px] font-medium text-neutral-500 uppercase">Tag Spacing</span>
                                <span className="text-[9px] font-mono text-indigo-400">{linkDistance}</span>
                            </div>
                            <input type="range" min="10" max="400" step="5" value={linkDistance} onChange={(e) => setLinkDistance(Number(e.target.value))} className="w-full h-1 bg-white/5 rounded-full appearance-none accent-indigo-500" />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="flex items-center justify-between bg-white/5 px-2.5 py-1.5 rounded-xl text-[10px] cursor-pointer hover:bg-white/10 transition-colors">
                                <span className="text-neutral-300">Category Labels</span>
                                <input type="checkbox" checked={showCategoryLabels} onChange={(e) => setShowCategoryLabels(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                            </label>

                            <label className="flex items-center justify-between bg-white/5 px-2.5 py-1.5 rounded-xl text-[10px] cursor-pointer hover:bg-white/10 transition-colors">
                                <span className="text-neutral-300">Tag Labels</span>
                                <input type="checkbox" checked={showTagLabels} onChange={(e) => setShowTagLabels(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                            </label>

                            <button onClick={handleAutoOptimize} className="w-full bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-400/30 py-1.5 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center gap-1.5" title="Set spacing & clear all pins">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                Auto Optimize
                            </button>

                            {hiddenNodes.size > 0 && (
                                <button onClick={() => setHiddenNodes(new Set())} className="w-full bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 border border-amber-500/30 py-1.5 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    Reset Hidden ({hiddenNodes.size})
                                </button>
                            )}

                            <button onClick={() => graphRef.current?.zoomToFit(500)} className="w-full bg-white/10 hover:bg-white/15 text-white py-1.5 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center gap-1.5 border border-white/5" title="Recenter the camera">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                Focus Camera
                            </button>
                        </div>

                        <button onClick={handleShufflePhysics} className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-1.5 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center gap-1.5 border border-white/5" title="Recalculate layout & CLEAR ALL PINS">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Clear Pins & Shuffle
                        </button>
                    </div>
                )}
            </div>

            <ForceGraph2D
                ref={graphRef}
                width={containerDimensions.width}
                height={containerDimensions.height}
                graphData={graphData}
                nodeCanvasObjectMode={() => 'replace'}
                onNodeHover={handleNodeHover}
                onNodeRightClick={(node, event) => {
                    // Prevent default prompt and show custom menu
                    // Note: ForceGraph2D doesn't automatically preventDefault on right click? 
                    // Let's rely on standard onContext handling if this doesn't work.
                    // Actually, onNodeRightClick exposes the event.
                    // BUT: react-force-graph docs say `onNodeRightClick(node, event)`

                    // We need to calculate position relative to container or page. 
                    // Let's use page coordinates from event.
                    // IMPORTANT: The event object might be D3 event or React synthetic?
                    // Typically it's a JS MouseEvent.

                    // Debug: console.log(event);

                    // We'll update the context menu position
                    setContextMenu({
                        x: mousePosRef.current.x, // relative to container is easier for absolute positioning inside relative container
                        y: mousePosRef.current.y,
                        node
                    });
                }}
                onBackgroundRightClick={(event) => {
                    // Show background context menu
                    setContextMenu({
                        x: mousePosRef.current.x,
                        y: mousePosRef.current.y,
                        type: 'background',
                        node: null
                    });
                }}
                onNodeDrag={(node, translate) => {
                    setDraggedNode(node);
                    const children = findChildren(node);
                    const inhaleFactor = node.isCategory ? 0.02 : 0.05;
                    const minDistFloor = node.isCategory ? 60 : 35;
                    const siblingMinDist = node.isCategory ? 45 : 25;

                    children.forEach((child, idx) => {
                        let targetX = (child.fx || child.x) + translate.x;
                        let targetY = (child.fy || child.y) + translate.y;

                        const dx = node.x - targetX;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist > minDistFloor) {
                            targetX += dx * inhaleFactor;
                            targetY += dy * inhaleFactor;
                        }

                        for (let j = 0; j < idx; j++) {
                            const sib = children[j];
                            const sdx = targetX - (sib.fx || sib.x);
                            const sdy = targetY - (sib.fy || sib.y);
                            const sdist = Math.sqrt(sdx * sdx + sdy * sdy);

                            if (sdist < siblingMinDist && sdist > 0) {
                                const push = (siblingMinDist - sdist) / sdist * 0.5;
                                targetX += sdx * push;
                                targetY += sdy * push;
                            }
                        }

                        child.fx = targetX;
                        child.fy = targetY;
                    });
                }}
                onNodeDragEnd={(node) => {
                    setDraggedNode(null);
                    node.fx = node.x;
                    node.fy = node.y;
                    const children = findChildren(node);
                    children.forEach(child => {
                        child.fx = child.x;
                        child.fy = child.y;
                    });
                }}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const r = node.val || 5;
                    const name = node.name || '';
                    const safeScale = globalScale || 1;
                    ctx.save();
                    ctx.fillStyle = node.color || '#fff';
                    if (node.isCategory) {
                        const size = r * 2;
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(node.x - r, node.y - r, size, size, 1.5);
                            ctx.fill();
                        } else {
                            ctx.fillRect(node.x - r, node.y - r, size, size);
                        }
                    } else {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    const shouldShowLabel = node.isCategory ? showCategoryLabels : showTagLabels;

                    if (shouldShowLabel && (node.type === 'tag' || node.isCategory)) {
                        const fontSize = Math.max(1, 13 / safeScale);
                        ctx.font = `${node.isCategory ? '600' : '400'} ${fontSize}px Inter, system-ui, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        const textY = node.y + r + (3 / safeScale);
                        const textWidth = ctx.measureText(name).width;
                        const padX = 4 / safeScale;
                        const padY = 1 / safeScale;
                        const bckgW = textWidth + (padX * 2);
                        const bckgH = fontSize + (padY * 2);
                        ctx.fillStyle = 'rgba(0,0,0,0.85)';
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(node.x - bckgW / 2, textY, bckgW, bckgH, 2 / safeScale);
                            ctx.fill();
                        } else {
                            ctx.fillRect(node.x - bckgW / 2, textY, bckgW, bckgH);
                        }
                        ctx.fillStyle = node.isCategory ? '#fbbf24' : '#34d399';
                        ctx.fillText(name, node.x, textY + padY);
                    }
                    ctx.restore();
                }}
                nodeLabel={(node) => node.type === 'book' ? '' : `<div style="background: rgba(0,0,0,0.85); color: white; padding: 6px 10px; border-radius: 6px; font-size: 11px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(4px);"><b>${node.name}</b></div>`}
                linkColor={(link) => {
                    const isSource = link.source.id === draggedNode?.id || link.source === draggedNode?.id;
                    const isTarget = link.target.id === draggedNode?.id || link.target === draggedNode?.id;
                    return (isSource || isTarget) ? 'rgba(129, 140, 248, 0.8)' : 'rgba(255,255,255,0.06)';
                }}
                linkWidth={(link) => {
                    const isSource = link.source.id === draggedNode?.id || link.source === draggedNode?.id;
                    const isTarget = link.target.id === draggedNode?.id || link.target === draggedNode?.id;
                    return (isSource || isTarget) ? 2 : 1;
                }}
                onNodeClick={(node) => node.type === 'book' && onNodeClick?.(node.bookData)}
                cooldownTicks={100}
            />
        </div>
    );
}
