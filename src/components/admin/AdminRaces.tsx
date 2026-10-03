import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { isoToIstInput, istInputToIso } from "@/lib/istDateTime";
import { Loader2, X, Plus, AlertCircle, CheckCircle2, Zap, Pencil } from "lucide-react";
import {
  getAdminRaces,
  toggleRaceCancelled,
  addAdminRace,
  updateAdminRace,
  deleteAdminRace,
  seedDefaultRaces,
  type AdminRace,
} from "@/lib/api/admin";

const AdminRaces = () => {
  const [races, setRaces] = useState<AdminRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingRace, setEditingRace] = useState<AdminRace | null>(null);

  const [formData, setFormData] = useState({
    raceId: "",
    raceName: "",
    round: "",
    countryFlag: "",
    circuitName: "",
    qualifyingStartTime: "",
    raceStartTime: "",
    timeZone: "UTC",
    sprintWeekend: false,
    sprintQualifyingStartTime: "",
  });

  useEffect(() => {
    loadRaces();
  }, []);

  const loadRaces = async () => {
    setLoading(true);
    try {
      const data = await getAdminRaces();
      setRaces(data);
    } catch (error) {
      toast.error("Failed to load races");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCancelled = async (raceId: string) => {
    setToggling(raceId);
    try {
      const success = await toggleRaceCancelled(raceId);
      if (success) {
        setRaces((prev) =>
          prev.map((r) =>
            r.raceId === raceId ? { ...r, cancelled: !r.cancelled } : r
          )
        );
        const race = races.find((r) => r.raceId === raceId);
        const action = race?.cancelled ? "uncancelled" : "cancelled";
        toast.success(`Race ${action} successfully`);
      } else {
        toast.error("Failed to update race");
      }
    } catch (error) {
      toast.error("Failed to update race");
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteRace = async (raceId: string) => {
    if (!confirm("Are you sure you want to delete this race?")) return;

    setDeleting(raceId);
    try {
      const success = await deleteAdminRace(raceId);
      if (success) {
        toast.success("Race deleted successfully and rounds resequenced");
        await loadRaces();
      } else {
        toast.error("Failed to delete race");
      }
    } catch (error) {
      toast.error("Failed to delete race");
    } finally {
      setDeleting(null);
    }
  };

  const handleSeedRaces = async () => {
    if (!confirm("This will populate all 24 F1 2026 races. Continue?")) return;

    setSeeding(true);
    try {
      const success = await seedDefaultRaces();
      if (success) {
        await loadRaces();
        toast.success("All 24 races seeded successfully");
      } else {
        toast.error("Failed to seed races");
      }
    } catch (error) {
      const err = error as any;
      toast.error(err?.message || "Failed to seed races");
    } finally {
      setSeeding(false);
    }
  };

  const handleStartEdit = (race: AdminRace) => {
    setEditingRace(race);
    setFormData({
      raceId: race.raceId,
      raceName: race.raceName,
      round: String(race.round),
      countryFlag: race.countryFlag || "",
      circuitName: race.circuitName || "",
      qualifyingStartTime: isoToIstInput(race.qualifyingStartTime),
      raceStartTime: isoToIstInput(race.raceStartTime),
      timeZone: race.timeZone || "UTC",
      sprintWeekend: race.sprintWeekend || false,
      sprintQualifyingStartTime: isoToIstInput(race.sprintQualifyingStartTime),
    });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setFormData({
      raceId: "",
      raceName: "",
      round: "",
      countryFlag: "",
      circuitName: "",
      qualifyingStartTime: "",
      raceStartTime: "",
      timeZone: "UTC",
      sprintWeekend: false,
      sprintQualifyingStartTime: "",
    });
    setEditingRace(null);
    setShowForm(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.raceId || !formData.raceName || !formData.round) {
      toast.error("Please fill in all required fields");
      return;
    }

    setAdding(true);
    try {
      const racePayload = {
        raceId: formData.raceId,
        raceName: formData.raceName,
        round: parseInt(formData.round),
        countryFlag: formData.countryFlag,
        circuitName: formData.circuitName,
        qualifyingStartTime: istInputToIso(formData.qualifyingStartTime),
        raceStartTime: istInputToIso(formData.raceStartTime),
        timeZone: formData.timeZone,
        sprintWeekend: formData.sprintWeekend,
        sprintQualifyingStartTime: formData.sprintQualifyingStartTime ? istInputToIso(formData.sprintQualifyingStartTime) : undefined,
        cancelled: false,
      };

      if (editingRace) {
        const updated = await updateAdminRace(editingRace.raceId, racePayload);
        if (updated) {
          toast.success("Race updated successfully");
          handleCancelForm();
          await loadRaces();
        } else {
          toast.error("Failed to update race");
        }
      } else {
        const newRace = await addAdminRace(racePayload);
        if (newRace) {
          toast.success("Race added successfully");
          handleCancelForm();
          await loadRaces();
        } else {
          toast.error("Failed to add race");
        }
      }
    } catch (error) {
      const err = error as any;
      toast.error(err?.message || "Operation failed");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add/Edit Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="f1-heading text-lg">Race Management</h2>
          <p className="text-xs text-muted-foreground">
            {races.length} races • {races.filter((r) => r.cancelled).length} cancelled
          </p>
        </div>
        <Button
          onClick={() => {
            if (showForm) {
              handleCancelForm();
            } else {
              setShowForm(true);
            }
          }}
          className="gap-2"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Close Form" : "Add Race"}
        </Button>
      </div>

      {/* Add/Edit Race Form */}
      {showForm && (
        <Card className="glass border-0">
          <CardHeader>
            <CardTitle className="text-base">
              {editingRace ? `Edit Race: ${editingRace.raceName}` : "Add New Race"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium">Race ID *</label>
                  <Input
                    placeholder="e.g., bahrain-2026"
                    value={formData.raceId}
                    onChange={(e) => setFormData({ ...formData, raceId: e.target.value })}
                    className="mt-1"
                    disabled={!!editingRace} // Prevent changing ID for existing race
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Round *</label>
                  <Input
                    type="number"
                    placeholder="e.g., 1"
                    value={formData.round}
                    onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium">Race Name *</label>
                  <Input
                    placeholder="e.g., Bahrain Grand Prix"
                    value={formData.raceName}
                    onChange={(e) => setFormData({ ...formData, raceName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Country Flag</label>
                  <Input
                    placeholder="e.g., 🇧🇭"
                    value={formData.countryFlag}
                    onChange={(e) => setFormData({ ...formData, countryFlag: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium">Circuit Name</label>
                <Input
                  placeholder="e.g., Bahrain International Circuit"
                  value={formData.circuitName}
                  onChange={(e) => setFormData({ ...formData, circuitName: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium">Qualifying Start (IST) *</label>
                  <Input
                    type="datetime-local"
                    value={formData.qualifyingStartTime}
                    onChange={(e) =>
                      setFormData({ ...formData, qualifyingStartTime: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Race Start (IST) *</label>
                  <Input
                    type="datetime-local"
                    value={formData.raceStartTime}
                    onChange={(e) =>
                      setFormData({ ...formData, raceStartTime: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium">Venue Time Zone</label>
                  <Input
                    placeholder="e.g., Asia/Bahrain"
                    value={formData.timeZone}
                    onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.sprintWeekend}
                      onChange={(e) =>
                        setFormData({ ...formData, sprintWeekend: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-xs font-medium">Sprint Weekend</span>
                  </label>
                </div>
              </div>

              {formData.sprintWeekend && (
                <div>
                  <label className="text-xs font-medium">Sprint Qualifying Start (IST)</label>
                  <Input
                    type="datetime-local"
                    value={formData.sprintQualifyingStartTime}
                    onChange={(e) =>
                      setFormData({ ...formData, sprintQualifyingStartTime: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={adding} className="flex-1">
                  {adding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingRace ? "Update Race" : "Add Race"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelForm}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Races List */}
      <div className="space-y-2">
        {races.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center space-y-4">
            <div className="space-y-2">
              <p className="text-muted-foreground">No races found</p>
              <p className="text-xs text-muted-foreground/70">Seed the database with the 24 F1 2026 races to get started</p>
            </div>
            <Button
              onClick={handleSeedRaces}
              disabled={seeding}
              className="gap-2"
            >
              {seeding && <Loader2 className="h-4 w-4 animate-spin" />}
              <Zap className="h-4 w-4" />
              Seed 24 F1 2026 Races
            </Button>
          </div>
        ) : (
          races.map((race) => (
            <div
              key={race.raceId}
              className={`glass rounded-lg p-4 flex items-center justify-between transition-all ${
                race.cancelled ? "opacity-60 border-destructive/30" : ""
              }`}
            >
              <div className="flex items-center gap-4 flex-1">
                <span className="text-2xl">{race.countryFlag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="f1-heading text-sm font-semibold">{race.raceName}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      R{race.round}
                    </Badge>
                    {race.sprintWeekend && (
                      <Badge
                        variant="outline"
                        className="border-f1-warning/50 text-f1-warning text-[10px]"
                      >
                        Sprint
                      </Badge>
                    )}
                    {race.cancelled && (
                      <Badge className="bg-destructive/20 text-destructive text-[10px] gap-1">
                        <X className="h-2.5 w-2.5" />
                        Cancelled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{race.circuitName}</p>
                  <p className="text-xs text-muted-foreground/70">
                    {new Date(race.raceStartTime).toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStartEdit(race)}
                  className="gap-1"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>

                <Button
                  size="sm"
                  variant={race.cancelled ? "outline" : "destructive"}
                  onClick={() => handleToggleCancelled(race.raceId)}
                  disabled={toggling === race.raceId}
                  className="gap-1"
                >
                  {toggling === race.raceId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : race.cancelled ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Restore
                    </>
                  ) : (
                    <>
                      <X className="h-3 w-3" />
                      Cancel
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteRace(race.raceId)}
                  disabled={deleting === race.raceId}
                >
                  {deleting === race.raceId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminRaces;
