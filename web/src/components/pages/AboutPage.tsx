import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">About twoby</h1>
        <p className="mt-2 text-slate-600">
          twoby lets you make 2x2 charts, collect votes, and share the results.
        </p>
        <div className="mt-4">
          <Link to="/create"><Button>Make a chart</Button></Link>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Guidelines</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>Use clear titles and recognizable item names.</p>
          <p>No harassment, hate speech, spam, doxxing, or deceptive content.</p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Safety</h2>
        <p className="mt-2 text-sm text-slate-600">
          Text is filtered for banned language, URLs are blocked in user content,
          and admins can hide charts or pause voting.
        </p>
      </section>

      <div className="border-t border-slate-200 pt-6 text-sm text-slate-500">
        twoby by Twoby Labs, Inc.
      </div>
    </div>
  )
}
