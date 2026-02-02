import { useState, useEffect, useRef } from 'react'
import Utilities from './components/Utilities'

// Helper for robust SSE parsing
const processSSEStream = async (response, onData, onError) => {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split by double newline which marks end of SSE event
      const parts = buffer.split('\n\n')

      // Keep the last part in buffer as it might be incomplete
      buffer = parts.pop()

      for (const part of parts) {
        const line = part.trim()
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onData(data)
          } catch (e) {
            console.warn('Failed to parse SSE chunk:', e)
          }
        }
      }
    }
  } catch (error) {
    if (onError) onError(error)
    else console.error('Stream processing failed', error)
  }
}

function App() {
  const [path, setPath] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessingMetadata, setIsProcessingMetadata] = useState(false)
  const [isProcessingContent, setIsProcessingContent] = useState(false)
  const [stats, setStats] = useState({
    found: 0,
    added: 0,
    skipped: 0,
    metadataExtracted: 0,
    metadataFailed: 0,
    currentFile: ''
  })
  const [taggingStats, setTaggingStats] = useState({ processed: 0, total: 0, current: '' })
  const [totalLibraryCount, setTotalLibraryCount] = useState(0)
  const [books, setBooks] = useState([])

  // Taxonomy Doctor State
  const [showTaxonomyDoctor, setShowTaxonomyDoctor] = useState(false)
  const [showUtilities, setShowUtilities] = useState(false)
  const [doctorTag, setDoctorTag] = useState('')
  const [doctorResult, setDoctorResult] = useState(null)
  const [rulesContent, setRulesContent] = useState('')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [isEditingRules, setIsEditingRules] = useState(false)

  // Phase 1 UI improvements
  const [scanSectionCollapsed, setScanSectionCollapsed] = useState(() => {
    const saved = localStorage.getItem('scanCollapsed')
    return saved === 'true'
  })
  const [activeTagFilters, setActiveTagFilters] = useState([])
  const [activeAuthorFilters, setActiveAuthorFilters] = useState([])
  const [activeYearFilter, setActiveYearFilter] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' })
  const [hoveredRow, setHoveredRow] = useState(null)
  const [scanningBookId, setScanningBookId] = useState(null)
  const [syncingMetadataId, setSyncingMetadataId] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { id: 1, field: 'title' }
  const [isSyncingTaxonomy, setIsSyncingTaxonomy] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(500)
  const [exportPath, setExportPath] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [taxonomyStats, setTaxonomyStats] = useState({ state: 'idle', current: 0, total: 0, message: '' })
  const [isBackendOnline, setIsBackendOnline] = useState(false)
  const [isAiOnline, setIsAiOnline] = useState(false)
  const [aiStatusDetail, setAiStatusDetail] = useState('AI Offline')
  const [aiModelName, setAiModelName] = useState('')
  const [aiContextSize, setAiContextSize] = useState(0)
  const [dismissedErrorPaths, setDismissedErrorPaths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissedErrorPaths') || '[]')
    } catch {
      return []
    }
  })

  // Back to Top State
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // FIX: Use ref to access latest search query inside long-running async closures
  const searchRef = useRef(debouncedSearch)

  useEffect(() => {
    searchRef.current = debouncedSearch
  }, [debouncedSearch])

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch on Debounce Change
  useEffect(() => {
    setCurrentPage(1)
    fetchBooks()
  }, [debouncedSearch])

  // Poll server status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000) // 1s timeout

        const res = await fetch(`/api/health?t=${Date.now()}`, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (res.ok) {
          try {
            const data = await res.json()
            if (data.status === 'ok') {
              setIsBackendOnline(true)
              setIsAiOnline(data.ai === true)
              setAiStatusDetail(data.ai_detail || (data.ai ? 'AI Ready' : 'AI Offline'))
              setAiModelName(data.ai_name || '')
              setAiContextSize(data.ai_context_size || 0)
            } else {
              setIsBackendOnline(false)
              setIsAiOnline(false)
              setAiStatusDetail('AI Offline')
              setAiModelName('')
              setAiContextSize(0)
            }
          } catch (jsonErr) {
            setIsBackendOnline(false)
            setIsAiOnline(false)
            setAiStatusDetail('AI Offline')
            setAiModelName('')
          }
        } else {
          setIsBackendOnline(false)
          setIsAiOnline(false)
          setAiStatusDetail('AI Offline')
          setAiModelName('')
        }
      } catch (e) {
        setIsBackendOnline(false)
        setIsAiOnline(false)
      }
    }

    // Check Scan Status (Headless support)
    const checkScanStatus = async () => {
      try {
        const res = await fetch('/api/scan/status');
        const data = await res.json();

        if (data.active) {
          // If backend says active but frontend didn't know, Update UI
          setIsProcessingContent(true);
          // Calculate ETA if possible
          let etaMsg = '';
          if (data.startTime && data.processed > 0) {
            const now = Date.now();
            const elapsed = now - data.startTime;
            const msPerBook = elapsed / data.processed;
            const remaining = data.total - data.processed;
            const etaMs = remaining * msPerBook;

            const hours = Math.floor(etaMs / 3600000);
            const minutes = Math.floor((etaMs % 3600000) / 60000);
            const seconds = Math.floor((etaMs % 60000) / 1000);

            if (hours > 0) etaMsg = `ETA: ${hours}h ${minutes}m`;
            else etaMsg = `ETA: ${minutes}m ${seconds}s`;
          }

          let bpmValue = 0;
          if (data.startTime && data.processed > 0) {
            const now = Date.now();
            const elapsedMinutes = (now - data.startTime) / 60000;
            if (elapsedMinutes > 0.1) { // Wait for 6 seconds to show data
              bpmValue = (data.processed / elapsedMinutes).toFixed(1);
            }
          }

          setTaggingStats({
            processed: data.processed,
            total: data.total,
            current: data.currentFile || 'Processing...',
            startTime: data.startTime,
            eta: etaMsg,
            bpm: bpmValue
          });
        } else if (isProcessingContent && !data.active) {
          // Backend finished but UI still thinks it's running? 
          // Wait, maybe we just finished. 
          // Let's only turn OFF if we were polling for it.
          // Actually, if we are in "Zombie" mode (reloaded page), 
          // we want to know when it stops.
          // But we don't want to conflict with the event stream if it's live.
          // Simpler: Just sync stats if active.

          // If we JUST reloaded the page, isProcessingContent is false.
          // If data.active is false, we stay false.

          // If we are running (isProcessingContent=true) and data.active=false...
          // It might mean the scan just finished.
          // But normally the SSE 'complete' event handles this.
          // However, if we lost SSE (reload), we depend on this poller to finish.
          setIsProcessingContent(false);
        }
      } catch (e) {
        console.error("Failed to check scan status", e);
      }
    };

    checkHealth() // Initial check
    checkScanStatus() // Initial check

    // If we are actively scanning/processing, ping LESS often to save resources (15s)
    // Otherwise, ping frequently to show responsiveness (2s)
    const pollInterval = (isScanning || isProcessingContent || isSyncingTaxonomy) ? 5000 : 2000;
    // We increased frequency during scan for better "Resume" feel, 5s is fine.

    const interval = setInterval(() => {
      checkHealth();
      checkScanStatus();
    }, pollInterval);

    return () => clearInterval(interval)
  }, [isScanning, isProcessingContent, isSyncingTaxonomy])

  const fetchBooks = async () => {
    try {
      const query = new URLSearchParams()
      // FIX: Read from ref to avoid stale closure issues during long scans
      if (searchRef.current) query.append('q', searchRef.current)

      const res = await fetch(`/api/books?${query.toString()}`)

      const totalHeader = res.headers.get('X-Library-Size')
      if (totalHeader) {
        setTotalLibraryCount(parseInt(totalHeader, 10))
      }

      const data = await res.json()
      setBooks(data)
    } catch (e) {
      console.error("Failed to fetch books", e)
    }
  }

  useEffect(() => {
    if (showTaxonomyDoctor) {
      fetch('/api/taxonomy/rules')
        .then(res => res.json())
        .then(data => {
          if (data.success) setRulesContent(data.content || '')
        })
        .catch(e => console.error("Failed to load rules", e))
    }
  }, [showTaxonomyDoctor])

  useEffect(() => {
    if (showRulesEditor) {
      fetch('/api/taxonomy/rules')
        .then(res => res.json())
        .then(data => {
          if (data.success) setRulesContent(data.content || '')
        })
        .catch(e => console.error("Failed to load rules", e))
    }
  }, [showRulesEditor])

  useEffect(() => {
    fetchBooks()
  }, [])

  const startScan = async () => {
    if (!path) return
    setIsScanning(true)
    setStats({ found: 0, added: 0, skipped: 0, currentFile: 'Starting...' })

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })

      await processSSEStream(response, (data) => {
        if (data.type === 'progress') {
          setStats({
            found: data.found,
            added: data.added,
            skipped: data.skipped,
            metadataExtracted: data.metadataExtracted,
            metadataFailed: data.metadataFailed,
            currentFile: data.currentFile
          })
        } else if (data.type === 'complete') {
          setIsScanning(false)
          fetchBooks() // Refresh list
        }
      }, (err) => {
        console.error('Scan stream error', err)
        setIsScanning(false)
      })
    } catch (error) {
      console.error('Scan failed', error)
      setIsScanning(false)
    }
  }


  const startTagGeneration = async () => {
    // Check if we are filtering
    const hasFilters = activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || searchQuery || activeYearFilter;
    const targetFilepaths = hasFilters ? filteredBooks.map(b => b.filepath) : null;

    if (hasFilters && targetFilepaths.length === 0) {
      alert("No books match your filter!");
      return;
    }


    setIsProcessingContent(true)
    try {
      const response = await fetch('/api/books/process-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFilepaths })
      })

      await processSSEStream(response, (data) => {
        if (data.type === 'start') {
          setTaggingStats({ processed: 0, total: data.total, current: 'Starting AI analysis...', startTime: Date.now() })
        } else if (data.type === 'progress') {
          setTaggingStats(prev => {
            const startTime = data.startTime || prev.startTime || Date.now();
            const now = Date.now();
            const elapsed = now - startTime;

            let etaMsg = '';
            if (data.processed > 0) {
              const msPerBook = elapsed / data.processed;
              const remaining = data.total - data.processed;
              const etaMs = remaining * msPerBook;

              const hours = Math.floor(etaMs / 3600000);
              const minutes = Math.floor((etaMs % 3600000) / 60000);
              const seconds = Math.floor((etaMs % 60000) / 1000);

              if (hours > 0) etaMsg = `ETA: ${hours}h ${minutes}m`;
              else etaMsg = `ETA: ${minutes}m ${seconds}s`;
            }

            return {
              processed: data.processed,
              total: data.total,
              current: data.current,
              startTime: startTime,
              eta: etaMsg,
              bpm: elapsed > 6000 ? (data.processed / (elapsed / 60000)).toFixed(1) : 0
            };
          })
          fetchBooks()
        } else if (data.type === 'complete') {
          setIsProcessingContent(false)
          fetchBooks()
        }
      }, (err) => {
        console.error('Tagging stream error', err)
        setIsProcessingContent(false)
      })
    } catch (error) {
      console.error('Tag generation failed', error)
      setIsProcessingContent(false)
    }
  }

  const handleSingleScan = async (bookId, filepath) => {
    setScanningBookId(bookId)
    try {
      const response = await fetch('/api/scan-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath })
      })
      if (response.ok) {
        await fetchBooks()
      } else {
        const error = await response.json()
        alert(`Scan failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setScanningBookId(null)
    }
  }

  const handleMetadataSync = async (bookId, filepath) => {
    setSyncingMetadataId(bookId)
    try {
      const response = await fetch('/api/scan-metadata-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath })
      })
      if (response.ok) {
        await fetchBooks()
        // Optional: show a small toast or subtle feedback
      } else {
        const error = await response.json()
        alert(`Sync failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setSyncingMetadataId(null)
    }
  }

  const handleSyncTaxonomy = async () => {
    setIsSyncingTaxonomy(true)
    setTaxonomyStats({ state: 'starting', current: 0, total: 0, message: 'Starting...' })

    try {
      const response = await fetch('/api/scan-master-tags', {
        method: 'POST'
      })

      await processSSEStream(response, (data) => {
        if (data.type === 'start') {
          setTaxonomyStats({ state: 'learning', current: 0, total: 0, message: 'Analyzing existing taxonomy...' })
        } else if (data.type === 'progress_learning') {
          // UX IMPROVEMENT: Show global tag progress (e.g. 4500/8000) instead of relative batches (1/8)
          // If global stats are missing (backward compat), fall back to batches
          const currentMsg = data.processedGlobal
            ? `Learning tags... (${data.processedGlobal} / ${data.totalGlobal})`
            : `Learning batch ${data.currentBatch}/${data.totalBatches}`;

          setTaxonomyStats({
            state: 'learning',
            current: data.processedGlobal || data.currentBatch,
            total: data.totalGlobal || data.totalBatches,
            message: currentMsg
          })
        } else if (data.type === 'phase_applying') {
          setTaxonomyStats({ state: 'applying', current: 0, total: 0, message: 'Applying tags to library...' })
        } else if (data.type === 'progress_applying') {
          setTaxonomyStats({
            state: 'applying',
            current: data.current,
            total: data.total,
            message: `Applying to book ${data.current} of ${data.total}`
          })
        } else if (data.type === 'complete') {
          setIsSyncingTaxonomy(false)
          setTaxonomyStats({ state: 'idle', current: 0, total: 0, message: '' })
          fetchBooks()
          alert(`Taxonomy sync complete! Applied to ${data.count} books.`)
        } else if (data.type === 'error') {
          alert(`Sync failed: ${data.message}`)
          setIsSyncingTaxonomy(false)
        }
      }, (err) => {
        console.error('Taxonomy sync failed', err)
        alert('Taxonomy sync interrupted.')
        setIsSyncingTaxonomy(false)
      })
    } catch (error) {
      alert(`Error: ${error.message}`)
      setIsSyncingTaxonomy(false)
    } finally {
      setTaxonomyStats({ state: 'idle', current: 0, total: 0, message: '' })
    }
  }

  const handleExport = async () => {
    if (!exportPath) {
      alert("Please specify a destination folder.")
      return
    }

    setIsExporting(true)
    const filepaths = filteredBooks.map(b => b.filepath)

    try {
      const response = await fetch('/api/books/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepaths, destination: exportPath })
      })

      const data = await response.json()
      if (response.ok) {
        alert(data.message)
        setExportPath('')
      } else {
        alert(`Export failed: ${data.error}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleManualUpdate = async (id, field, value) => {
    try {
      const response = await fetch('/api/books/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value })
      })
      if (response.ok) {
        setBooks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b))
        setEditingCell(null)
      } else {
        const error = await response.json()
        alert(`Update failed: ${error.error}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  // Helper functions for Phase 1 features
  const toggleScanSection = () => {
    const newState = !scanSectionCollapsed
    setScanSectionCollapsed(newState)
    localStorage.setItem('scanCollapsed', newState.toString())
  }

  const handleTagClick = (tag) => {
    setActiveTagFilters(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const removeTagFilter = (tag) => {
    setActiveTagFilters(prev => prev.filter(t => t !== tag))
  }

  const handleAuthorClick = (author) => {
    setActiveAuthorFilters(prev =>
      prev.includes(author)
        ? prev.filter(a => a !== author)
        : [...prev, author]
    )
  }

  const removeAuthorFilter = (author) => {
    setActiveAuthorFilters(prev => prev.filter(a => a !== author))
  }

  const clearAllFilters = () => {
    setActiveTagFilters([])
    setActiveAuthorFilters([])
    setActiveYearFilter(null)
  }

  const parseAuthors = (authorStr) => {
    if (!authorStr) return []

    // Check if this looks like "Last, First" format
    // Heuristic: if there's a comma followed by a single word (first name), it's likely "Last, First"
    const singleAuthorPattern = /^[^,]+,\s*\w+(\s+\w\.?)?$/
    if (singleAuthorPattern.test(authorStr.trim())) {
      // Single author in "Last, First" format - reverse it
      const parts = authorStr.split(',').map(s => s.trim())
      return [parts.slice(1).concat(parts[0]).join(' ')]
    }

    // Otherwise, split on semicolons, ampersands, or " and "
    return authorStr.split(/;|&|\s+and\s+/i)
      .map(a => a.trim())
      .filter(a => a)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Filter books by active tags AND authors
  const filteredBooks = books.filter(book => {
    let matchesTags = true
    let matchesAuthors = true

    if (activeTagFilters.length > 0) {
      const bookTags = book.tags ? book.tags.split(',').map(t => t.trim()) : []
      const masterTags = book.master_tags ? book.master_tags.split(',').map(t => t.trim()) : []
      const allTags = [...bookTags, ...masterTags]
      matchesTags = activeTagFilters.every(filter => allTags.includes(filter))
    }

    if (activeAuthorFilters.length > 0) {
      if (!book.author) {
        matchesAuthors = false
      } else {
        const bookAuthors = parseAuthors(book.author)
        matchesAuthors = activeAuthorFilters.every(filter => bookAuthors.includes(filter))
      }
    }

    return matchesTags && matchesAuthors && (!activeYearFilter || book.publication_year === activeYearFilter)
  })


  // Error Reporting Logic
  const errorBooks = books.filter(b => b.tags && (b.tags.includes('Error:') || b.tags.includes('Skipped:')))
  const newErrorBooks = errorBooks.filter(b => !dismissedErrorPaths.includes(b.filepath))

  const handleExportErrors = async () => {
    if (newErrorBooks.length === 0) return;
    if (!confirm('Generate a report of all failed/skipped books?')) return;
    try {
      const res = await fetch('/api/books/export-errors', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Report generated!\n\nFound: ${data.count} issues\nSaved to: SCAN_ERRORS.txt`);
        const allPaths = errorBooks.map(b => b.filepath);
        setDismissedErrorPaths(allPaths);
        localStorage.setItem('dismissedErrorPaths', JSON.stringify(allPaths));
      } else {
        alert('Failed to generate report.');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Sorting Logic
  const sortedBooks = [...filteredBooks].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle nulls
    if (aValue === null || aValue === undefined) aValue = '';
    if (bValue === null || bValue === undefined) bValue = '';

    // Handle Strings (Case insensitive)
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();

    // Handle Numbers (Years)
    if (sortConfig.key === 'publication_year') {
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedBooks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBooks = sortedBooks.slice(startIndex, endIndex)

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Reset to page 1 when filters change
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTagFilters, activeAuthorFilters, activeYearFilter])

  // Auto-collapse scan section after successful scan
  useEffect(() => {
    if (!isScanning && stats.added > 0 && books.length > 0) {
      setScanSectionCollapsed(true)
      localStorage.setItem('scanCollapsed', 'true')
    }
  }, [isScanning, stats.added, books.length])

  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-background text-[var(--color-text-main)] font-sans selection:bg-indigo-500/30 relative transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Toggle Theme Button */}
        <div className="absolute top-6 left-6 z-50">
          <div className="flex gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full bg-black/10 dark:bg-white/10 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-lg hover:bg-black/20 dark:hover:bg-white/20 transition-all duration-300 group"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                // Sun Icon
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-300 group-hover:rotate-90 transition-transform duration-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                // Moon Icon
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-500 group-hover:-rotate-12 transition-transform duration-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              )}
            </button>

            {/* System Utilities Toggle */}
            <button
              onClick={() => setShowUtilities(!showUtilities)}
              className={`p-2 rounded-full backdrop-blur-md border shadow-lg transition-all duration-300 group ${showUtilities
                ? 'bg-primary text-white border-primary shadow-primary/50'
                : 'bg-black/10 dark:bg-white/10 border-black/5 dark:border-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-gray-700 dark:text-neutral-300'
                }`}
              title={showUtilities ? "Back to Library" : "System Utilities"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-500 ${showUtilities ? 'rotate-180' : 'group-hover:rotate-45'}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.93l-.15.894c-.09.543-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.93l.15-.894Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Server Status Indicators */}
        <div className="absolute top-6 right-6 flex flex-col gap-2 z-50">
          {/* Backend Status */}
          <div className="flex items-center gap-2 bg-white/80 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-lg transition-all duration-300 hover:bg-white dark:hover:bg-black/60">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isBackendOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`} />
            <span className={`text-xs font-medium transition-colors duration-300 ${isBackendOnline ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-red-500 dark:text-red-400/80'}`}>
              {isBackendOnline ? 'System Online' : 'System Offline'}
            </span>
          </div>

          {/* AI Server Status */}
          <div className="flex items-center gap-2 bg-white/80 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-lg transition-all duration-300 hover:bg-white dark:hover:bg-black/60">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isAiOnline ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-neutral-400 dark:bg-neutral-600'}`} />
            <div className="flex flex-col">
              <span className={`text-xs font-medium transition-colors duration-300 ${isAiOnline ? 'text-indigo-600 dark:text-indigo-400/80' : 'text-neutral-500'}`}>
                {aiStatusDetail}
              </span>
              {isAiOnline && aiModelName && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 dark:text-neutral-500 font-mono truncate max-w-[120px] leading-tight">
                    {aiModelName}
                  </span>
                  {aiContextSize > 0 && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-mono leading-tight mt-0.5">
                      {aiContextSize} active ctx
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <header className="mb-12 text-center space-y-4 relative">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Vector Bookshelf
          </h1>
        </header>

        <main className="space-y-8">
          {showUtilities ? (
            <Utilities
              scanProps={{
                path,
                setPath,
                startScan,
                isScanning,
                stats
              }}
            />
          ) : (
            <>


              {/* Sticky Library Header with Filters */}
              <div className="sticky top-0 z-10 bg-background pb-4 shadow-xl shadow-black/5 dark:shadow-black/50 pt-2 transition-colors duration-300">
                <div className="flex flex-col gap-4 bg-surface/50 backdrop-blur-md p-4 rounded-xl border border-black/5 dark:border-white/5">

                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                      Library
                      <span className="text-sm font-normal text-gray-600 dark:text-secondary bg-black/5 dark:bg-black/30 px-3 py-0.5 rounded-full border border-black/5 dark:border-white/5">
                        {searchQuery ? `${books.length} results` : `${books.length} books`}
                      </span>
                    </h2>

                    <div className="flex gap-2">
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={startTagGeneration}
                          disabled={isProcessingMetadata || isProcessingContent || isSyncingTaxonomy || books.length === 0}
                          className={`px-6 py-2 rounded-lg font-medium border transition-all ${isProcessingContent ? 'bg-neutral-900 border-neutral-700 text-cyan-400' : 'border-cyan-500/20 bg-cyan-100 dark:bg-cyan-950/20 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-500/10'}`}
                        >
                          {isProcessingContent
                            ? (
                              <div className="flex flex-col text-[10px] leading-tight">
                                <div className="text-sm font-bold">
                                  AI Data Scan: {taggingStats.processed}/{taggingStats.total}
                                </div>
                                <div className="flex justify-between opacity-80">
                                  <span>{taggingStats.eta || 'Calculating...'}</span>
                                  {taggingStats.bpm > 0 && <span className="opacity-40">•</span>}
                                  {taggingStats.bpm > 0 && <span>{taggingStats.bpm} books/min</span>}
                                </div>
                              </div>
                            )
                            : (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || searchQuery || activeYearFilter
                              ? `Scan ${filteredBooks.length} Filtered`
                              : 'AI Data Scan (All)')}
                        </button>
                        {isProcessingContent && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/scan/stop', { method: 'POST' });
                                const data = await res.json();
                                console.log('Stop requested:', data);
                                if (data.success) {
                                  setIsProcessingContent(false);
                                } else {
                                  alert('Stop failed: ' + data.message);
                                }
                              } catch (e) {
                                console.error('Failed to stop scan:', e);
                                alert('Failed to connect to server to stop scan.');
                              }
                            }}
                            className="p-2 rounded-lg border border-red-500/20 bg-red-950/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                            title="Force Stop (Cancel Server Scan)"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setShowTaxonomyDoctor(true)}
                        className="p-2 rounded-lg border border-purple-500/20 bg-purple-100 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-500/10 transition-colors"
                        title="Taxonomy Doctor (Fix Tags)"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                      </button>

                      <button
                        onClick={handleSyncTaxonomy}
                        disabled={isSyncingTaxonomy || isScanning || isProcessingContent || books.length === 0}
                        className={`relative px-4 py-2 rounded-lg font-medium border transition-all ${isSyncingTaxonomy ? 'bg-neutral-900 border-neutral-700 text-amber-400' : 'border-amber-500/20 bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/10'} ${!isSyncingTaxonomy && books.some(b => b.tags && !b.master_tags) ? 'ring-1 ring-amber-500' : ''}`}
                        title="AI groups your tags into categories"
                      >
                        {isSyncingTaxonomy ? (taxonomyStats.message || 'Syncing...') : 'Rescan Categories'}
                      </button>

                      {newErrorBooks.length > 0 && (
                        <button
                          onClick={handleExportErrors}
                          className={`px-4 py-2 rounded-lg font-medium border transition-colors flex items-center gap-2 ${newErrorBooks.length > 0 ? 'border-red-500/50 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50' : 'border-red-500/10 bg-red-50 dark:bg-red-950/5 text-red-500/50'}`}
                          title={newErrorBooks.length > 0 ? "New errors found!" : "All errors dismissed"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Export Errors {newErrorBooks.length > 0 && `(${newErrorBooks.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SEARCH BAR */}
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search titles, authors, tags..."
                      className="w-full bg-slate-100 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg pl-10 pr-4 py-3 text-gray-900 dark:text-neutral-200 placeholder:text-gray-500 dark:placeholder:text-neutral-500 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                    />
                    <svg className="w-5 h-5 text-neutral-500 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-3.5 text-neutral-500 hover:text-white"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* TAXONOMY DOCTOR MODAL */}
              {showTaxonomyDoctor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                  <div className="bg-neutral-900 border border-purple-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl shadow-purple-900/20">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <span className="text-purple-400">🩺</span> Taxonomy Doctor
                        </h3>
                        <p className="text-sm text-neutral-400 mt-1">Retroactively fix tags using your Rules.</p>
                      </div>
                      <button onClick={() => setShowTaxonomyDoctor(false)} className="text-neutral-500 hover:text-white">✕</button>
                    </div>


                    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                      {/* Action 0: Rules Editor Link */}
                      <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-r-purple-500/30 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => setShowRulesEditor(true)}>
                        <div>
                          <h4 className="font-semibold text-white/90 group-hover:text-purple-300 transition-colors">Tagging Rules</h4>
                          <p className="text-xs text-neutral-400">View and edit your context rules in a large window.</p>
                        </div>
                        <button
                          className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-sm text-white transition-colors"
                        >
                          Open Editor ↗
                        </button>
                      </div>

                      {/* Action 1: Apply Implications */}
                      <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors">
                        <h4 className="font-semibold text-purple-200 mb-2">1. Apply Automatic Hierarchies (Instant)</h4>
                        <p className="text-xs text-neutral-400 mb-4">Good for strict parent/child rules (e.g. "ML ensures AI"). Does <strong>not</strong> re-read books. Safe and fast.</p>
                        <button
                          onClick={async () => {
                            setDoctorResult('Running logic updates...');
                            try {
                              const res = await fetch('/api/taxonomy/apply-implications', { method: 'POST' });
                              const data = await res.json();
                              setDoctorResult(`Applied ${data.changes} logic fixes.\nRules: ${data.applied.join(', ') || 'None triggered'}`);
                              fetchBooks(); // Refresh UI
                            } catch (e) {
                              setDoctorResult('Error: ' + e.message);
                            }
                          }}
                          className="w-full bg-purple-900/30 hover:bg-purple-800/50 text-purple-300 py-2 rounded-lg border border-purple-500/20 transition-all font-medium"
                        >
                          Apply Hierarchies
                        </button>
                      </div>

                      {/* Action 2: Re-Scan Tag */}
                      <div className="bg-black/40 p-4 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-colors">
                        <h4 className="font-semibold text-cyan-200 mb-2">2. Fix Ambiguous Tags (Deep AI Re-Scan)</h4>
                        <p className="text-xs text-neutral-400 mb-4">Use for context errors (e.g. "Python" Snake vs Code). <strong>Wipes metadata</strong> so the AI can re-read the book using your new Rules.</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. Python"
                            value={doctorTag}
                            onChange={(e) => setDoctorTag(e.target.value)}
                            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                          />
                          <button
                            onClick={async () => {
                              if (!doctorTag) return;
                              if (!confirm(`Are you sure you want to WIPEOUT metadata for all books tagged '${doctorTag}'? They will be re-scanned.`)) return;
                              setDoctorResult(`Resetting '${doctorTag}'...`);
                              try {
                                const res = await fetch('/api/taxonomy/re-eval', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tag: doctorTag })
                                });
                                const data = await res.json();
                                setDoctorResult(`Reset ${data.count} books. Please run 'AI Data Scan' to process them.`);
                                fetchBooks(); // Refresh UI
                              } catch (e) {
                                setDoctorResult('Error: ' + e.message);
                              }
                            }}
                            className="bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-300 px-4 py-2 rounded-lg border border-cyan-500/20 transition-all font-medium"
                          >
                            Reset Tag
                          </button>
                        </div>
                      </div>

                      {/* Output Log */}
                      {doctorResult && (
                        <div className="bg-black p-3 rounded-lg border border-white/10 font-mono text-xs text-green-400 whitespace-pre-wrap">
                          {doctorResult}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* LARGE RULES EDITOR MODAL */}
              {showRulesEditor && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                  <div className="bg-neutral-900 border border-purple-500/30 rounded-2xl w-[90vw] h-[85vh] shadow-2xl flex flex-col">
                    <div className="flex justify-between items-center p-6 border-b border-white/5">
                      <div>
                        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                          <span className="text-purple-400">📝</span> Tagging Rules Editor
                        </h3>
                        <p className="text-sm text-neutral-400 mt-1">Edit `tagging_rules.md`. These rules are injected into the AI context.</p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/taxonomy/rules', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ content: rulesContent })
                              })
                              const data = await res.json()
                              if (data.success) {
                                alert('Rules Saved!')
                                setShowRulesEditor(false)
                              } else {
                                alert('Error saving: ' + data.error)
                              }
                            } catch (e) { alert('Error: ' + e.message) }
                          }}
                          className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-purple-900/50"
                        >
                          Save Rules
                        </button>
                        <button onClick={() => setShowRulesEditor(false)} className="px-4 py-2 rounded-lg text-neutral-400 hover:bg-white/10 transition-colors">Cancel</button>
                      </div>
                    </div>

                    <div className="flex-1 p-6 bg-black/50">
                      <textarea
                        value={rulesContent}
                        onChange={(e) => setRulesContent(e.target.value)}
                        className="w-full h-full bg-transparent border-none outline-none font-mono text-sm text-neutral-200 resize-none leading-relaxed"
                        placeholder="# Write your tagging rules here..."
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
              )}


              {/* Active Filter Chips */}
              {
                (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || activeYearFilter) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-secondary">Filtered by:</span>

                    {/* Tag Filters */}
                    {activeTagFilters.map(tag => (
                      <button
                        key={`tag-${tag}`}
                        onClick={() => removeTagFilter(tag)}
                        className="px-3 py-1 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-indigo-500/30 transition-colors"
                      >
                        {tag}
                        <span className="text-indigo-600 dark:text-indigo-400">×</span>
                      </button>
                    ))}

                    {/* Author Filters */}
                    {activeAuthorFilters.map(author => (
                      <button
                        key={`author-${author}`}
                        onClick={() => removeAuthorFilter(author)}
                        className="px-3 py-1 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-emerald-500/30 transition-colors"
                      >
                        <span className="text-[10px] uppercase opacity-70">Author:</span> {author}
                        <span className="text-emerald-600 dark:text-emerald-400">×</span>
                      </button>
                    ))}

                    {/* Year Filter */}
                    {activeYearFilter && (
                      <button
                        onClick={() => setActiveYearFilter(null)}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 rounded-full text-sm flex items-center gap-2 hover:bg-cyan-500/30 transition-colors"
                      >
                        <span className="text-[10px] uppercase opacity-70">Year:</span> {activeYearFilter}
                        <span className="text-cyan-600 dark:text-cyan-400">×</span>
                      </button>
                    )}

                    <button
                      onClick={clearAllFilters}
                      className="text-sm text-secondary hover:text-white underline"
                    >
                      Clear all
                    </button>
                  </div>
                )
              }

              {/* Bulk Export Section */}
              {
                (activeTagFilters.length > 0 || activeAuthorFilters.length > 0 || activeYearFilter) && (
                  <div className="flex items-center gap-3 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="text-secondary text-sm font-medium whitespace-nowrap">
                      Export {filteredBooks.length} books to:
                    </div>
                    <input
                      type="text"
                      value={exportPath}
                      onChange={(e) => setExportPath(e.target.value)}
                      placeholder="C:\Folder\Path"
                      className="flex-1 bg-surface-light border border-white/10 rounded px-3 py-1 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <button
                      onClick={handleExport}
                      disabled={isExporting || !exportPath}
                      className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isExporting ? 'EXPORTING...' : 'CONFIRM EXPORT'}
                    </button>
                  </div>
                )
              }

              {isProcessingContent && <div className="text-xs font-mono text-cyan-500/70 max-w-md truncate">AI Data Scan: {taggingStats.current}</div>}
              {/* Book List */}
              <div className="bg-surface border border-black/5 dark:border-white/5 rounded-2xl overflow-visible shadow-sm">
                <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-black/5 dark:bg-white/5 text-secondary font-medium">
                    <tr>
                      <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors group" style={{ width: '30%' }} onClick={() => requestSort('title')}>
                        Title {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-white transition-colors group" style={{ width: '10%' }} onClick={() => requestSort('author')}>
                        Author {sortConfig.key === 'author' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3" style={{ width: '35%' }}>Tags</th>
                      <th className="px-4 py-3 whitespace-nowrap cursor-pointer hover:text-white transition-colors group" style={{ width: '5%' }} onClick={() => requestSort('publication_year')}>
                        Year {sortConfig.key === 'publication_year' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors group" style={{ width: '20%' }} onClick={() => requestSort('filepath')}>
                        File {sortConfig.key === 'filepath' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {paginatedBooks.map((book) => (
                      <tr
                        key={book.id}
                        className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                        onMouseEnter={() => setHoveredRow(book.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                          <div className="relative group inline-block flex items-center gap-2">
                            {editingCell?.id === book.id && editingCell?.field === 'title' ? (
                              <input
                                autoFocus
                                defaultValue={book.title}
                                className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-full min-w-[300px]"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleManualUpdate(book.id, 'title', e.target.value);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={(e) => handleManualUpdate(book.id, 'title', e.target.value)}
                              />
                            ) : (
                              <>
                                <span
                                  className={`cursor-help border-b border-white/10 group-hover:border-primary/50 transition-colors ${book.summary ? 'border-dotted' : ''}`}
                                >
                                  {book.title || <span className="text-neutral-500 italic">Unknown Title</span>}
                                </span>

                                {/* Edit Icon */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCell({ id: book.id, field: 'title' });
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-all px-1"
                                  title="Edit Title"
                                >
                                  ✎
                                </button>
                              </>
                            )}

                            {/* Continuous Rescan Button */}
                            {!editingCell && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleScan(book.id, book.filepath);
                                }}
                                disabled={scanningBookId !== null}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${scanningBookId === book.id
                                  ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/50 animate-pulse'
                                  : (book.tags || book.master_tags)
                                    ? 'opacity-0 group-hover:opacity-100 bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20 hover:bg-neutral-500/20'
                                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                  } disabled:opacity-50`}
                                title={(book.tags || book.master_tags) ? "Regenerate AI tags and summary" : "Analyze book with AI"}
                              >
                                {scanningBookId === book.id
                                  ? 'SCANNING...'
                                  : (book.tags || book.master_tags) ? 'RESCAN' : 'SCAN AI'}
                              </button>
                            )}

                            {/* Property Sync Button */}
                            {!editingCell && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMetadataSync(book.id, book.filepath);
                                }}
                                disabled={syncingMetadataId !== null}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer border ${syncingMetadataId === book.id
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 animate-pulse'
                                  : 'opacity-0 group-hover:opacity-100 bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-white/10 hover:bg-neutral-300 dark:hover:bg-white/10 hover:text-black dark:hover:text-white'
                                  } disabled:opacity-50`}
                                title="Reread properties (Title, Author, Year) from file"
                              >
                                {syncingMetadataId === book.id ? 'SYNCING...' : 'SYNC PROP'}
                              </button>
                            )}

                            {book.summary ? (
                              <div className="absolute z-50 hidden group-hover:block bg-surface/95 border border-neutral-200 dark:border-white/10 p-4 rounded-xl shadow-2xl w-80 bottom-full left-0 mb-1 pointer-events-none backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="text-[10px] text-primary uppercase tracking-[0.2em] mb-2 font-bold">AI Summary</div>
                                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 font-normal">{book.summary}</p>
                                <div className="absolute top-full left-4 border-8 border-transparent border-t-surface/95"></div>
                              </div>
                            ) : (
                              <div className="absolute z-50 hidden group-hover:block bg-surface/95 border border-amber-500/20 p-4 rounded-xl shadow-2xl w-80 bottom-full left-0 mb-1 pointer-events-none group-hover:pointer-events-auto backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div className="text-[10px] text-amber-500 uppercase tracking-[0.2em] mb-2 font-bold flex justify-between items-center">
                                  <span>No AI Insight</span>
                                  {scanningBookId === book.id && <span className="animate-pulse text-cyan-400">Scanning...</span>}
                                </div>
                                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 font-normal italic mb-3">
                                  No AI summary or tags generated yet.
                                </p>
                                <div className="absolute top-full left-4 border-8 border-transparent border-t-surface/95"></div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap overflow-hidden truncate" style={{ maxWidth: 0 }} title={book.author}>
                          <div className="relative group flex items-center gap-2">
                            {editingCell?.id === book.id && editingCell?.field === 'author' ? (
                              <input
                                autoFocus
                                defaultValue={book.author}
                                className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-full"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleManualUpdate(book.id, 'author', e.target.value);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={(e) => handleManualUpdate(book.id, 'author', e.target.value)}
                              />
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-1 items-center">
                                  {book.author ? parseAuthors(book.author).map((author, i) => {
                                    const isActive = activeAuthorFilters.includes(author);
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => handleAuthorClick(author)}
                                        className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${isActive
                                          ? 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-200 border-emerald-500/50'
                                          : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-neutral-300 border-black/5 dark:border-white/10 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300 hover:border-emerald-500/30'
                                          }`}
                                      >
                                        {author}
                                      </button>
                                    );
                                  }) : <span className="text-neutral-600">-</span>}

                                  <button
                                    onClick={() => setEditingCell({ id: book.id, field: 'author' })}
                                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-all px-1"
                                    title="Edit Author"
                                  >
                                    ✎
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {/* Categories Rendering */}
                            {book.master_tags && book.master_tags.split(',').map((tag, i) => {
                              const trimmedTag = tag.trim();
                              const isActive = activeTagFilters.includes(trimmedTag);
                              return (
                                <button
                                  key={`master-${i}`}
                                  onClick={() => handleTagClick(trimmedTag)}
                                  className={`px-2 py-0.5 border rounded-full text-[10px] tracking-wider transition-all cursor-pointer ${isActive
                                    ? 'bg-orange-500 text-white border-orange-600 font-bold'
                                    : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
                                    }`}
                                >
                                  {trimmedTag}
                                </button>
                              );
                            })}

                            {/* Normal Tags Rendering */}
                            {book.tags ? book.tags.split(',').map((tag, i) => {
                              const trimmedTag = tag.trim();
                              const isActive = activeTagFilters.includes(trimmedTag);
                              return (
                                <button
                                  key={i}
                                  onClick={() => handleTagClick(trimmedTag)}
                                  className={`px-2 py-0.5 border rounded-full text-[10px] tracking-wider transition-all cursor-pointer ${isActive
                                    ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
                                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                                    }`}
                                >
                                  {trimmedTag}
                                </button>
                              );
                            }) : !book.master_tags && <span className="text-neutral-700 italic text-xs">No tags</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-neutral-400 whitespace-nowrap">
                          <div className="relative group flex items-center gap-2">
                            {editingCell?.id === book.id && editingCell?.field === 'publication_year' ? (
                              <input
                                autoFocus
                                defaultValue={book.publication_year}
                                type="text"
                                pattern="\d*"
                                className="bg-neutral-800 border border-indigo-500 rounded px-2 py-1 text-white text-sm w-20 text-center"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleManualUpdate(book.id, 'publication_year', parseInt(e.target.value) || null);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={(e) => handleManualUpdate(book.id, 'publication_year', parseInt(e.target.value) || null)}
                              />
                            ) : (
                              <>
                                {book.publication_year ? (
                                  <button
                                    onClick={() => setActiveYearFilter(book.publication_year)}
                                    className={`hover:text-cyan-300 hover:underline transition-colors ${activeYearFilter === book.publication_year ? 'text-cyan-400 font-bold underline' : ''}`}
                                    title="Filter by this Year"
                                  >
                                    {book.publication_year}
                                  </button>
                                ) : '-'}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCell({ id: book.id, field: 'publication_year' });
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-all px-1"
                                  title="Edit Year"
                                >
                                  ✎
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-mono text-[11px] break-words relative group">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/open-folder', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filepath: book.filepath })
                                  });
                                  const data = await response.json();
                                  if (!response.ok) {
                                    alert(`Failed to open folder: ${data.error || 'Unknown error'}`);
                                  }
                                } catch (error) {
                                  alert(`Error: ${error.message}`);
                                }
                              }}
                              className="hover:text-indigo-400 underline cursor-pointer text-left"
                              title={book.filepath}
                            >
                              {book.filepath.split(/[\\/]/).pop()}
                            </button>
                            <button
                              onClick={() => copyToClipboard(book.filepath)}
                              className="ml-auto flex-shrink-0 px-2 py-1 bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:hover:bg-white/10 rounded text-[10px] text-gray-600 dark:text-secondary hover:text-black dark:hover:text-white transition-all opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                              title="Copy full path"
                            >
                              📋
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredBooks.length === 0 && books.length > 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                          No books match the selected filters.
                          <button onClick={clearAllFilters} className="ml-2 text-indigo-400 hover:text-indigo-300 underline">
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    )}
                    {books.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                          No books found. Scan a directory to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {
                  totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-secondary">
                          Showing {startIndex + 1}-{Math.min(endIndex, filteredBooks.length)} of {filteredBooks.length} books
                        </span>
                        <select
                          value={itemsPerPage}
                          onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                          className="px-3 py-1 bg-white/10 border border-white/20 rounded text-sm text-white"
                        >
                          <option value={100}>100 per page</option>
                          <option value={500}>500 per page</option>
                          <option value={1000}>1000 per page</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-secondary">
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )
                }
              </div >
            </>
          )}
        </main>
      </div >

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-900/50 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
          title="Back to Top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
      )}
    </div >
  )
}

export default App
