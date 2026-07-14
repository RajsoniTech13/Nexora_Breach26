import React, { useState } from 'react'
import Modal from '../common/Modal'
import { api } from '../../api/apiClient'
import { fmt } from '../../utils/formatters'
import { PartyPopper } from 'lucide-react'

export default function SettleUpModal({ token, group, simplifiedDebts = [], members, currentUser, onClose, onSettled }) {
  const [marking, setMarking]       = useState(null)
  const [error, setError]           = useState('')
  const [qrTarget, setQrTarget]     = useState(null) // { upiLink, name, amount, upi, s }
  const [upiConfirm, setUpiConfirm] = useState(null) // debt s – "did you pay?"

  const mine       = simplifiedDebts.filter((s) => s.from?.id === currentUser.id)
  const fromOthers = simplifiedDebts.filter((s) => s.to?.id === currentUser.id)
  const isMobile   = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // Step 1: Create pending settlement record → returns settlement id
  async function createSettlement(s, method) {
    const data = await api(`/api/v1/groups/${group.id}/settlements`, {
      method: 'POST',
      body: { toUser: s.to?.id, amount: s.amount, currency: group.currency || 'INR', paymentMethod: method },
      token,
    })
    return data.settlement?.id
  }

  // Step 2: Mark settlement as completed (writes to ledger)
  async function completeCash(settlementId) {
    await api(`/api/v1/groups/${group.id}/payments/mark-cash`, {
      method: 'POST',
      body: { settlementId },
      token,
    })
  }

  // Full cash/upi settle: create + complete
  async function settle(s, method) {
    const key = `${s.from?.id}-${s.to?.id}`
    setMarking(key)
    setError('')
    try {
      const settlementId = await createSettlement(s, method)
      await completeCash(settlementId)
      onSettled()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking(null)
    }
  }

  // UPI: mobile → deep link + confirm dialog; desktop → QR
  function payViaUpi(s) {
    const upi = s.to?.upiId
    if (!upi) { setError('Recipient has no UPI ID linked.'); return }
    const name     = encodeURIComponent(s.to?.displayName || s.to?.username || 'Payee')
    const amt      = s.amount.toFixed(2)
    const note     = encodeURIComponent(`Nexora - ${group.name}`)
    const deepLink = `upi://pay?pa=${upi}&pn=${name}&am=${amt}&cu=INR&tn=${note}`
    if (isMobile) {
      window.location.href = deepLink
      setUpiConfirm(s)
    } else {
      setQrTarget({ upiLink: deepLink, name: s.to?.displayName || s.to?.username, amount: s.amount, upi, s })
    }
  }

  // Card: create settlement first then redirect to Stripe Checkout
  async function payViaCard(s) {
    const key = `${s.from?.id}-${s.to?.id}`
    setMarking(key)
    setError('')
    try {
      const settlementId = await createSettlement(s, 'card')
      const data = await api(`/api/v1/groups/${group.id}/payments/checkout-session`, {
        method: 'POST',
        body: { settlementId },
        token,
      })
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Card checkout unavailable. Try another payment method.')
      setMarking(null)
    }
  }

  function buildQr(s) {
    const upi = s.to?.upiId
    if (!upi) { setError('Recipient has no UPI ID linked.'); return }
    const name     = encodeURIComponent(s.to?.displayName || s.to?.username || 'Payee')
    const amt      = s.amount.toFixed(2)
    const note     = encodeURIComponent(`Nexora - ${group.name}`)
    const deepLink = `upi://pay?pa=${upi}&pn=${name}&am=${amt}&cu=INR&tn=${note}`
    setQrTarget({ upiLink: deepLink, name: s.to?.displayName || s.to?.username, amount: s.amount, upi, s })
  }

  // ── QR overlay ────────────────────────────────────────────────────────────
  if (qrTarget) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrTarget.upiLink)}&size=220x220&margin=10`
    return (
      <Modal title="Scan to Pay" onClose={() => setQrTarget(null)}>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-slate-600">Pay <span className="font-bold">{qrTarget.name}</span></p>
          <p className="text-2xl font-extrabold text-slate-900">{fmt(qrTarget.amount)}</p>
          <div className="rounded-2xl border border-slate-200 p-3 bg-white">
            <img src={qrUrl} alt="UPI QR Code" className="w-56 h-56" />
          </div>
          <p className="text-xs text-slate-500">UPI: <span className="font-mono">{qrTarget.upi}</span></p>
          <p className="text-xs text-slate-400">Open any UPI app and scan this code</p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-3 w-full">
            <button onClick={() => setQrTarget(null)}
              className="flex-1 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              disabled={!!marking}
              onClick={async () => {
                const s = qrTarget.s
                setQrTarget(null)
                await settle(s, 'upi')
              }}
              className="flex-1 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
              ✓ I've Paid
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── UPI confirm overlay (mobile – after deep link) ─────────────────────────
  if (upiConfirm) {
    return (
      <Modal title="Confirm Payment" onClose={() => setUpiConfirm(null)}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="text-5xl">📲</div>
          <p className="font-semibold text-slate-800">Did you complete the UPI payment?</p>
          <p className="text-sm text-slate-500">
            Pay <span className="font-bold">{upiConfirm.to?.displayName || upiConfirm.to?.username}</span> · {fmt(upiConfirm.amount)}
          </p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-3 w-full">
            <button onClick={() => setUpiConfirm(null)}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">
              Not Yet
            </button>
            <button
              disabled={!!marking}
              onClick={async () => {
                const s = upiConfirm
                setUpiConfirm(null)
                await settle(s, 'upi')
              }}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
              ✓ Yes, Paid!
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── Main modal ─────────────────────────────────────────────────────────────
  return (
    <Modal title="Settle Up" onClose={onClose}>
      <div className="space-y-5">

        {/* ── Debts you owe ── */}
        {mine.length > 0 && (
          <section>
            <p className="text-sm font-bold text-slate-700 mb-3">You owe</p>
            <div className="space-y-4">
              {mine.map((s) => {
                const key    = `${s.from?.id}-${s.to?.id}`
                const isBusy = marking === key
                return (
                  <div key={key} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">Pay {s.to?.displayName || s.to?.username}</p>
                        {s.to?.upiId
                          ? <p className="text-xs text-slate-500">UPI: {s.to.upiId}</p>
                          : <p className="text-xs text-rose-400">No UPI linked — use cash or card</p>}
                      </div>
                      <span className="text-xl font-extrabold text-rose-600">{fmt(s.amount)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => payViaUpi(s)} disabled={isBusy || !s.to?.upiId}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
                        📲 Pay via UPI
                      </button>
                      <button onClick={() => settle(s, 'cash')} disabled={isBusy}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                        {isBusy ? '…' : '💵 Mark as Cash'}
                      </button>
                      <button onClick={() => payViaCard(s)} disabled={isBusy}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                        {isBusy ? '…' : '💳 Card Checkout'}
                      </button>
                      <button onClick={() => buildQr(s)} disabled={!s.to?.upiId}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                        📷 Show QR Code
                      </button>
                    </div>
                    {isBusy && <p className="text-xs text-slate-400 mt-2 text-center">Processing…</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Amounts owed to you ── */}
        {fromOthers.length > 0 && (
          <section>
            <p className="text-sm font-bold text-slate-700 mb-3">Owed to you</p>
            <div className="space-y-2">
              {fromOthers.map((s) => {
                const key = `${s.from?.id}-${s.to?.id}`
                return (
                  <div key={key} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{s.from?.displayName || s.from?.username} owes you</p>
                        {s.from?.upiId
                          ? <p className="text-xs text-slate-500">Their UPI: {s.from.upiId}</p>
                          : <p className="text-xs text-slate-400">No UPI linked</p>}
                      </div>
                      <span className="text-lg font-bold text-emerald-600">{fmt(s.amount)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      They need to initiate payment from their account.
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {mine.length === 0 && fromOthers.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <PartyPopper className="w-12 h-12 text-emerald-500 mb-3" />
            <p className="font-bold text-slate-800">All settled up!</p>
            <p className="text-sm text-slate-500 mt-1">No pending settlements in this group.</p>
          </div>
        )}

        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</p>}
      </div>
    </Modal>
  )
}
