import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">404</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-3 text-slate-600">The page you requested does not exist or has moved.</p>
      <div className="mt-6 flex gap-2">
        <Link to="/"><Button>Go home</Button></Link>
        <Link to="/create"><Button variant="outline">Create chart</Button></Link>
      </div>
    </div>
  )
}
