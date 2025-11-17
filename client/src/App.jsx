import React from 'react'
import { Outlet, Link } from 'react-router-dom'

export default function App(){
  return (
    <div>
      <header style={{padding:12, background:'#0b74de', color:'white'}}>
        <Link to="/" style={{color:'white', textDecoration:'none', fontWeight:700}}>Fuzzy PDF</Link>
      </header>
      <main style={{padding:20}}>
        <Outlet />
      </main>
    </div>
  )
}
