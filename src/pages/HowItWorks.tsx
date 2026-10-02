import { Link } from "react-router-dom";
import { BrandMark } from "@/components/layout/BrandMark";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import pages from "../../seo/pages.json";

const questions = pages.find((page) => page.path === "/how-it-works")?.questions || [];

export default function HowItWorks() {
  return <PageShell>
    <header className="border-b border-border bg-background/90 px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4">
        <BrandMark compact />
        <nav className="flex items-center gap-4 text-sm" aria-label="Primary navigation">
          <Link to="/standings" className="hidden text-muted-foreground hover:text-white sm:inline">Standings</Link>
          <Link to="/results" className="hidden text-muted-foreground hover:text-white sm:inline">Race analysis</Link>
          <Link to="/register" className="text-signal hover:underline">Join now</Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[1100px] px-5 py-16 sm:px-8 sm:py-24">
      <p className="label-eyebrow text-signal">For the fans. By the fans.</p>
      <h1 className="display mt-5 max-w-3xl text-4xl font-black text-white sm:text-6xl">How F1 Predictor Pro works</h1>
      <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">Make Formula 1 race weekend predictions before the session begins, then track how your picks compare after results are posted.</p>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {questions.map(({ question, answer }) => <section key={question} className="border border-border bg-surface-1 p-6">
          <h2 className="display text-xl font-bold text-white">{question}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{answer}</p>
        </section>)}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link to="/register"><Button variant="signal">Create an account</Button></Link>
        <Link to="/standings"><Button variant="cockpit">View standings</Button></Link>
        <Link to="/results"><Button variant="cockpit">Explore race analysis</Button></Link>
      </div>
    </main>
  </PageShell>;
}
