import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App'
import DCWorkflow from './pages/DCWorkflow'
import Dashboard from './pages/Dashboard'
import Filters from './pages/Filters'
import DCDetail from './pages/DCDetail'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dc" element={<DCWorkflow />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/filters" element={<Filters />} />
        <Route path="/dashboard/dc/:id" element={<DCDetail />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
