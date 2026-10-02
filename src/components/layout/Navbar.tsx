import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarClock,
  FlagTriangleRight,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  Shield,
  Trophy,
  UserCircle,
  UsersRound,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { BrandMark } from "@/components/layout/BrandMark";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { cn } from "@/lib/utils";
import { getUpcomingRacesFromServer, type ServerRace } from "@/lib/api/races";
import { getPredictionLockTime, type RaceWeekend } from "@/lib/data/raceCalendar";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, code: "DSH" },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy, code: "LDR" },
  { to: "/standings", label: "F1 Standings", icon: UsersRound, code: "STD" },
  { to: "/results", label: "Race Analysis", icon: FlagTriangleRight, code: "ANL" },
  { to: "/predictions", label: "History", icon: History, code: "HST" },
];

const adminNavItem = { to: "/admin", label: "Admin", icon: Shield, code: "ADM" };

function StatusBar() {
  const items = [
    "RACE CONTROL: ONLINE",
    "PREDICTION FEED: SYNCED",
    "LOCK WINDOWS: ACTIVE",
    "RACE ANALYSIS: READY",
    "F1 GRID: 22 DRIVERS",
  ];
  const stream = [...items, ...items];

  return (
    <div className="fixed left-0 right-0 top-0 z-40 border-b border-border bg-surface-1 lg:left-[240px]">
      <div className="flex overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 bg-signal px-3 py-1.5 text-signal-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-foreground animate-pulse-signal" />
          <span className="data-mono text-[11px] font-bold">LIVE</span>
        </div>
        <div className="flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-flex animate-ticker py-1.5 data-mono text-[11px] text-muted-foreground">
            {stream.map((item, index) => (
              <span key={`${item}-${index}`} className="border-r border-border px-6">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RaceCountdownBar() {
  const [nextRace, setNextRace] = useState<ServerRace | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    let active = true;
    const fetchNext = async () => {
      try {
        const upcoming = await getUpcomingRacesFromServer();
        if (upcoming && upcoming.length > 0 && active) {
          setNextRace(upcoming[0]);
        }
      } catch (err) {
        console.error("Failed to load countdown race:", err);
      }
    };
    fetchNext();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!nextRace) return;

    const raceObj: RaceWeekend = {
      id: nextRace.raceId,
      raceName: nextRace.raceName,
      circuitName: nextRace.circuitName,
      countryFlag: nextRace.countryFlag,
      round: nextRace.round,
      qualifyingStartTime: nextRace.qualifyingStartTime,
      raceStartTime: nextRace.raceStartTime,
      sprintWeekend: nextRace.sprintWeekend,
      sprintQualifyingStartTime: nextRace.sprintQualifyingStartTime,
      sprintStartTime: nextRace.sprintStartTime,
      timeZone: nextRace.timeZone,
      cancelled: nextRace.cancelled,
    };

    const updateCountdown = () => {
      let lockTime = getPredictionLockTime(raceObj, "race");
      if (raceObj.sprintWeekend && raceObj.sprintQualifyingStartTime) {
        const sprintLock = getPredictionLockTime(raceObj, "sprint");
        if (sprintLock && sprintLock > new Date() && (!lockTime || sprintLock < lockTime)) {
          lockTime = sprintLock;
        }
      }

      if (!lockTime) {
        setTimeLeft("Locked");
        return;
      }

      const diff = lockTime.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Locked");
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      parts.push(`${String(h).padStart(2, "0")}h`);
      parts.push(`${String(m).padStart(2, "0")}m`);
      if (d === 0) {
        parts.push(`${String(s).padStart(2, "0")}s`);
      }

      setTimeLeft(parts.join(" "));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextRace]);

  if (!nextRace || !timeLeft) {
    return null;
  }

  return (
    <div className="fixed left-0 right-0 top-[28px] z-40 border-b border-signal/20 bg-background/95 backdrop-blur lg:left-[240px]">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2 data-mono text-[10px] uppercase text-muted-foreground sm:px-6 lg:px-8">
        <CalendarClock className="h-3.5 w-3.5 text-signal" />
        <span className="text-signal">Next Lock Window</span>
        <span className="h-3 w-px bg-border" />
        <span className="truncate text-white">
          {nextRace.raceName.replace(" Grand Prix", " GP")} - {timeLeft}
        </span>
      </div>
    </div>
  );
}

const navButtonClass = (active: boolean) =>
  cn(
    "group relative flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm transition-colors",
    active
      ? "bg-surface-2 text-foreground"
      : "text-muted-foreground hover:bg-surface-1 hover:text-foreground",
  );

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuth();
  const items = user?.role === "admin" ? [...navItems, adminNavItem] : navItems;

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <Link key={item.to} to={item.to} onClick={onNavigate} className={navButtonClass(active)}>
            {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] bg-signal" />}
            <Icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            <span className="data-mono text-[9px] text-muted-foreground/70">{item.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const Navbar = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("cockpit-nav-mounted");
    return () => document.body.classList.remove("cockpit-nav-mounted");
  }, []);

  return (
    <>
      <StatusBar />
      <RaceCountdownBar />

      <aside className="cockpit-sidebar fixed bottom-0 left-0 top-0 z-50 hidden w-[240px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="border-b border-border p-5">
          <BrandMark to="/dashboard" />
        </div>

        <div className="px-3 pb-2 pt-5">
          <div className="label-eyebrow mb-2 px-2">Navigation</div>
          <NavLinks />
        </div>

        <div className="mt-auto space-y-3 p-3">
          {user && <div className="flex items-center justify-between px-2"><span className="label-eyebrow">Alerts</span><NotificationBell /></div>}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full rounded-sm border border-border bg-surface-1 p-2 text-left transition-colors hover:border-signal focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 rounded-sm border border-border bg-surface-2">
                    <AvatarImage src={`https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`} alt={user.name} />
                    <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                    <p className="data-mono truncate text-[10px] text-muted-foreground">SIGNED IN</p>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 rounded-sm border-border bg-popover" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none text-white">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer rounded-sm">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-sm text-destructive focus:bg-destructive/10">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex items-center gap-2 px-2 py-1.5 data-mono text-[10px] text-muted-foreground">
            <Radio className="h-3 w-3 text-signal" />
            CONNECTED / TELEMETRY FEED
          </div>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-[62px] z-50 border-b border-border bg-sidebar/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <BrandMark to="/dashboard" compact />
          {user && <NotificationBell />}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="cockpit" size="icon" className="ml-auto">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[92vw] max-w-sm px-4">
              <div className="mt-8 flex flex-col gap-6">
                <BrandMark to="/dashboard" />
                {user && (
                  <div className="panel p-4">
                    <p className="label-eyebrow">Signed in as</p>
                    <p className="mt-2 text-base font-semibold text-white">{user.name}</p>
                    <p className="text-sm text-white/55">{user.email}</p>
                  </div>
                )}
                <NavLinks onNavigate={() => setOpen(false)} />
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="cockpit" onClick={() => setProfileOpen(true)}>
                    <UserCircle className="h-4 w-4" />
                    Profile
                  </Button>
                  <Button variant="outline" onClick={logout}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <EditProfileModal isOpen={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};

export default Navbar;
