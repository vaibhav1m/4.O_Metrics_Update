"use client";

import { LogOut, UserRound } from "lucide-react";
import { useMe } from "@/lib/useMe";

// Nav-bar: who is signed in (name + role) and a Logout action.
export default function UserBadge() {
  const { me, logout } = useMe();
  if (!me) return null;

  return (
    <div className="user-badge-wrap">
      <span className="user-badge" title={me.user.email}>
        <UserRound size={15} />
        {me.user.name}
        {me.role && <span className="user-badge-role">{me.role}</span>}
      </span>
      <button className="btn btn-outline btn-sm" onClick={logout} title="Sign out">
        <LogOut size={14} /> Logout
      </button>
    </div>
  );
}
