import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RetirementPlanner from './retirement-planner.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RetirementPlanner />
  </StrictMode>,
)