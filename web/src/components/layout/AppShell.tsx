import { Link, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="text-xl font-black tracking-[-0.04em]">twoby</Link>
          <Link to="/create">
            <Button size="sm">Create</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-56px)] max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
