import React, { useState } from 'react'
import Modal from '../common/Modal'
import { api } from '../../api/apiClient'

export default function JoinGroupModal({ token, user, onClose, onJoined }) {
  const [form, setForm] = useState({ link: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.link.trim()) { setError('Invite link is required'); return }
    
    // Extract ID from the link (e.g. https://breach.app/invite/1 -> 1)
    const parts = form.link.trim().split('/')
    let groupId = parts[parts.length - 1]
    if (groupId === '') groupId = parts[parts.length - 2]
    if (!groupId) { setError('Invalid link format'); return }

    setLoading(true)
    setError('')
    try {
      await api(`/api/v1/groups/${groupId}/members/join`, { method: 'POST', token })
      const data = await api(`/api/v1/groups/${groupId}`, { token })
      onJoined(data.group)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Join Group" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Invite Link *</label>
          <input value={form.link} onChange={set('link')} placeholder="Paste link e.g. https://breach.app/invite/1"
            className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" />
        </div>
        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={loading} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
            {loading ? 'Joining…' : 'Join Group'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
