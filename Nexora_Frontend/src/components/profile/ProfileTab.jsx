import React, { useState } from 'react'
import { api } from '../../api/apiClient'

export default function ProfileTab({ token, user, showToast }) {
  const [form, setForm]     = useState({
    name: user.displayName || user.username || '',
    upi_id: user.upiId || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/v1/users/me', { method: 'PUT', body: { displayName: form.name, upiId: form.upi_id }, token })
      showToast('Profile updated!')
    } catch {
      showToast('Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-md">
      <div className="mb-2">
        <p className="font-bold text-slate-900 text-lg">{user.email}</p>
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Display Name</label>
        <input value={form.name} onChange={set('name')}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">UPI ID</label>
        <input value={form.upi_id} onChange={set('upi_id')} placeholder="yourname@upi"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </div>

      <button type="submit" disabled={saving}
        className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
        {saving ? 'Saving…' : 'Update Profile'}
      </button>
    </form>
  )
}
