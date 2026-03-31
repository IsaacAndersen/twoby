import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from '@/components/HomePage'
import CreateChart from '@/components/CreateChart'
import VoteChart from '@/components/VoteChart'
import ViewChart from '@/components/ViewChart'
import AdminPage from '@/components/AdminPage'
import AppShell from '@/components/layout/AppShell'
import AboutPage from '@/components/pages/AboutPage'
import NotFoundPage from '@/components/pages/NotFoundPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateChart />} />
          <Route path="/v/:id" element={<VoteChart />} />
          <Route path="/c/:id" element={<ViewChart />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
