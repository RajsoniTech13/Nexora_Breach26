import React from 'react'

export default function Header({ 
  activeGroup, 
  activeTab, 
  setActiveTab, 
  setShowAddExpense 
}) {
  return (
    <header className="flex items-center justify-between gap-3 bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex-shrink-0">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 truncate tracking-tight">
          {activeTab === 'profile' ? 'My Profile' : activeTab === 'groups' ? 'My Groups' : activeGroup?.name || 'Dashboard'}
        </h1>
        {activeGroup && activeTab !== 'profile' && activeTab !== 'groups' && (
          <span className="hidden md:inline-flex px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 uppercase tracking-wide">
            {activeGroup.currency}
          </span>
        )}
      </div>
      
      {/* Desktop: Show Add Expense button in header if group is active */}
      {activeGroup && activeTab !== 'profile' && activeTab !== 'groups' && (
        <button onClick={() => setShowAddExpense(true)}
          className="hidden md:flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
          Add Expense
        </button>
      )}

      {/* Desktop: Tab selector in header */}
      {activeGroup && (
        <div className="hidden md:flex rounded-xl bg-slate-100 p-1 flex-shrink-0">
          {['expenses', 'balances', 'members', 'profile'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-bold capitalize transition-all
                ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
