import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Plus, Trophy, BarChart3, Info } from 'lucide-react'
import SubmitForm from './components/SubmitForm'
import Leaderboard from './components/Leaderboard'
import ResultsDashboard from './components/ResultsDashboard'
import InfoPage from './components/InfoPage'
import AuthGate from './components/AuthGate'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'

function BottomNav() {
  const location = useLocation()
  
  const navItems = [
    { path: '/submit', icon: Plus, label: 'Submit', primary: true },
    { path: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { path: '/results', icon: BarChart3, label: 'Results' },
    { path: '/info', icon: Info, label: 'Info' },
  ]

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ path, icon: Icon, label, primary }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs transition-colors",
                  isActive
                    ? primary 
                      ? "bg-blue-500 text-white" 
                      : "bg-blue-50 text-blue-600"
                    : "text-muted-foreground hover:text-foreground",
                  primary && !isActive && "text-blue-500"
                )}
              >
                <Icon className={cn("h-5 w-5", primary && !isActive && "text-blue-500")} />
                <span className={cn(
                  "text-xs font-medium",
                  primary && isActive && "text-white",
                  primary && !isActive && "text-blue-500"
                )}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex border-b bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 w-full">
          <div className="flex justify-between items-center h-16">
            <Link to="/submit" className="flex items-center gap-2 font-bold text-xl">
              <span className="text-2xl">🩺</span>
              <span>Resident AI Survey</span>
            </Link>
            
            <div className="flex items-center gap-2">
              {navItems.map(({ path, icon: Icon, label }) => (
                <Button key={path} variant="ghost" size="sm" asChild>
                  <Link to={path} className="flex items-center gap-1">
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <BottomNav />

        {/* Main Content */}
        <AuthGate>
          <main className="py-4 md:py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/submit" replace />} />
              <Route path="/submit" element={<SubmitForm />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/results" element={<ResultsDashboard />} />
              <Route path="/info" element={<InfoPage />} />
            </Routes>
          </main>
        </AuthGate>

        
      </div>
    </Router>
  )
}

export default App