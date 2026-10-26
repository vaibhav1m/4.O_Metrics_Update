"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { useCurrentUser, setCurrentUser } from "@/lib/useCurrentUser";

// Nav-bar control for "who am I". Not a login — just a name that scopes
// per-user data (folders). See src/lib/currentUser.ts.
export default function UserBadge() {
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <form
        className="user-badge-form"
        onSubmit={e => { e.preventDefault(); setCurrentUser(draft); setEditing(false); }}
      >
        <input
          autoFocus
          className="input-field"
          placeholder="Your name"
          maxLength={64}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>Save</button>
      </form>
    );
  }

  return (
    <button
      className="user-badge"
      onClick={() => { setDraft(user); setEditing(true); }}
      title={user ? "Switch user" : "Set your name to use folders"}
    >
      <UserRound size={15} />
      {user || "Set your name"}
    </button>
  );
}
