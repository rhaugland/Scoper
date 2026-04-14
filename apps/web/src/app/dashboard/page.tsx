"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listProjects, createProject, getMe } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(() => listProjects())
      .then(setProjects)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const project = await createProject(newName, newClient || undefined);
    setProjects([project, ...projects]);
    setShowNew(false);
    setNewName("");
    setNewClient("");
    router.push(`/project/${project.id}`);
  }

  const statusColors: Record<string, string> = {
    draft: "bg-surface text-muted",
    scoping: "bg-accent-blue/10 text-accent-blue",
    complete: "bg-accent-blue/20 text-accent-blue",
    proposal_sent: "bg-gradient-to-br from-accent-red to-accent-blue text-white",
    delivered: "bg-green-500/20 text-green-400",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-black bg-gradient-to-br from-accent-red to-accent-blue bg-clip-text text-transparent">slushie.swirl</h1>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-gradient-to-br from-accent-red to-accent-blue text-white rounded-lg font-bold hover:opacity-90 transition"
          >
            New project
          </button>
        </div>

        {showNew && (
          <form onSubmit={handleCreate} className="mb-6 p-4 bg-surface rounded-xl border border-border space-y-3">
            <input
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-navy text-slate-100 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent-blue"
            />
            <input
              type="text"
              placeholder="Client name (optional)"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-navy text-slate-100 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent-blue"
            />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-accent-blue text-white rounded-lg font-medium hover:bg-accent-blue/80 transition">
                Create
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 text-muted hover:text-slate-100">
                Cancel
              </button>
            </div>
          </form>
        )}

        {projects.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p className="text-lg mb-2">No projects yet</p>
            <p>Create your first project to start scoping.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/project/${p.id}`)}
                className="w-full text-left p-4 bg-surface rounded-xl border border-border hover:border-accent-blue/30 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-slate-100">{p.name}</span>
                  {p.clientName && (
                    <span className="ml-2 text-muted">— {p.clientName}</span>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[p.status] ?? "bg-surface text-muted"}`}>
                  {p.status.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
