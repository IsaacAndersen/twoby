import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from '@/components/HomePage'
import CreateChart from '@/components/CreateChart'
import VoteChart from '@/components/VoteChart'
import ViewChart from '@/components/ViewChart'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateChart />} />
          <Route path="/v/:id" element={<VoteChart />} />
          <Route path="/c/:id" element={<ViewChart />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App