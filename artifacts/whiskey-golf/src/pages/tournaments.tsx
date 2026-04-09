import { useListTournaments, getListTournamentsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Trophy, Trash2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-muted-border",
    live: "bg-green-900/40 text-green-400 border-green-700/50",
    completed: "bg-primary/20 text-primary border-primary/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[status] ?? variants.draft}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />}
      {status}
    </span>
  );
}

function DeleteConfirmDialog({
  tournament,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  tournament: { id: number; name: string };
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delete tournament?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">"{tournament.name}"</span> and all its golfers, draft picks, results, and scores will be permanently deleted. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="button-confirm-delete"
          >
            {isDeleting ? "Deleting..." : "Delete tournament"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  const { data: tournaments, isLoading } = useListTournaments({ query: { queryKey: getListTournamentsQueryKey() } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const list = (tournaments as { id: number; name: string; courseName?: string | null; startDate: string; endDate: string; status: string; winnerId?: number | null }[] | undefined) ?? [];

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tournaments/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      queryClient.removeQueries({ queryKey: getListTournamentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
      toast({ title: `"${pendingDelete.name}" deleted` });
      setPendingDelete(null);
    } catch (err) {
      toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Tournaments</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">All your fantasy golf rounds</p>
          </div>
          <Link href="/tournaments/new">
            <Button data-testid="button-create-tournament" size="sm" className="sm:text-sm">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Tournament</span>
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : list.length === 0 ? (
          <div className="bg-card border border-card-border rounded-xl p-12 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No tournaments yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first tournament to get started</p>
            <Link href="/tournaments/new">
              <Button data-testid="button-first-tournament">Create tournament</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-card border border-card-border rounded-xl p-5 hover:border-primary/40 transition-colors group"
              >
                <Link
                  href={`/tournaments/${t.id}`}
                  data-testid={`card-tournament-${t.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground">{t.name}</h3>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{t.startDate} — {t.endDate}</span>
                        {t.courseName && <span>{t.courseName}</span>}
                      </div>
                    </div>
                    {t.status === "completed" && t.winnerId && (
                      <div className="flex items-center gap-1.5 text-primary mr-3">
                        <Trophy className="w-4 h-4" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  onClick={e => { e.preventDefault(); setPendingDelete({ id: t.id, name: t.name }); }}
                  data-testid={`button-delete-tournament-${t.id}`}
                  className="flex-shrink-0 p-2 rounded-lg text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-950/30 active:text-red-400 active:bg-red-950/30 transition-all"
                  title="Delete tournament"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteConfirmDialog
          tournament={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </Layout>
  );
}
