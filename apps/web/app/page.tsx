import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="max-w-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-8">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-zinc-100 mb-4">
          SaaS Idea Engine
        </h1>
        <p className="text-lg text-zinc-400 mb-12 max-w-lg mx-auto">
          Discover untapped SaaS opportunities and get deep AI-powered analysis
          to validate your next business idea.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/finder"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Discover Opportunities
          </Link>

          <Link
            href="/analyzer/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-zinc-800 text-zinc-100 font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Analyze an Idea
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Finder</h3>
            <p className="text-sm text-zinc-500">
              Automated scraping of forums, reviews, and communities to find pain points.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="w-10 h-10 rounded-lg bg-green-600/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Analyzer</h3>
            <p className="text-sm text-zinc-500">
              18-section deep dive powered by AI with market data and scoring.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="w-10 h-10 rounded-lg bg-purple-600/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Scoring</h3>
            <p className="text-sm text-zinc-500">
              Multi-criteria scoring to rank and prioritize the best opportunities.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
