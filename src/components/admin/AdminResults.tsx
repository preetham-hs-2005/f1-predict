import { useState, useEffect } from "react";
import { getAllRaces } from "@/lib/api/races";
import { type RaceWeekend } from "@/lib/data/raceCalendar";
import { useDrivers } from "@/hooks/useDrivers";
import { getAdminResults, saveAdminResult, getAdminScores, getResultSyncStatus, resumeAutoResult, type ResultSyncStatus } from "@/lib/api/admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle, Zap, TrendingUp } from "lucide-react";

const AdminResults = () => {
  const [selectedRace, setSelectedRace] = useState("");
  const [resultType, setResultType] = useState<"race" | "sprint">("race");
  const [allResults, setAllResults] = useState<any[]>([]);
  const [allScores, setAllScores] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<ResultSyncStatus[]>([]);
  const [races, setRaces] = useState<RaceWeekend[]>([]);
  const [loading, setLoading] = useState(false);

  const race = races.find((r) => r.id === selectedRace);
  const existingResult = selectedRace ? allResults.find((r) => r.raceId === selectedRace && r.type === resultType) : null;

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");
  const [pole, setPole] = useState("");
  const [bestConstructor, setBestConstructor] = useState("");

  const { drivers, isLoading: loadingDrivers } = useDrivers();
  const teamsWithColors = Array.from(new Set(drivers.map(d => d.team)))
    .sort()
    .map(team => ({ team }));

  // Load results and scores from MongoDB
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [results, scores, serverRaces, status] = await Promise.all([getAdminResults(), getAdminScores(), getAllRaces(), getResultSyncStatus()]);
        setAllResults(results);
        setAllScores(scores);
        setSyncStatus(status);
        setRaces(serverRaces.map((race) => ({
          id: race.raceId,
          raceName: race.raceName,
          circuitName: race.circuitName,
          country: race.country || "",
          countryFlag: race.countryFlag,
          round: race.round,
          qualifyingStartTime: race.qualifyingStartTime,
          raceStartTime: race.raceStartTime,
          sprintWeekend: race.sprintWeekend,
          sprintQualifyingStartTime: race.sprintQualifyingStartTime,
          timeZone: race.timeZone,
          isLocked: race.isLocked || false,
          isComplete: race.isComplete || false,
          cancelled: race.cancelled || false,
        })));
      } catch (error) {
        console.error("Failed to load results:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const loadExisting = (raceId: string, type: "race" | "sprint") => {
    const result = allResults.find((r) => r.raceId === raceId && r.type === type);
    if (result) {
      setP1(result.p1 || "");
      setP2(result.p2 || "");
      setP3(result.p3 || "");
      setPole(result.pole || "");
      setBestConstructor(result.bestConstructor || "");
    } else {
      setP1("");
      setP2("");
      setP3("");
      setPole("");
      setBestConstructor("");
    }
  };

  const handleRaceChange = (id: string) => {
    setSelectedRace(id);
    setResultType("race");
    loadExisting(id, "race");
  };

  const handleTypeChange = (type: "race" | "sprint") => {
    setResultType(type);
    loadExisting(selectedRace, type);
  };

  const handleSubmit = async () => {
    if (!p1 && !p2 && !p3 && !pole && !bestConstructor) {
      toast.error("At least one position or best constructor must be filled");
      return;
    }
    const podium = [p1, p2, p3].filter(Boolean);
    if (new Set(podium).size !== podium.length) {
      toast.error("Each selected podium position must be a different driver");
      return;
    }

    const result = { raceId: selectedRace, type: resultType, p1, p2, p3, pole, bestConstructor };
    try {
      const saved = await saveAdminResult(result);
      if (!saved) throw new Error("Result save failed");
      // Refresh results
      const [results, scores] = await Promise.all([getAdminResults(), getAdminScores()]);
      setAllResults(results);
      setAllScores(scores);
      toast.success(`${resultType === "sprint" ? "Sprint" : "Race"} results saved & predictions scored!`);
    } catch (error) {
      toast.error("Failed to save results");
      console.error(error);
    }
  };

  const handleResumeAuto = async () => {
    try {
      await resumeAutoResult(selectedRace, resultType);
      setAllResults(await getAdminResults());
      toast.success("Automatic result updates resumed");
    } catch {
      toast.error("Could not resume automatic updates");
    }
  };




  const completedResults = races
    .map((r) => ({
      race: r,
      hasRace: !!allResults.find((res) => res.raceId === r.id && res.type === "race" && res.status === "complete"),
      hasSprint: r.sprintWeekend ? !!allResults.find((res) => res.raceId === r.id && res.type === "sprint" && res.status === "complete") : null,
    }))
    .filter((r) => r.hasRace || r.hasSprint);

  // Calculate summary stats
  const raceScores = selectedRace ? allScores.filter((s) => s.raceId === selectedRace && s.type === resultType) : [];
  const summaryStats = {
    participantsScored: raceScores.length,
    avgScore: raceScores.length > 0 ? Math.round(raceScores.reduce((sum, s) => sum + (s.total || 0), 0) / raceScores.length) : 0,
    highestScore: raceScores.length > 0 ? Math.max(...raceScores.map((s) => s.total || 0)) : 0,
    totalScoreAwarded: raceScores.reduce((sum, s) => sum + (s.total || 0), 0),
  };

  return (
    <div className="space-y-6">
      {loading || loadingDrivers ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading race results...</p>
        </div>
      ) : (
        <>
      {/* Race selector */}
      <section className="glass rounded-xl p-6">
        <h2 className="f1-heading text-sm text-muted-foreground mb-4">Enter Race Results</h2>
        <Select value={selectedRace} onValueChange={handleRaceChange}>
          <SelectTrigger className="bg-background/50 mb-4">
            <SelectValue placeholder="Select a race" />
          </SelectTrigger>
          <SelectContent>
            {races.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.countryFlag} R{r.round} · {r.raceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {race && (
          <>
            <div className="mb-4 text-xs text-muted-foreground">
              {existingResult ? (
                <>
                  {existingResult.source === "jolpica" ? "Automatic feed" : "Manual result"} · {existingResult.status || "complete"}
                  {existingResult.syncedAt && ` · synced ${new Date(existingResult.syncedAt).toLocaleString()}`}
                  {existingResult.manualOverride && " · manual override active"}
                </>
              ) : (
                <>Sync: {syncStatus.find((item) => item._id === selectedRace)?.status || "awaiting check"}</>
              )}
              {syncStatus.find((item) => item._id === selectedRace)?.lastError && (
                <p className="mt-1 text-destructive">Feed error: {syncStatus.find((item) => item._id === selectedRace)?.lastError}</p>
              )}
            </div>
            {/* Type selector for sprint weekends */}
            {race.sprintWeekend && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleTypeChange("race")}
                  className={`px-4 py-2 rounded-lg text-sm f1-heading transition-all ${
                    resultType === "race"
                      ? "bg-primary/20 text-primary border border-primary/50"
                      : "glass text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Grand Prix
                </button>
                <button
                  onClick={() => handleTypeChange("sprint")}
                  className={`px-4 py-2 rounded-lg text-sm f1-heading transition-all ${
                    resultType === "sprint"
                      ? "bg-f1-warning/20 text-f1-warning border border-f1-warning/50"
                      : "glass text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Zap className="h-3 w-3 inline mr-1" />
                  Sprint
                </button>
              </div>
            )}

            {/* Position selectors */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: "P1 - Winner", value: p1, setter: setP1, exclude: [p2, p3] },
                { label: "P2 - Second", value: p2, setter: setP2, exclude: [p1, p3] },
                { label: "P3 - Third", value: p3, setter: setP3, exclude: [p1, p2] },
                { label: "Pole Position", value: pole, setter: setPole, exclude: [] },
              ].map((pos) => (
                <div key={pos.label}>
                  <label className="text-xs text-muted-foreground mb-1 block">{pos.label}</label>
                  <Select value={pos.value} onValueChange={pos.setter}>
                    <SelectTrigger className="bg-background/50">
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers
                        .filter((d) => !pos.exclude.includes(d.id))
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                              #{d.number} {d.name}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Constructor Result */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">Best Scoring Constructor</label>
              <Select value={bestConstructor} onValueChange={setBestConstructor}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teamsWithColors.map((t) => (
                    <SelectItem key={t.team} value={t.team}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                        {t.team}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSubmit} className="w-full" size="lg">
              Save Manual Result & Score Predictions
            </Button>
            {existingResult?.manualOverride && (
              <Button onClick={handleResumeAuto} variant="outline" className="mt-2 w-full">Resume automatic updates</Button>
            )}
          </>
        )}
      </section>

      {/* Race stats summary */}
      {selectedRace && existingResult && (
        <section className="glass rounded-xl p-6">
          <h2 className="f1-heading text-sm text-muted-foreground mb-4">Scoring Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="glass border-0 bg-background/30">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Participants Scored</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold f1-heading">{summaryStats.participantsScored}</p>
              </CardContent>
            </Card>
            <Card className="glass border-0 bg-background/30">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Average Score</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold f1-heading">{summaryStats.avgScore}</p>
              </CardContent>
            </Card>
            <Card className="glass border-0 bg-background/30">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Highest Score</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold f1-heading text-f1-success">{summaryStats.highestScore}</p>
              </CardContent>
            </Card>
            <Card className="glass border-0 bg-background/30">
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Total Awarded</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold f1-heading text-f1-gold">{summaryStats.totalScoreAwarded}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Completed results summary */}
      {completedResults.length > 0 && (
        <section className="glass rounded-xl p-6">
          <h2 className="f1-heading text-sm text-muted-foreground mb-4">Completed Races ({completedResults.length})</h2>
          <div className="space-y-2">
            {completedResults.map(({ race: r, hasRace, hasSprint }) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 px-4 rounded-lg bg-background/30 hover:bg-background/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{r.countryFlag}</span>
                  <div>
                    <span className="text-sm font-semibold">{r.raceName}</span>
                    <p className="text-xs text-muted-foreground">Round {r.round}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {hasRace && (
                    <Badge variant="outline" className="text-f1-success border-f1-success/50 gap-1">
                      <CheckCircle className="h-3 w-3" />
                      <span className="hidden sm:inline">Race</span>
                    </Badge>
                  )}
                  {hasSprint && (
                    <Badge variant="outline" className="text-f1-warning border-f1-warning/50 gap-1">
                      <Zap className="h-3 w-3" />
                      <span className="hidden sm:inline">Sprint</span>
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
};

export default AdminResults;
