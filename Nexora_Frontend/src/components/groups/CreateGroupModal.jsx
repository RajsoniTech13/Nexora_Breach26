import React, { useState } from 'react'
import Modal from '../common/Modal'
import { api } from '../../api/apiClient'

export default function CreateGroupModal({ token, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', currency: 'INR', cover_url: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Group name is required'); return }
    setLoading(true)
    try {
      const data = await api('/api/v1/groups', { method: 'POST', body: form, token })
      onCreated(data.group)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Create New Group" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Group Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Goa Trip 2026"
            className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={2} placeholder="What is this group for?"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Currency</label>
            <select value={form.currency} onChange={set('currency')}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none bg-white">
              {['INR', 'USD', 'EUR', 'GBP', 'SGD'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

        </div>
        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={loading} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
