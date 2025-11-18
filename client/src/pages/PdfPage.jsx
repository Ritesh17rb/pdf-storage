import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Fuse from 'fuse.js'
import PdfViewer from '../components/PdfViewer'
import MatchList from '../components/MatchList'

export default function PdfPage(){
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [matches, setMatches] = useState([])
  const [threshold, setThreshold] = useState(0.3) // fuzziness slider value
  const viewerRef = useRef()
  const [pdfUrl, setPdfUrl] = useState(null)

  const API = import.meta.env.VITE_API_URL;

  useEffect(()=>{
    async function loadMeta(){
      const res = await fetch(`${API}/pdf-url/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setPdfUrl(data.url)
    }
    loadMeta()
  },[id])

  async function runSearch(q){
    if (!q) { 
      setMatches([]); 
      setSearchParams({}); 
      return 
    }

    setQuery(q)
    setSearchParams({ q })

    // Prefer client-side search using corpus with segments/coords
    const corpus = viewerRef.current?.getCorpus?.() ? viewerRef.current.getCorpus() : []
    if (corpus.length > 0) {
      const fuse = new Fuse(corpus, {
        keys: ['text'],
        includeMatches: true,
        includeScore: true,
        threshold,                 // dynamic fuzziness
        distance: 1000,            // allow far-apart matches within a line
        minMatchCharLength: Math.min(3, q.length),
        ignoreLocation: true,
        findAllMatches: true,
        ignoreFieldNorm: true,
      })

      let fuseRes = fuse.search(q)

      // Fallback substring search if Fuse yields nothing
      if (!fuseRes || fuseRes.length === 0) {
        const ql = q.toLowerCase()
        fuseRes = corpus
          .filter(item => (item.text || '').toLowerCase().includes(ql))
          .map(item => ({ item, score: 1, matches: [{ indices: [[item.text.toLowerCase().indexOf(ql), item.text.toLowerCase().indexOf(ql) + q.length - 1]] }] }))
      }

      const mapped = fuseRes
        .map(r => {
          const item = r.item
          const ranges = r.matches?.[0]?.indices || []
          const itemText = item.text || ''
          let snippet = q
          let start, end
          let phrase = q
          if (ranges.length) {
            ;[start, end] = ranges[0]
            phrase = itemText.slice(start, end + 1)
            const pad = 60
            const s = Math.max(0, start - pad)
            const e = Math.min(itemText.length - 1, end + pad)
            snippet = itemText.substring(s, e + 1).replace(/\s+/g, ' ').trim()
          } else {
            const idx = itemText.toLowerCase().indexOf(q.toLowerCase())
            if (idx !== -1) {
              start = idx
              end = idx + q.length - 1
              phrase = itemText.slice(start, end + 1)
              const pad = 60
              const s = Math.max(0, idx - pad)
              const e = Math.min(itemText.length - 1, idx + q.length + pad)
              snippet = itemText.substring(s, e + 1).replace(/\s+/g, ' ').trim()
            }
          }
          return {
            page: item.pageNum,        // text-layer fallback
            pageNum: item.pageNum,     // overlay target
            lineId: item.id,           // segment line id
            start,
            end,
            phrase,                    // exact phrase for DOMRange highlight
            text: snippet,
            needle: q,
            score: r.score
          }
        })
        .sort((a,b)=> (a.score ?? 1) - (b.score ?? 1))
        .slice(0, 10)

      setMatches(mapped)
      setTimeout(()=>{ if (mapped[0]) viewerRef.current?.highlight(mapped[0]) }, 300)
      return
    }

    // Fallback: use server-side search if corpus not yet extracted
    try {
      const res = await fetch(`${API}/search/${id}?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      const results = (json.results || [])
        .map(r => ({ ...r, pageNum: r.page, phrase: r.text }))
        .sort((a,b)=> (a.score ?? 1) - (b.score ?? 1))
        .slice(0, 10)
      setMatches(results)
      setTimeout(()=>{ if (results[0]) viewerRef.current?.highlight(results[0]) }, 300)
    } catch (e) {
      console.error('Search error', e)
      setMatches([])
    }
  }

  // Re-run search when threshold changes (if there is a query)
  useEffect(()=>{ 
    if (query) runSearch(query)
  }, [threshold])

  useEffect(()=>{ 
    if (query) runSearch(query) 
  }, []) // run on load if q present

  return (
    <div style={{display:'flex', gap:12}}>
      <div style={{flex:1}}>
        <div style={{marginBottom:8}} className="searchbar">
          <input 
            value={query} 
            onChange={e=>setQuery(e.target.value)} 
            placeholder="Fuzzy search..." 
          />
          <button onClick={()=>runSearch(query)}>Search</button>
          <button onClick={()=>{ setQuery(''); setMatches([]); setSearchParams({}); }}>Clear</button>
          <div style={{display:'flex', alignItems:'center', gap:8, marginLeft:12}}>
            <label>Fuzziness:</label>
            <input 
              type="range" min="0" max="0.6" step="0.05"
              value={threshold}
              onChange={e=>setThreshold(parseFloat(e.target.value))}
              title="Fuse.js threshold"
            />
            <span style={{fontSize:12, color:'#666'}}>{threshold.toFixed(2)}</span>
          </div>
        </div>

        <div className="viewer">
          {pdfUrl 
            ? <PdfViewer ref={viewerRef} pdfUrl={pdfUrl} /> 
            : <div>Loading PDF...</div>}
        </div>
      </div>

      <div className="matches">
        <h3>Matches</h3>
        <MatchList 
          matches={matches} 
          onClick={(m)=>viewerRef.current?.highlight(m)} 
        />
      </div>
    </div>
  )
}