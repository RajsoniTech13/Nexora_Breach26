import React from 'react'
import { Package, Plus, LogOut, Link2 } from 'lucide-react'

export default function Sidebar({
  user,
  groups,
  activeGroupId,
  setActiveGroupId,
  loading,
  setShowCreateGroup,
  setShowJoinGroup,
  onLogout,
  onCloseSheet // optional for mobile
}) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white overflow-hidden">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800 flex-shrink-0">
        <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path>
            <path d="M14 2v6h6"></path>
            <path d="m3 12.5 3 3 5-5"></path>
          </svg>
        </div>
        <span className="font-bold text-lg tracking-tight">Nexora</span>
      </div>

      {/* User Info */}
      <div className="px-4 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="rounded-xl bg-slate-800/50 p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-sm font-bold text-emerald-400 flex-shrink-0">
            {(user?.displayName || user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-white">{user?.displayName || user?.username}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2 border-b border-slate-800 flex-shrink-0">
        <button onClick={() => { setShowCreateGroup(true); onCloseSheet?.(); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 transition-colors">
          <Plus className="w-4 h-4" /> New
        </button>
        <button onClick={() => { setShowJoinGroup(true); onCloseSheet?.(); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-700 transition-colors">
          <Link2 className="w-4 h-4" /> Join
        </button>
      </div>

      {/* Group List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-3 mt-1">Your Groups</p>
        
        {loading ? (
          <div className="space-y-2 px-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded-xl bg-slate-800/50 animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-2 py-4 flex flex-col items-center justify-center text-center">
            <Package className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">No groups yet.</p>
          </div>
        ) : (
          groups.map((g) => {
            const isActive = activeGroupId === g.id
            return (
              <button key={g.id} onClick={() => { setActiveGroupId(g.id); onCloseSheet?.(); }}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all
                  ${isActive
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'hover:bg-slate-800 border border-transparent text-slate-300'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{g.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Sign Out */}
      <div className="px-4 py-4 border-t border-slate-800 flex-shrink-0">
        <button onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  )
}
