import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Flag,
  Lock,
  Trophy,
  ChevronRight,
  Zap,
  BarChart3,
  Users2,
  Timer,
  Menu,
  Radio,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/layout/BrandMark";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import RaceCard from "@/components/dashboard/RaceCard";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getUpcomingRacesFromServer, type ServerRace } from "@/lib/api/races";
import type { RaceWeekend } from "@/lib/data/raceCalendar";

const STEPS = [
  { num: "01", label: "Pick podium, pole, constructor" },
  { num: "02", label: "Entries lock before session time" },
  { num: "03", label: "Admin posts race result" },
  { num: "04", label: "Leaderboard updates instantly" },
];

const FEATURES = [
  {
    icon: Lock,
    title: "Prediction Lock",
    desc: "No edits once the session window closes.",
    accent: "from-signal/20 to-transparent",
    border: "group-hover:border-signal/50",
  },
  {
    icon: Trophy,
    title: "Official Standings",
    desc: "Formula 1 championship tables in-app.",
    accent: "from-yellow-500/20 to-transparent",
    border: "group-hover:border-yellow-500/50",
  },
  {
    icon: Flag,
    title: "Race Analysis",
    desc: "Results, fastest laps, pit stops, and notes.",
    accent: "from-red-500/20 to-transparent",
    border: "group-hover:border-red-500/50",
  },
];

const STATS = [
  { value: "22", label: "Race Rounds", icon: Flag },
  { value: "20", label: "Drivers", icon: Users2 },
  { value: "∞", label: "Predictions", icon: Zap },
  { value: "Live", label: "Standings", icon: BarChart3 },
];

const toRaceWeekend = (race: ServerRace): RaceWeekend => ({
  id: race.raceId,
  raceName: race.raceName,
  circuitName: race.circuitName,
  country: race.country,
  countryFlag: race.countryFlag,
  round: race.round,
  qualifyingStartTime: race.qualifyingStartTime,
  raceStartTime: race.raceStartTime,
  sprintWeekend: race.sprintWeekend,
  sprintQualifyingStartTime: race.sprintQualifyingStartTime,
  sprintStartTime: race.sprintStartTime,
  timeZone: race.timeZone,
  cancelled: race.cancelled,
  isLocked: race.isLocked,
  isComplete: race.isComplete,
});

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [nextRace, setNextRace] = useState<RaceWeekend | null>(null);
  const [isRaceLoading, setIsRaceLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/dashboard");
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    let active = true;

    getUpcomingRacesFromServer()
      .then((races) => {
        if (active && races[0]) setNextRace(toRaceWeekend(races[0]));
      })
      .finally(() => {
        if (active) setIsRaceLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /* Parallax tilt on hero text, unless the user requests less motion. */
  useEffect(() => {
    const el = heroRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduceMotion) return;
    const handle = (e: MouseEvent) => {
      const { clientX, clientY, currentTarget } = e;
      const { width, height, left, top } = (
        currentTarget as HTMLElement
      ).getBoundingClientRect();
      const x = ((clientX - left) / width - 0.5) * 12;
      const y = ((clientY - top) / height - 0.5) * -8;
      el.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${y}deg)`;
    };
    const reset = () => (el.style.transform = "");
    document.addEventListener("mousemove", handle);
    document.addEventListener("mouseleave", reset);
    return () => {
      document.removeEventListener("mousemove", handle);
      document.removeEventListener("mouseleave", reset);
    };
  }, []);

  return (
    <PageShell>
      {/* ── NAV ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
          <BrandMark />
          <nav className="hidden items-center gap-2 sm:flex" aria-label="Primary navigation">
            <Link to="/standings">
              <Button variant="ghost" size="sm" className="data-mono hidden text-xs uppercase tracking-widest text-muted-foreground hover:text-white sm:flex">
                Standings
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm" className="data-mono text-xs uppercase tracking-widest">
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button
                variant="signal"
                size="sm"
                className="data-mono gap-1 text-xs uppercase tracking-widest"
              >
                Join <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </nav>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,360px)] border-l-border bg-surface-1 p-6">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="mt-10 flex flex-col gap-2">
                <SheetClose asChild>
                  <Link to="/standings">
                    <Button variant="cockpit" className="data-mono w-full justify-start text-xs uppercase tracking-widest">Standings</Button>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/login">
                    <Button variant="ghost" className="data-mono w-full justify-start text-xs uppercase tracking-widest">Sign In</Button>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/register">
                    <Button variant="signal" className="data-mono w-full justify-start text-xs uppercase tracking-widest">Join now <ChevronRight className="ml-auto h-4 w-4" /></Button>
                  </Link>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="relative min-h-screen overflow-x-hidden">
        {/* ── AMBIENT GLOWS ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(95 92% 58% / 0.45) 0%, transparent 65%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-64 top-1/3 h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(220 80% 60% / 0.12) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-1/2 h-[350px] w-[350px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(8 86% 58% / 0.1) 0%, transparent 70%)",
          }}
        />

        {/* ── HERO ── */}
        <section className="relative mx-auto flex min-h-screen max-w-[1400px] flex-col items-start justify-center px-5 pb-16 pt-28 sm:px-8 lg:px-10">
          {/* Eyebrow */}
          <div className="flex items-center gap-3">
            <span className="inline-flex h-px w-10 bg-signal" />
            <span className="page-eyebrow tracking-[0.25em]">F1 Predictor Pro</span>
          </div>

          {/* Big headline with 3-D tilt */}
          <div
            ref={heroRef}
            className="hero-tilt"
          >
            <h1 className="display mt-6 max-w-5xl text-[clamp(2.8rem,9vw,7.5rem)] font-black leading-[0.88] tracking-tight text-white">
              Predict.
              <br />
              <span
                className="relative inline-block"
                style={{
                  WebkitTextStroke: "2px hsl(95 92% 58%)",
                  color: "transparent",
                }}
              >
                Compete.
              </span>
              <br />
              Dominate.
            </h1>
          </div>

          <p className="mt-8 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            A focused prediction app for friends, leagues, and F1 weekends.
            Make your picks, respect the lock window, and let the table settle
            after the chequered flag.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/register">
              <Button
                variant="signal"
                size="lg"
                className="data-mono gap-2 text-sm uppercase tracking-widest"
              >
                Start Predicting
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                variant="cockpit"
                size="lg"
                className="data-mono text-sm uppercase tracking-widest"
              >
                Sign In
              </Button>
            </Link>
          </div>

          {/* Stat row */}
          <div className="mt-16 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 bg-surface-1 px-6 py-4 text-center transition-colors hover:bg-surface-2"
              >
                <Icon className="mb-1 h-4 w-4 text-signal" />
                <span className="display text-2xl font-black text-white">{value}</span>
                <span className="data-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── NEXT RACE ── */}
        <section className="relative border-y border-border bg-surface-1/50">
          <div className="mx-auto grid max-w-[1400px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)] lg:items-center lg:px-10">
            <div>
              <div className="flex items-center gap-3">
                <Radio className="h-4 w-4 text-signal" />
                <span className="page-eyebrow tracking-[0.25em]">Live race desk</span>
              </div>
              <h2 className="display mt-5 max-w-md text-3xl font-black leading-tight text-white sm:text-4xl">Know exactly when your next pick locks.</h2>
              <p className="mt-4 max-w-lg leading-7 text-muted-foreground">Your next race weekend, session countdown, and prediction window are all in one place. Join now so you are ready before qualifying begins.</p>
              <Link to="/register" className="mt-7 inline-block">
                <Button variant="signal" className="data-mono gap-2 text-xs uppercase tracking-widest">Create your account <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>
            {isRaceLoading ? (
              <div className="panel panel-corners min-h-[350px] animate-pulse bg-surface-2/50" aria-label="Loading next race" />
            ) : nextRace ? (
              <RaceCard race={nextRace} featured />
            ) : (
              <div className="panel panel-corners flex min-h-[350px] flex-col items-center justify-center p-8 text-center">
                <Flag className="h-8 w-8 text-signal" />
                <h3 className="display mt-4 text-xl font-bold text-white">Calendar updating</h3>
                <p className="data-mono mt-2 max-w-sm text-xs uppercase leading-6 text-muted-foreground">The next race weekend will appear here as soon as it is available.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── LEAGUE FORMAT STEPS ── */}
        <section className="relative border-y border-border bg-surface-1/50">
          <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 lg:px-10">
            <div className="mb-10 flex items-center gap-4">
              <span className="label-eyebrow tracking-[0.25em]">League format</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ num, label }) => (
                <li
                  key={num}
                  className="group relative flex flex-col gap-3 border border-border bg-surface-1 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-signal/40 hover:shadow-[0_0_30px_-8px_hsl(95_92%_58%/0.25)]"
                >
                  <span
                    className="data-mono text-5xl font-black"
                    style={{
                      WebkitTextStroke: "1.5px hsl(95 92% 58% / 0.8)",
                      color: "transparent",
                    }}
                  >
                    {num}
                  </span>
                  <span className="data-mono text-xs uppercase leading-6 tracking-wider text-muted-foreground group-hover:text-white/80">
                    {label}
                  </span>
                  {/* bottom accent line */}
                  <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-signal transition-all duration-300 group-hover:w-full" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── FEATURE CARDS ── */}
        <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mb-10 flex items-center gap-4">
            <span className="label-eyebrow tracking-[0.25em]">What's inside</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc, accent, border }) => (
              <div
                key={title}
                className={`group relative overflow-hidden border border-border bg-surface-1 p-6 transition-all duration-300 hover:-translate-y-1 ${border}`}
              >
                {/* gradient blob */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center border border-border bg-surface-2 transition-colors group-hover:border-signal/40">
                    <Icon className="h-5 w-5 text-signal" />
                  </div>
                  <h3 className="display text-lg font-semibold text-white">{title}</h3>
                  <p className="data-mono mt-2 text-[11px] uppercase leading-5 text-muted-foreground">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA BANNER ── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-10">
            <div className="panel panel-corners relative overflow-hidden p-8 sm:p-12">
              {/* racing-stripe top */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-signal" />
              {/* glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, hsl(95 92% 58% / 0.12) 0%, transparent 60%)",
                }}
              />
              <div className="relative flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <Timer className="h-5 w-5 text-signal" />
                    <span className="label-eyebrow tracking-widest">Ready for the next round?</span>
                  </div>
                  <h2 className="display text-3xl font-black text-white sm:text-4xl">
                    Make your picks
                    <br />
                    <span className="text-signal">before the flag drops.</span>
                  </h2>
                  <p className="data-mono mt-3 text-xs uppercase tracking-wider text-muted-foreground">
                    Create an account or sign in to continue.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:items-end">
                  <Link to="/register">
                    <Button
                      variant="signal"
                      size="lg"
                      className="data-mono w-full gap-2 text-sm uppercase tracking-widest sm:w-auto"
                    >
                      Start Now
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="data-mono w-full text-xs uppercase tracking-widest text-muted-foreground sm:w-auto"
                    >
                      Already have an account? Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-8">
            <BrandMark compact />
            <p className="data-mono text-[10px] uppercase text-muted-foreground">
              © 2026 F1 Predictor Pro
            </p>
          </div>
        </footer>
      </main>
    </PageShell>
  );
};

export default Index;
