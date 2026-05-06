import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import KanbanBoard from './component/KanbanBoard'
import DataDashboard from './component/DataDasboard'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    {/* <KanbanBoard/> */}
    <DataDashboard/>
    </>
  )
}

export default App
