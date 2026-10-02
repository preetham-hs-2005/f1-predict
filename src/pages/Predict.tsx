import { useEffect, useState } from "react";
import { Lock, X, Zap } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import Navbar from "@/components/layout/Navbar";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import PredictionForm from "@/components/prediction/PredictionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getRaceByIdFromServer } from "@/lib/api/races";
import { getPredictionLockSource, isPredictionLocked, type RaceWeekend } from "@/lib/data/raceCalendar";

const Predict = () => {
  const { raceId, type = "race" } = useParams<{ raceId: string; type: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [race, setRace] = useState<RaceWeekend | null>(null);
  const [raceLoading, setRaceLoading] = useState(true);
  const [raceError, setRaceError] = useState<string | null>(null);

  const predictionType = type === "sprint" ? "sprint" : "race";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) navigate("/login");
  }, [isAuthenticated, navigate, isLoading]);

  useEffect(() => {
    const loadRace = async () => {
      if (!raceId || !isAuthenticated) return;

      try {
        setRaceLoading(true);
        setRaceError(null);
        const serverRace = await getRaceByIdFromServer(raceId);
        if (!serverRace) {
          setRace(null);
          return;
        }

        setRace({
          id: serverRace.raceId,
          raceName: serverRace.raceName,
          circuitName: serverRace.circuitName,
          country: serverRace.country || "",
          countryFlag: serverRace.countryFlag,
          round: serverRace.round,
          sprintQualifyingStartTime: serverRace.sprintQualifyingStartTime,
          qualifyingStartTime: serverRace.qualifyingStartTime,
          raceStartTime: serverRace.raceStartTime,
          sprintWeekend: serverRace.sprintWeekend,
          timeZone: serverRace.timeZone,
          isLocked: serverRace.isLocked || false,
          isComplete: serverRace.isComplete || false,
          cancelled: serverRace.cancelled || false,
          officialResults: null,
        });
      } catch (error) {
        setRaceError(error instanceof Error ? error.message : "Failed to load race");
        setRace(null);
      } finally {
        setRaceLoading(false);
      }
    };

    loadRace();
  }, [raceId, isAuthenticated]);

  useEffect(() => {
    if (race && predictionType === "sprint" && !race.sprintWeekend) {
      navigate(`/predict/${raceId}/race`, { replace: true });
    }
  }, [race, predictionType, raceId, navigate]);

  if (isLoading || raceLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-signal" />
      </div>
    );
  }

  if (!race) {
    return (
      <PageShell>
        <Navbar />
        <main className="mx-auto max-w-[1100px] px-4 pt-32 sm:px-6 lg:px-8">
          <section className="section-card text-center">
            <p className="display text-2xl font-semibold text-white">{raceError || "Race not found"}</p>
          </section>
        </main>
      </PageShell>
    );
  }

  const isSprint = predictionType === "sprint";
  const locked = isPredictionLocked(race, predictionType);
  const lockDeadline = getPredictionLockSource(race, predictionType);

  return (
    <PageShell>
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-4 pb-12 pt-32 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={`Round ${race.round}`}
          title={race.raceName}
          description={race.circuitName}
          badge={isSprint ? "Sprint" : "Grand Prix"}
          stats={[
            { label: "Event", value: race.countryFlag },
            { label: "Type", value: isSprint ? "Sprint" : "Grand Prix" },
            { label: "Deadline", value: locked ? "Locked" : "Open" },
            { label: "Time", value: "IST" },
          ]}
        />

        <section className="mt-8">
          {race.sprintWeekend && (
            <div className="mb-6 grid gap-3 sm:flex sm:flex-wrap">
              <button
                onClick={() => navigate(`/predict/${raceId}/sprint`)}
                className={`data-mono min-w-0 rounded-sm border px-5 py-3 text-sm font-semibold uppercase transition-colors ${
                  isSprint
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-border bg-surface-2 text-white/60 hover:text-white"
                }`}
              >
                <Zap className="mr-2 inline h-4 w-4" />
                Sprint
              </button>
              <button
                onClick={() => navigate(`/predict/${raceId}/race`)}
                className={`data-mono min-w-0 rounded-sm border px-5 py-3 text-sm font-semibold uppercase transition-colors ${
                  !isSprint
                    ? "border-signal/30 bg-signal/10 text-signal"
                    : "border-border bg-surface-2 text-white/60 hover:text-white"
                }`}
              >
                Grand Prix
              </button>
            </div>
          )}

          <div className="mb-8 flex min-w-0 flex-wrap items-center gap-3">
            {isSprint && (
              <Badge variant="outline" className="data-mono rounded-sm border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase text-warning">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Sprint / 0.5x points
              </Badge>
            )}
            {race.cancelled ? (
              <Badge className="data-mono rounded-sm border border-destructive/25 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase text-destructive">
                <X className="mr-1.5 h-3.5 w-3.5" />
                Race cancelled
              </Badge>
            ) : locked ? (
              <Badge className="data-mono rounded-sm border border-warning/25 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase text-warning">
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Predictions locked
              </Badge>
            ) : (
              <div className="data-mono rounded-sm border border-border bg-surface-2 px-4 py-2 text-sm text-white/68">
                Locks in <CountdownTimer targetDate={lockDeadline} className="ml-2 inline font-semibold text-white" />
              </div>
            )}
          </div>

          {!user?.emailVerified ? (
            <div className="rounded-sm border border-signal/30 bg-signal/10 p-6 text-center">
              <p className="mb-4 font-medium text-white">Verify your email to make predictions.</p>
              <Button onClick={() => navigate("/dashboard")}>Open verification</Button>
            </div>
          ) : race.cancelled ? (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-6 text-center">
              <p className="font-medium text-destructive">This race has been cancelled. Predictions are not available.</p>
            </div>
          ) : (
            <PredictionForm race={race} type={predictionType} locked={locked} />
          )}
        </section>
      </main>
    </PageShell>
  );
};

export default Predict;
