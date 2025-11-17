import React from 'react'
export default function MatchList({ matches, onClick }){
  if (!matches || matches.length === 0) return <div>No matches</div>
  return (
    <div>
      {matches.map((m, idx)=>(
        <div key={idx} className="match-item" onClick={()=>onClick(m)}>
          <div style={{fontSize:12,color:'#666'}}>Page {m.page} — score {typeof m.score === 'number' ? m.score.toFixed(3) : 'n/a'}</div>
          <div style={{marginTop:6}}>{m.text.slice(0,200)}</div>
        </div>
      ))}
    </div>
  )
}
