import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceX, forceY, forceCollide } from 'd3-force';

export default function LibraryGraph({ books, onNodeClick }) {
    const graphRef = useRef();
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef(null);

    // Force controls
    const [repulsion, setRepulsion] = useState(150);
    const [linkDistance, setLinkDistance] = useState(45);
    const [gravity, setGravity] = useState(0.08);
    const [showLabels, setShowLabels] = useState(true);

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
        fg.d3Force('link').distance(linkDistance);
        fg.d3Force('center', null);
        fg.d3Force('x', forceX(containerDimensions.width / 2).strength(gravity));
        fg.d3Force('y', forceY(containerDimensions.height / 2).strength(gravity));
        fg.d3Force('collide', forceCollide(15));
        fg.d3ReheatSimulation();
    }, [repulsion, linkDistance, gravity, containerDimensions]);

    // Process Graph Data
    useEffect(() => {
        if (!books || books.length === 0) {
            setGraphData({ nodes: [], links: [] });
            return;
        }

        const nodes = [];
        const links = [];
        const nodeMap = new Map();

        // 1. Identify all master tags (categories)
        const categorySet = new Set();
        books.forEach(book => {
            if (book.master_tags) {
                book.master_tags.split(',').forEach(t => categorySet.add(t.trim()));
            }
        });

        // 2. Build Nodes and Links
        books.forEach(book => {
            const bookId = book.filepath;
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

            const categories = book.master_tags ? book.master_tags.split(',').map(t => t.trim()).filter(Boolean) : [];
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
            tags = [...new Set(tags.filter(t => t && t.trim() && !categories.includes(t.trim())))];

            // Category Nodes and Links
            categories.forEach(cat => {
                const catId = `cat-${cat}`;
                if (!nodeMap.has(catId)) {
                    nodes.push({
                        id: catId,
                        name: cat,
                        type: 'tag',
                        isCategory: true,
                        val: 10,
                        color: '#fbbf24'
                    });
                    nodeMap.set(catId, true);
                }

                if (tags.length > 0) {
                    tags.forEach(tag => {
                        links.push({ source: catId, target: `tag-${tag}` });
                    });
                } else {
                    links.push({ source: catId, target: bookId });
                }
            });

            // Tag Nodes and Book Links
            tags.forEach((tag, idx) => {
                const tagId = `tag-${tag}`;
                if (!nodeMap.has(tagId)) {
                    nodes.push({
                        id: tagId,
                        name: tag,
                        type: 'tag',
                        isCategory: false,
                        val: 6,
                        color: '#34d399'
                    });
                    nodeMap.set(tagId, true);
                }

                links.push({ source: tagId, target: bookId });

                if (idx < tags.length - 1) {
                    links.push({ source: tagId, target: `tag-${tags[idx + 1]}` });
                }
            });
        });

        const uniqueLinks = [];
        const seenLinks = new Set();
        links.forEach(l => {
            const key = `${l.source}-${l.target}`;
            if (!seenLinks.has(key)) {
                uniqueLinks.push(l);
                seenLinks.add(key);
            }
        });

        setGraphData({ nodes, links: uniqueLinks });
    }, [books]);

    return (
        <div ref={containerRef} className="w-full h-full bg-neutral-950 rounded-2xl overflow-hidden border border-white/5 relative flex flex-col shadow-2xl">
            {/* Legend */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none select-none">
                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/10 shadow-xl">
                    <div className="text-[10px] text-indigo-400 font-mono mr-1">V7</div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24]"></div>
                        <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Categories</span>
                    </div>
                    <div className="w-px h-3 bg-white/10"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></div>
                        <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Tags</span>
                    </div>
                    <div className="w-px h-3 bg-white/10"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#818cf8]"></div>
                        <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Books</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-6 right-6 z-10 bg-neutral-900/80 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 text-neutral-300 w-56 space-y-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[11px] font-medium text-neutral-400">Repulsion</span>
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">{repulsion}</span>
                    </div>
                    <input type="range" min="10" max="1000" step="10" value={repulsion} onChange={(e) => setRepulsion(Number(e.target.value))} className="w-full accent-indigo-500 h-1 rounded-full appearance-none bg-white/10 cursor-pointer" />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[11px] font-medium text-neutral-400">Link Length</span>
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">{linkDistance}</span>
                    </div>
                    <input type="range" min="10" max="300" step="5" value={linkDistance} onChange={(e) => setLinkDistance(Number(e.target.value))} className="w-full accent-indigo-500 h-1 rounded-full appearance-none bg-white/10 cursor-pointer" />
                </div>

                <div className="flex items-center justify-between bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[11px] font-medium text-neutral-300">Show Labels</span>
                    <button
                        onClick={() => setShowLabels(!showLabels)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${showLabels ? 'bg-indigo-600' : 'bg-white/10'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showLabels ? 'left-6' : 'left-1'}`}></div>
                    </button>
                </div>

                <button
                    onClick={() => graphRef.current?.zoomToFit(500)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white py-3 rounded-2xl font-bold text-[12px] shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    Fit to Contents
                </button>
            </div>

            <ForceGraph2D
                ref={graphRef}
                width={containerDimensions.width}
                height={containerDimensions.height}
                graphData={graphData}
                nodeCanvasObjectMode="replace"
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const radius = node.val || 4;
                    const label = node.name || '';
                    const safeScale = globalScale || 1;

                    ctx.save();

                    // 1. DRAW NODE
                    ctx.fillStyle = node.color || '#fff';
                    if (node.isCategory) {
                        ctx.fillRect(node.x - radius, node.y - radius, radius * 2, radius * 2);
                    } else {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    // 2. DRAW LABEL
                    if (showLabels && (node.isCategory || node.type === 'tag' || safeScale > 1.5)) {
                        const fontSize = Math.max(1, 14 / safeScale);
                        ctx.font = `${node.isCategory ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';

                        const textY = node.y + radius + (4 / safeScale);
                        const textWidth = ctx.measureText(label).width;
                        const bckgW = textWidth + (4 / safeScale);
                        const bckgH = fontSize + (2 / safeScale);

                        // Solid dark background for text
                        ctx.fillStyle = 'rgba(0,0,0,0.85)';
                        ctx.fillRect(node.x - bckgW / 2, textY, bckgW, bckgH);

                        // Text Rendering
                        ctx.fillStyle = node.isCategory ? '#fbbf24' : (node.type === 'tag' ? '#34d399' : '#fff');
                        ctx.fillText(label, node.x, textY + (1 / safeScale));
                    }
                    ctx.restore();
                }}
                nodeLabel={(node) => {
                    const labelStyle = "background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(4px);";
                    if (node.isCategory) return `<div style="${labelStyle} border-color: #fbbf24;"><b>Category:</b> ${node.name}</div>`;
                    if (node.type === 'tag') return `<div style="${labelStyle} border-color: #10b981;"><b>Tag:</b> ${node.name}</div>`;
                    return `<div style="${labelStyle} border-color: #818cf8; text-align: center;"><b>${node.name}</b><br/><span style="opacity: 0.6;">Click to open</span></div>`;
                }}
                linkColor={() => 'rgba(255,255,255,0.06)'}
                onNodeClick={(node) => node.type === 'book' && onNodeClick?.(node.bookData)}
                cooldownTicks={100}
                onEngineStop={() => graphRef.current?.zoomToFit(400)}
            />
        </div>
    );
}
