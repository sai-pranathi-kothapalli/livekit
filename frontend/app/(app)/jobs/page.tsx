'use client';

import { useRouter } from 'next/navigation';

export default function JobPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-8 bg-background px-4 py-12 text-foreground">
      <section className="w-full max-w-3xl space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Regional Rural Bank Probationary Officer (PO)
        </h1>
        <p className="text-sm text-muted-foreground">Sreedhar's CCE - RESULTS SUPER STAR</p>
        <p>
          We are conducting interviews for the Regional Rural Bank Probationary Officer (PO) position. 
          This is an excellent opportunity to build a career in the banking sector and serve rural communities 
          through financial inclusion and banking services.
        </p>
      </section>

      <section className="w-full max-w-3xl space-y-3">
        <h2 className="text-xl font-semibold">Interview Preparation Areas</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li><strong>Candidate Personal Introduction:</strong> Your background, education, and motivation</li>
          <li><strong>Background/History of Regional Rural Bank:</strong> Understanding of RRBs, their structure and role</li>
          <li><strong>Current Affairs for Banking:</strong> Recent developments in banking sector, RBI policies, government schemes</li>
          <li><strong>Domain Knowledge:</strong> Banking fundamentals, operations, and financial awareness</li>
        </ul>
      </section>

      <button
        type="button"
        onClick={() => router.push('/apply')}
        className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
      >
        Apply for this position
      </button>
    </main>
  );
}


