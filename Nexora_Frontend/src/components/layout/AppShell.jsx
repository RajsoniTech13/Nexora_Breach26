import React, { useState, useEffect } from 'react'
import { api } from '../../api/apiClient'
import { fmt } from '../../utils/formatters'
import { CATEGORY_ICONS } from '../../utils/constants'

// Components
import CreateGroupModal from '../groups/CreateGroupModal'
import JoinGroupModal from '../groups/JoinGroupModal'
import AddExpenseModal from '../expenses/AddExpenseModal'
import SettleUpModal from '../settlements/SettleUpModal'
import ProfileTab from '../profile/ProfileTab'
import Toast from '../common/Toast'
import Sidebar from './Sidebar'

import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet'
import { Menu, Package, Plus, Banknote, Hand, PartyPopper } from 'lucide-react'

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
}

export default function AppShell({ token, user, onLogout }) {
  // Lock body scroll when app shell is active
  useEffect(() => {
    document.body.classList.add('app-shell-active')
    return () => document.body.classList.remove('app-shell-active')
  }, [])

  const [groups, setGroups]         = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [groupDetail, setGroupDetail] = useState(null)   // { group, members }
  const [expenses, setExpenses]     = useState([])
  const [balances, setBalances]     = useState(null)     // { members, settlements }
  const [settlements, setSettlements] = useState([])
  const [activeTab, setActiveTab]   = useState('expenses')

  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showJoinGroup, setShowJoinGroup]     = useState(false)
  const [showExpense, setShowExpense]         = useState(false)
  const [showSettle, setShowSettle]           = useState(false)
  const [sheetOpen, setSheetOpen]             = useState(false)

  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)  // { message, type }

  const showToast = (message, type = 'success') => setToast({ message, type })

  // ── Load groups on mount ────────────────────────────────────────────────
  useEffect(() => {
    api('/api/v1/groups', { token }).then((d) => {
      setGroups(d.groups)
      if (d.groups.length > 0) setActiveGroupId(d.groups[0].id)
      else setLoading(false)
    }).catch(() => setLoading(false))
  }, [token])

  // ── Load group detail + expenses + balances + settlements when group changes ──
  useEffect(() => {
    if (!activeGroupId) return
    setLoading(true)
    setExpenses([])
    setBalances(null)
    setSettlements([])

    Promise.all([
      api(`/api/v1/groups/${activeGroupId}`, { token }),
      api(`/api/v1/groups/${activeGroupId}/expenses`, { token }),
      api(`/api/v1/groups/${activeGroupId}/balances`, { token }),
      api(`/api/v1/groups/${activeGroupId}/settlements`, { token }),
    ]).then(([gd, ed, bd, sd]) => {
      setGroupDetail({ group: gd.group, members: gd.group.members })
      setExpenses(ed.expenses || [])
      // Map new backend response shape to what the UI expects
      const members = (bd.balances || []).map(m => ({
        ...m, id: m.userId, net: Number(m.netBalance || 0)
      }))
      const settlements = (bd.simplifiedDebts || []).map(d => ({
        from: { ...d.from, displayName: d.from?.displayName || d.from?.username },
        to:   { ...d.to,   displayName: d.to?.displayName   || d.to?.username, upiId: d.to?.upiId },
        amount: d.amount
      }))
      setBalances({ members, settlements })
      setSettlements(sd.settlements || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [activeGroupId, token])

  function refreshExpenses() {
    Promise.all([
      api(`/api/v1/groups/${activeGroupId}/expenses`, { token }),
      api(`/api/v1/groups/${activeGroupId}/balances`, { token }),
      api(`/api/v1/groups/${activeGroupId}/settlements`, { token }),
    ]).then(([ed, bd, sd]) => {
      setExpenses(ed.expenses || [])
      const members = (bd.balances || []).map(m => ({
        ...m, id: m.userId, net: Number(m.netBalance || 0)
      }))
      const settlements = (bd.simplifiedDebts || []).map(d => ({
        from: { ...d.from, displayName: d.from?.displayName || d.from?.username },
        to:   { ...d.to,   displayName: d.to?.displayName   || d.to?.username, upiId: d.to?.upiId },
        amount: d.amount
      }))
      setBalances({ members, settlements })
      setSettlements(sd.settlements || [])
    })
  }

  const activeGroup = groupDetail?.group
  const members     = groupDetail?.members || []

  // Summary totals from balances
  const myNet   = balances?.members?.find((m) => m.id === user.id)?.net || 0
  const totalOwed  = balances?.members?.reduce((s, m) => m.id !== user.id && m.net < -0.005 ? s + Math.abs(m.net) : s, 0) || 0
  const totalOwing = balances?.members?.reduce((s, m) => m.id !== user.id && m.net > 0.005 ? s + m.net : s, 0) || 0
  const settlementDirectionByUser = (balances?.settlements || []).reduce((acc, s) => {
    const fromId = s.from?.id
    const toId = s.to?.id
    const fromName = s.from?.displayName || s.from?.username || 'Member'
    const toName = s.to?.displayName || s.to?.username || 'Member'

    if (fromId && toId) {
      if (!acc[fromId]) acc[fromId] = { payTo: new Set(), receiveFrom: new Set(), selfName: fromName }
      if (!acc[toId]) acc[toId] = { payTo: new Set(), receiveFrom: new Set(), selfName: toName }

      acc[fromId].payTo.add(toName)
      acc[toId].receiveFrom.add(fromName)
    }

    return acc
  }, {})

  const nonZeroOptimizationMembers = (balances?.members || []).filter((m) => Math.abs(Number(m.net || 0)) > 0.005)

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-100 font-sans">
      
      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-slate-900 overflow-hidden">
        <Sidebar 
          user={user} 
          groups={groups} 
          activeGroupId={activeGroupId} 
          setActiveGroupId={setActiveGroupId}
          loading={loading}
          setShowCreateGroup={setShowCreateGroup}
          setShowJoinGroup={setShowJoinGroup}
          onLogout={onLogout}
        />
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col h-full min-h-0 overflow-hidden relative">

        {/* Top header bar */}
        <header className="flex flex-col gap-3 bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Mobile Hamburger */}
              <div className="md:hidden flex-shrink-0">
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <button className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <Menu className="w-6 h-6" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[85%] max-w-[320px] p-0 border-r-0">
                    <Sidebar 
                      user={user} 
                      groups={groups} 
                      activeGroupId={activeGroupId} 
                      setActiveGroupId={(id) => { setActiveGroupId(id); setSheetOpen(false); }}
                      loading={loading}
                      setShowCreateGroup={(v) => { setShowCreateGroup(v); setSheetOpen(false); }}
                      setShowJoinGroup={(v) => { setShowJoinGroup(v); setSheetOpen(false); }}
                      onLogout={onLogout}
                    />
                  </SheetContent>
                </Sheet>
              </div>

              <div className="min-w-0">
                <h1 className="text-xl md:text-xl font-extrabold text-slate-900 truncate tracking-tight">
                  {activeTab === 'profile'
                    ? 'My Profile'
                    : activeGroup
                      ? activeGroup.name
                      : <span className="flex items-center gap-2">Hello, {(user.displayName || user.username || 'User').split(' ')[0]} <Hand className="w-5 h-5 text-amber-500" /></span>}
                </h1>
                {activeTab !== 'profile' && activeGroup && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600 uppercase tracking-widest">{activeGroup.currency}</span>
                    <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Actions for active group */}
            {activeTab !== 'profile' && activeGroup && (
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setShowExpense(true)}
                  className="hidden sm:flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 min-h-[44px] text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Expense
                </button>
                {/* On mobile, show icon only or smaller button for add expense, and settle up */}
                <button onClick={() => setShowExpense(true)}
                  className="sm:hidden flex items-center justify-center rounded-xl bg-slate-900 w-11 h-11 text-white hover:bg-slate-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1">
                  <Plus className="w-5 h-5" />
                </button>
                <button onClick={() => setShowSettle(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 md:px-4 min-h-[44px] text-sm font-bold text-white hover:bg-emerald-600 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1">
                  <Banknote className="w-4 h-4 hidden sm:block" /> Settle Up
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Tabs (Mobile & Desktop) */}
          {activeGroup && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 border-b border-transparent">
              {['expenses', 'balances', 'members', 'profile'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-semibold capitalize whitespace-nowrap transition-all rounded-full min-h-[40px]
                    ${activeTab === tab
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                  {tab}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Stat cards */}
        {activeGroup && activeTab !== 'profile' && (
          <div className="grid grid-cols-3 gap-2 md:gap-4 px-4 md:px-6 py-4 flex-shrink-0 bg-slate-50 md:bg-white border-b border-slate-200">
            <div className="rounded-2xl bg-white md:bg-rose-50 border border-slate-200 md:border-rose-100 p-3 md:p-4 shadow-sm md:shadow-none">
              <p className="text-[10px] md:text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">To Pay</p>
              <p className="text-lg md:text-2xl font-extrabold text-rose-600 truncate">{fmt(Math.max(0, -myNet))}</p>
            </div>
            <div className="rounded-2xl bg-white md:bg-emerald-50 border border-slate-200 md:border-emerald-100 p-3 md:p-4 shadow-sm md:shadow-none">
              <p className="text-[10px] md:text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">To Receive</p>
              <p className="text-lg md:text-2xl font-extrabold text-emerald-600 truncate">{fmt(Math.max(0, myNet))}</p>
            </div>
            <div className="rounded-2xl bg-white md:bg-slate-50 border border-slate-200 p-3 md:p-4 shadow-sm md:shadow-none">
              <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Net</p>
              <p className={`text-lg md:text-2xl font-extrabold truncate ${myNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(myNet)}</p>
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          )}

          {!activeGroup && !loading && activeTab !== 'profile' && (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 max-w-sm mx-auto">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
                <Banknote className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 mb-3 tracking-tight">Welcome to Nexora</h2>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">Create a group or join one using an invite link to start splitting expenses effortlessly.</p>
              <div className="flex flex-col sm:flex-row w-full gap-3">
                <button onClick={() => setShowCreateGroup(true)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 min-h-[48px] px-5 text-sm font-bold text-white hover:bg-emerald-600 transition-all shadow-sm">
                  <Plus className="w-4 h-4" /> Create Group
                </button>
                <button onClick={() => setShowJoinGroup(true)}
                  className="flex-1 flex items-center justify-center rounded-xl border border-slate-300 bg-white min-h-[48px] px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
                  Join via Link
                </button>
              </div>
            </div>
          )}

          {!loading && activeGroup && (
            <div className="px-4 md:px-6 py-4 md:py-5 max-w-4xl mx-auto w-full">

              {/* EXPENSES tab */}
              {activeTab === 'expenses' && (
                <div className="space-y-3">
                  {expenses.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                        <Package className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-bold text-slate-700 text-lg">No expenses yet</p>
                      <p className="text-sm text-slate-500 mt-1">Add your first expense to start tracking.</p>
                      <button onClick={() => setShowExpense(true)}
                        className="mt-6 flex items-center gap-2 rounded-xl bg-slate-900 px-6 min-h-[44px] text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition-all">
                        <Plus className="w-4 h-4" /> Add Expense
                      </button>
                    </div>
                  )}
                  {expenses.map((exp) => {
                    const paidByMe = exp.paidBy === user.id
                    const share = Number(exp.your_share) || 0
                    const youOweAmt = paidByMe ? -(exp.amount - share) : share
                    return (
                      <article key={exp.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-md transition-all shadow-sm group">
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
                            {CATEGORY_ICONS[exp.category] || <Package className="w-6 h-6 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate text-sm md:text-base">{exp.description || exp.title || 'Expense'}</p>
                            <p className="text-[11px] md:text-xs text-slate-500 mt-1 truncate">
                              Paid by <span className="font-semibold text-slate-700">{exp.paidByUser?.displayName || exp.paidByUser?.username || 'Someone'}</span>
                              {paidByMe ? ' (you)' : ''}
                            </p>
                            <p className="text-[11px] md:text-xs text-slate-400 mt-0.5">
                              {new Date(exp.expenseDate || exp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              &nbsp;· <span className="capitalize">{exp.splitType} split</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-sm md:text-lg font-extrabold text-slate-900">{fmt(exp.amount)}</p>
                          <p className={`text-[11px] md:text-xs font-bold mt-1 ${youOweAmt > 0.005 ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md inline-block' : youOweAmt < -0.005 ? 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md inline-block' : 'text-slate-400'}`}>
                            {youOweAmt > 0.005
                              ? `You owe ${fmt(youOweAmt)}`
                              : youOweAmt < -0.005
                                ? `Owed ${fmt(Math.abs(youOweAmt))}`
                                : 'Settled'}
                          </p>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {/* BALANCES tab */}
              {activeTab === 'balances' && (
                <div className="space-y-6">
                  {balances && (
                    <>
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Group Balances</h3>
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                          {balances.members.map((m) => (
                            <article key={m.id} className={`rounded-2xl border p-4 bg-white shadow-sm transition-all hover:shadow-md ${m.net > 0.005 ? 'border-emerald-100 hover:border-emerald-200' : m.net < -0.005 ? 'border-rose-100 hover:border-rose-200' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0
                                  ${m.net > 0.005 ? 'bg-emerald-100 text-emerald-700' : m.net < -0.005 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {(m.displayName || m.username || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">{m.displayName || m.username}{m.id === user.id ? ' (you)' : ''}</p>
                                  <p className={`text-xs font-semibold mt-0.5 truncate ${m.net > 0.005 ? 'text-emerald-600' : m.net < -0.005 ? 'text-rose-600' : 'text-slate-500'}`}>
                                    {m.net > 0.005 ? `Gets back ${fmt(m.net)}` : m.net < -0.005 ? `Owes ${fmt(Math.abs(m.net))}` : 'Settled up'}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>

                      {balances.settlements.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Suggested Repayments</h3>
                          <div className="space-y-2">
                            {nonZeroOptimizationMembers.map((m) => {
                              const selfName = m.displayName || m.username || 'Member'
                              const direction = settlementDirectionByUser[m.id]
                              const payTargets = direction ? [...direction.payTo] : []
                              const receiveSources = direction ? [...direction.receiveFrom] : []

                              if (m.net < -0.005 && payTargets.length > 0) {
                                return (
                                  <div key={`opt-${m.id}-pay`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <p className="text-sm text-slate-700 flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-slate-900">{selfName}</span>
                                      <span className="text-rose-500 text-xs font-bold bg-rose-50 px-2 py-0.5 rounded-md">owes</span>
                                      <span className="font-bold text-slate-900">{payTargets.join(', ')}</span>
                                    </p>
                                  </div>
                                )
                              }

                              if (m.net > 0.005 && receiveSources.length > 0) {
                                return (
                                  <div key={`opt-${m.id}-receive`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <p className="text-sm text-slate-700 flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-slate-900">{selfName}</span>
                                      <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded-md">receives from</span>
                                      <span className="font-bold text-slate-900">{receiveSources.join(', ')}</span>
                                    </p>
                                  </div>
                                )
                              }

                              return null
                            })}
                          </div>
                        </div>
                      )}

                      {balances.settlements.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                            <PartyPopper className="w-8 h-8 text-emerald-500" />
                          </div>
                          <p className="font-bold text-slate-900 text-lg">All settled up!</p>
                          <p className="text-sm text-slate-500 mt-1">No repayments are needed right now.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* MEMBERS tab */}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Invite Link</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input readOnly value={`${window.location.origin}/invite/${activeGroup?.id || ''}`}
                        className="flex-1 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
                      <button onClick={() => {
                        navigator.clipboard?.writeText(`${window.location.origin}/invite/${activeGroup?.id || ''}`)
                        showToast('Invite link copied!')
                      }} className="rounded-xl bg-slate-900 px-6 min-h-[44px] text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap">
                        Copy Link
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-4 md:px-5 pt-5 pb-2">Group Members</p>
                    <div className="divide-y divide-slate-100">
                      {members.map((m) => (
                        <article key={m.id} className="flex items-center justify-between p-4 md:p-5 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0 border border-emerald-100">
                              {(m.displayName || m.username || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm md:text-base">
                                {m.displayName || m.username}
                                {m.id === user.id && <span className="text-slate-400 font-normal ml-1">(you)</span>}
                              </p>
                              {m.upiId && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><span>UPI:</span> <span className="font-medium text-slate-700">{m.upiId}</span></p>}
                            </div>
                          </div>
                          <span className={`text-[10px] md:text-xs rounded-full px-2.5 md:px-3 py-1 font-bold tracking-wide uppercase
                            ${m.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {m.role}
                          </span>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE tab */}
              {activeTab === 'profile' && (
                <div className="max-w-xl mx-auto pb-8">
                  <ProfileTab token={token} user={user} showToast={showToast} />
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreateGroup && (
        <CreateGroupModal token={token} onClose={() => setShowCreateGroup(false)}
          onCreated={(g) => {
            setGroups((prev) => [{ ...g, memberCount: 1 }, ...prev])
            setActiveGroupId(g.id)
            setShowCreateGroup(false)
            showToast('Group created!')
          }} />
      )}

      {showJoinGroup && (
        <JoinGroupModal token={token} user={user} onClose={() => setShowJoinGroup(false)}
          onJoined={(g) => {
            setGroups((prev) => {
              const exists = prev.find(x => x.id === g.id)
              if (exists) return prev
              return [{ ...g, memberCount: (g.memberCount || 1) }, ...prev]
            })
            setActiveGroupId(g.id)
            setShowJoinGroup(false)
            showToast('Joined group successfully!')
          }} />
      )}

      {showExpense && activeGroup && (
        <AddExpenseModal
          token={token} group={activeGroup} members={members} currentUser={user}
          onClose={() => setShowExpense(false)}
          onAdded={() => {
            setShowExpense(false)
            refreshExpenses()
            showToast('Expense added!')
          }} />
      )}

      {showSettle && activeGroup && (
        <SettleUpModal
          token={token} group={activeGroup}
          simplifiedDebts={balances?.settlements || []}
          members={members} currentUser={user}
          onClose={() => setShowSettle(false)}
          onSettled={() => { refreshExpenses(); showToast('Settlement recorded!') }} />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
