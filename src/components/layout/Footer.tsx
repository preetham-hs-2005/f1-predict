import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

export function Footer() {
  return <footer className="relative z-10 mt-auto bg-black px-5 pb-8 pt-6 text-[#929292] sm:px-8" aria-label="Site footer">
    <div className="mx-auto max-w-[1400px] border-t border-white/25 pt-9">
      <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="mb-4 h-1 w-16 -skew-x-12 bg-[linear-gradient(90deg,#f97316_0_33%,#f8fafc_33%_66%,#22c55e_66%)]" aria-hidden="true" />
          <BrandMark compact />
          <p className="mt-3 text-xs">For the fans. By the fans.</p>
          <p className="mt-4 text-sm font-semibold">Made with love in India</p>
        </div>
        <nav className="flex flex-wrap content-start gap-x-6 gap-y-3 text-sm" aria-label="Footer navigation">
          <Link to="/" className="hover:text-white">Home</Link>
          <Link to="/how-it-works" className="hover:text-white">How it works</Link>
          <Link to="/standings" className="hover:text-white">Standings</Link>
          <Link to="/results" className="hover:text-white">Race analysis</Link>
          <Link to="/leaderboard" className="hover:text-white">Leaderboard</Link>
        </nav>
        <div className="text-xs leading-6 lg:text-right">F1 Predictor Pro is an independent fan project and is not affiliated with Formula 1 or its companies.</div>
      </div>
      <p className="mt-14 text-center text-xs text-[#777]">© {new Date().getFullYear()} F1 Predictor Pro</p>
    </div>
  </footer>;
}
