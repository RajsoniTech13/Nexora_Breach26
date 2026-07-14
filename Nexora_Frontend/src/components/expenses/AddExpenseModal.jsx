import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Modal from '../common/Modal'
import Avatar from '../common/Avatar'
import { api, apiUploadBinary } from '../../api/apiClient'
import { fmt } from '../../utils/formatters'
import { CATEGORY_ICONS } from '../../utils/constants'
import { Scale, Percent, PenLine } from 'lucide-react'
export default function AddExpenseModal({ token, group, members, currentUser, onClose, onAdded }) {
  const [step, setStep]                 = useState(1)
  const [entryMode, setEntryMode]       = useState('original') // original | image
  const [splitScope, setSplitScope]     = useState('overall') // overall | itemwise
  const [splitMethod, setSplitMethod]   = useState('equal')
  const [participants, setParticipants] = useState(members.map((m) => m.id))
  const [pctMap, setPctMap]             = useState(() => {
    const n = members.length || 1
    const base = +(100 / n).toFixed(2)
    return Object.fromEntries(members.map((m, i) => [m.id, i === 0 ? +(100 - base * (n - 1)).toFixed(2) : base]))
  })
  const [customMap, setCustomMap]       = useState(Object.fromEntries(members.map((m) => [m.id, 0])))
  const [form, setForm]                 = useState({
    amount: '', title: '', category: 'Food', date: new Date().toISOString().slice(0, 10),
    paid_by: currentUser.id,
  })
  const [receiptFile, setReceiptFile]   = useState(null)
  const [isScanning, setIsScanning]     = useState(false)
  const [scannedReceipt, setScannedReceipt] = useState(null)
  const [itemAssignments, setItemAssignments] = useState([])
  const [voiceInput, setVoiceInput] = useState('')
  const [isVoiceParsing, setIsVoiceParsing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const recognitionRef = useRef(null)
  const latestTranscriptRef = useRef('')

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))
  const totalAmount = Number(form.amount) || 0

  // ── Split preview calculations ──────────────────────────────────────────
  const equalShare = participants.length > 0 ? totalAmount / participants.length : 0

  const totalPct = useMemo(
    () => participants.reduce((s, id) => s + Number(pctMap[id] || 0), 0),
    [participants, pctMap],
  )
  const pctPreview = useCallback(
    (id) => totalAmount * (Number(pctMap[id] || 0) / 100),
    [totalAmount, pctMap],
  )

  const totalCustom = useMemo(
    () => participants.reduce((s, id) => s + Number(customMap[id] || 0), 0),
    [participants, customMap],
  )

  const participantMembers = useMemo(
    () => members.filter((m) => participants.includes(m.id)),
    [members, participants],
  )

  const itemWiseTotal = useMemo(
    () => itemAssignments.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0),
    [itemAssignments],
  )

  const hasItemWiseValidationError = useMemo(
    () => itemAssignments.some((item) => !item.owedTo || !item.owedBy || item.owedBy.length === 0),
    [itemAssignments],
  )

  const speechSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  function mapNlpCategory(rawCategory) {
    const normalized = String(rawCategory || '').toLowerCase()
    if (normalized === 'food') return 'Food'
    if (normalized === 'travel') return 'Travel'
    if (normalized === 'household') return 'Utilities'
    if (normalized === 'entertainment') return 'Entertainment'
    if (normalized === 'rent') return 'Stay'
    return 'General'
  }

  function applyParsedExpense(parsed) {
    if (!parsed || typeof parsed !== 'object') return

    const splitType = ['equal', 'percentage', 'custom'].includes(parsed.split_type)
      ? parsed.split_type
      : 'equal'

    const parsedSplits = Array.isArray(parsed.splits) ? parsed.splits : []
    const splitParticipants = Array.from(
      new Set(parsedSplits.map((s) => s.user_id).filter((id) => members.some((m) => m.id === id)))
    )
    const nextParticipants = splitParticipants.length > 0 ? splitParticipants : members.map((m) => m.id)

    const paidBy = members.some((m) => m.id === parsed.paid_by)
      ? parsed.paid_by
      : currentUser.id

    setForm((prev) => ({
      ...prev,
      title: parsed.description || prev.title,
      amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? String(parsed.amount) : prev.amount,
      category: mapNlpCategory(parsed.category),
      paid_by: paidBy,
    }))

    setParticipants(nextParticipants)
    setSplitScope('overall')
    setSplitMethod(splitType)

    if (splitType === 'percentage') {
      const nextPct = Object.fromEntries(nextParticipants.map((id) => [id, 0]))
      parsedSplits.forEach((s) => {
        if (nextPct[s.user_id] !== undefined) nextPct[s.user_id] = Number(s.percentage || 0)
      })
      setPctMap((prev) => ({ ...prev, ...nextPct }))
    }

    if (splitType === 'custom') {
      const nextCustom = Object.fromEntries(nextParticipants.map((id) => [id, 0]))
      parsedSplits.forEach((s) => {
        if (nextCustom[s.user_id] !== undefined) nextCustom[s.user_id] = Number(s.amount || 0)
      })
      setCustomMap((prev) => ({ ...prev, ...nextCustom }))
    }
  }

  async function parseExpenseFromText(text) {
    const input = String(text || '').trim()
    if (!input) {
      setError('Please enter expense details in text or use the mic first')
      return
    }

    setIsVoiceParsing(true)
    setError('')
    try {
      const result = await api(`/api/v1/groups/${group.id}/nlp/parse`, {
        method: 'POST',
        body: { text: input },
        token,
      })
      const parsed = result?.data || result
      applyParsedExpense(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse text'
      setError(message)
    } finally {
      setIsVoiceParsing(false)
    }
  }

  async function parseVoiceInput() {
    await parseExpenseFromText(voiceInput)
  }

  function startVoiceCapture() {
    if (!speechSupported || isListening) return

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!RecognitionCtor) {
      setError('Voice input is not supported in this browser')
      return
    }

    setError('')
    const recognition = new RecognitionCtor()
    recognition.lang = 'en-IN'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript
      }
      const cleaned = transcript.trim()
      latestTranscriptRef.current = cleaned
      setVoiceInput(cleaned)
    }

    recognition.onerror = () => {
      setError('Voice capture failed. Please try again.')
    }

    recognition.onend = async () => {
      setIsListening(false)
      recognitionRef.current = null
      const transcript = latestTranscriptRef.current.trim()
      if (transcript.length > 0) {
        await parseExpenseFromText(transcript)
      }
    }

    recognitionRef.current = recognition
    latestTranscriptRef.current = ''
    setIsListening(true)
    recognition.start()
  }

  function stopVoiceCapture() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  function inferCategory(parsed) {
    const source = `${parsed?.merchant || ''} ${(parsed?.items || []).map((i) => i.name || '').join(' ')}`.toLowerCase()
    if (/(uber|ola|taxi|metro|bus|fuel|petrol|diesel|airport)/.test(source)) return 'Transport'
    if (/(hotel|hostel|resort|stay|room)/.test(source)) return 'Stay'
    if (/(movie|cinema|netflix|games|bowling|party)/.test(source)) return 'Entertainment'
    if (/(wifi|electric|water|gas|bill)/.test(source)) return 'Utilities'
    if (/(laptop|phone|charger|electronics|tech)/.test(source)) return 'Tech'
    if (/(flight|train|trip|travel)/.test(source)) return 'Travel'
    return 'Food'
  }

  function normalizeReceiptItems(items = [], defaultPaidBy) {
    return (items || []).map((item, index) => {
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1
      const unitPrice = Number(item.price) > 0 ? Number(item.price) : 0
      const totalPrice = Number(item.totalPrice) > 0
        ? Number(item.totalPrice)
        : Number((quantity * unitPrice).toFixed(2))
      const defaultDebtor = participants.includes(defaultPaidBy) ? defaultPaidBy : (participants[0] || '')

      return {
        id: `${index}-${item.name || 'item'}`,
        name: item.name || `Item ${index + 1}`,
        quantity,
        price: unitPrice,
        totalPrice,
        owedBy: defaultDebtor ? [defaultDebtor] : [],
        owedTo: defaultPaidBy,
      }
    })
  }

  function changeItemPayer(itemId, userId) {
    setItemAssignments((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, owedBy: userId ? [userId] : [] } : item
    )))
  }

  function changeItemReceiver(itemId, userId) {
    setItemAssignments((prev) => prev.map((item) => (item.id === itemId ? { ...item, owedTo: userId } : item)))
  }

  async function scanReceiptImage() {
    if (!receiptFile) {
      setError('Please choose a bill image first')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (!allowedTypes.includes(receiptFile.type)) {
      setError('Only JPEG, PNG, WebP, and HEIC images are supported')
      return
    }

    setIsScanning(true)
    setError('')
    try {
      const result = await apiUploadBinary('/api/v1/receipts/scan', { file: receiptFile, token })
      const parsed = result?.data || result
      if (!parsed || typeof parsed.total !== 'number') {
        throw new Error('Could not parse bill details from this image')
      }

      setScannedReceipt(parsed)

      const nextDate = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : new Date().toISOString().slice(0, 10)

      setForm((prev) => ({
        ...prev,
        title: parsed.merchant || prev.title || 'Receipt expense',
        amount: String(parsed.total || prev.amount || ''),
        date: nextDate,
        category: inferCategory(parsed),
      }))

      const normalized = normalizeReceiptItems(parsed.items || [], form.paid_by)
      setItemAssignments(normalized)
      if (normalized.length > 0) {
        setSplitScope('itemwise')
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err || '')
      const normalizedMessage = rawMessage.toLowerCase()
      const invalidImageSignals = [
        'could not extract a valid total amount',
        'could not parse bill details',
        'blocked by safety filters',
      ]

      if (invalidImageSignals.some((signal) => normalizedMessage.includes(signal))) {
        setError('invalid image')
      } else {
        setError(rawMessage || 'Request failed')
      }
    } finally {
      setIsScanning(false)
    }
  }

  function handleMethodChange(m) {
    setSplitMethod(m)
    setError('')
    if (m === 'percentage') {
      const n = participants.length || 1
      const base = +(100 / n).toFixed(2)
      const newMap = Object.fromEntries(
        participants.map((id, i) => [id, i === 0 ? +(100 - base * (n - 1)).toFixed(2) : base])
      )
      setPctMap((prev) => ({ ...prev, ...newMap }))
    }
    if (m === 'custom') {
      setCustomMap((prev) => {
        const next = { ...prev }
        participants.forEach((id) => { next[id] = 0 })
        return next
      })
    }
  }

  function handleParticipantsChange(userId, checked) {
    setParticipants((prev) => {
      if (checked) {
        if (prev.includes(userId)) return prev
        return [...prev, userId]
      }
      return prev.filter((id) => id !== userId)
    })

    if (splitScope === 'itemwise') {
      setItemAssignments((prev) => prev.map((item) => {
        if (checked) return item
        return {
          ...item,
          owedBy: item.owedBy.filter((id) => id !== userId),
        }
      }))
    }
  }

  useEffect(() => {
    setItemAssignments((prev) => prev.map((item) => {
      const filteredOwedBy = item.owedBy.filter((id) => participants.includes(id))
      const nextOwedBy = filteredOwedBy.length > 0 ? filteredOwedBy : (participants[0] ? [participants[0]] : [])
      const nextOwedTo = participants.includes(item.owedTo) ? item.owedTo : (participants[0] || '')
      return { ...item, owedBy: nextOwedBy, owedTo: nextOwedTo }
    }))
  }, [participants])

  function canSubmit() {
    if (!form.title.trim()) return false
    if (participants.length === 0) return false
    if (splitScope === 'itemwise') {
      if (itemAssignments.length === 0) return false
      if (hasItemWiseValidationError) return false
      return true
    }
    if (!form.amount || totalAmount <= 0) return false
    if (splitMethod === 'percentage' && Math.abs(totalPct - 100) > 0.01) return false
    if (splitMethod === 'custom' && Math.abs(totalCustom - totalAmount) > 0.01) return false
    return true
  }

  function calculateItemWiseExpensePayloads() {
    const byReceiver = new Map()

    itemAssignments.forEach((item) => {
      const receiverId = item.owedTo
      const debtors = item.owedBy || []
      if (!receiverId || debtors.length === 0) return

      const itemPaisa = Math.round((Number(item.totalPrice) || 0) * 100)
      if (itemPaisa <= 0) return

      const base = Math.floor(itemPaisa / debtors.length)
      const remainder = itemPaisa - base * debtors.length

      if (!byReceiver.has(receiverId)) {
        byReceiver.set(receiverId, {
          totalPaisa: 0,
          userPaisa: new Map(),
          itemNames: [],
        })
      }

      const bucket = byReceiver.get(receiverId)
      bucket.totalPaisa += itemPaisa
      bucket.itemNames.push(item.name)

      debtors.forEach((userId, index) => {
        const share = base + (index < remainder ? 1 : 0)
        bucket.userPaisa.set(userId, (bucket.userPaisa.get(userId) || 0) + share)
      })
    })

    const receiverEntries = [...byReceiver.entries()]

    return receiverEntries.map(([receiverId, bucket]) => {
      const receiver = members.find((m) => m.id === receiverId)
      const receiverLabel = receiver?.displayName || receiver?.username || 'Member'
      const description = receiverEntries.length > 1
        ? `${form.title} - ${receiverLabel}`
        : form.title

      const splits = [...bucket.userPaisa.entries()]
        .filter(([, paisa]) => paisa > 0)
        .map(([userId, paisa]) => ({ userId, owedAmount: Number((paisa / 100).toFixed(2)) }))

      return {
        description,
        amount: Number((bucket.totalPaisa / 100).toFixed(2)),
        currency: group.currency || 'INR',
        category: form.category,
        expenseDate: form.date,
        paidBy: receiverId,
        splitType: 'custom',
        splits,
      }
    })
  }

  async function submit() {
    if (!canSubmit()) { setError('Please fix the errors before submitting'); return }
    setLoading(true)
    setError('')
    try {
      if (splitScope === 'itemwise') {
        const payloads = calculateItemWiseExpensePayloads()
        if (payloads.length === 0) {
          throw new Error('Could not build item-wise splits. Please check item assignments.')
        }

        let firstExpense = null
        for (const body of payloads) {
          const data = await api(`/api/v1/groups/${group.id}/expenses`, { method: 'POST', body, token })
          if (!firstExpense) firstExpense = data.expense
        }
        onAdded(firstExpense)
        return
      }

      let splits = []
      if (splitMethod === 'equal') {
        splits = participants.map((id) => ({ userId: id }))
      } else if (splitMethod === 'percentage') {
        splits = participants.map((id) => ({ userId: id, percentage: Number(pctMap[id] || 0) }))
      } else if (splitMethod === 'custom') {
        splits = participants
          .map((id) => ({ userId: id, owedAmount: Number(customMap[id] || 0) }))
          .filter((split) => Number.isFinite(split.owedAmount) && split.owedAmount > 0)
      }

      const body = {
        description: form.title,      
        amount: totalAmount,
        currency: group.currency || 'INR',
        category: form.category,
        expenseDate: form.date,       
        paidBy: form.paid_by,         
        splitType: splitMethod,       
        splits,
      }
      const data = await api(`/api/v1/groups/${group.id}/expenses`, { method: 'POST', body, token })
      onAdded(data.expense)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const stepLabels = ['Details', 'Participants', 'Split']

  return (
    <Modal title="Add Expense" onClose={onClose}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {stepLabels.map((label, idx) => {
          const s = idx + 1
          const active = step === s
          const done = step > s
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold flex-shrink-0
                ${done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {done ? '✓' : s}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
              {idx < stepLabels.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          )
        })}
      </div>

      {/* Step 1 – Expense details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Add Expense Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setEntryMode('original'); setSplitScope('overall'); setError('') }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${entryMode === 'original' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                Original
              </button>
              <button type="button" onClick={() => { setEntryMode('image'); setError('') }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${entryMode === 'image' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                Add Image
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Voice / Text Assistant</label>
            <p className="text-xs text-slate-600 mb-2">
              Type expense details or hold the mic and speak. We will parse and auto-fill amount, description, payer, and split.
            </p>
            <div className="flex gap-2 items-start">
              <textarea
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                placeholder="Example: I paid 1200 for dinner, split equally with kejrival and mamta"
                rows={3}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onMouseDown={startVoiceCapture}
                onMouseUp={stopVoiceCapture}
                onMouseLeave={stopVoiceCapture}
                onTouchStart={(e) => { e.preventDefault(); startVoiceCapture() }}
                onTouchEnd={(e) => { e.preventDefault(); stopVoiceCapture() }}
                disabled={!speechSupported}
                className={`rounded-xl px-3 py-2 text-sm font-bold text-white ${isListening ? 'bg-rose-600' : 'bg-slate-900'} disabled:opacity-40`}
              >
                {isListening ? 'Recording...' : 'Hold Mic'}
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={parseVoiceInput}
                disabled={isVoiceParsing || !voiceInput.trim()}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {isVoiceParsing ? 'Parsing…' : 'Use this text'}
              </button>
            </div>
            {!speechSupported && (
              <p className="mt-2 text-xs text-amber-700">Voice input is not supported in this browser. You can still type text.</p>
            )}
          </div>

          {entryMode === 'image' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600 mb-2">Upload bill image (JPEG, PNG, WebP, HEIC), then scan to auto-fill details.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                />
                <button
                  type="button"
                  onClick={scanReceiptImage}
                  disabled={!receiptFile || isScanning}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                >
                  {isScanning ? 'Scanning…' : 'Scan Bill'}
                </button>
              </div>
              {scannedReceipt && (
                <p className="mt-2 text-xs text-emerald-700">
                  Scanned: {scannedReceipt.merchant || 'Unknown merchant'} · Confidence {Math.round(Number(scannedReceipt.confidence || 0))}%
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Description *</label>
              <input value={form.title} onChange={set('title')} placeholder="e.g. Beach shack dinner"
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Amount (₹) *</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
              <select value={form.category} onChange={set('category')}
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none bg-white">
                {Object.keys(CATEGORY_ICONS).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
              <input type="date" value={form.date} onChange={set('date')}
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none bg-white" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Paid By</label>
              <select value={form.paid_by} onChange={set('paid_by')}
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none bg-white">
                {members.map((m) => <option key={m.id} value={m.id}>{m.displayName || m.username}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 – Participants */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500 mb-3">Select who is part of this expense.</p>
          {members.map((m, i) => {
            const checked = participants.includes(m.id)
            return (
              <label key={m.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors
                ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checked} className="h-4 w-4 accent-emerald-500"
                  onChange={(e) => {
                    handleParticipantsChange(m.id, e.target.checked)
                  }} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{m.displayName || m.username || m.email}</p>
                  {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
                </div>
                {m.id === currentUser.id && (
                  <span className="ml-auto text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">You</span>
                )}
              </label>
            )
          })}
          {participants.length === 0 && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">Select at least one participant.</p>
          )}
        </div>
      )}

      {/* Step 3 – Split method */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Split Options</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSplitScope('overall')}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${splitScope === 'overall' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                Overall Split
              </button>
              <button
                type="button"
                onClick={() => setSplitScope('itemwise')}
                disabled={itemAssignments.length === 0}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${splitScope === 'itemwise' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                Item-wise Split
              </button>
            </div>
            {itemAssignments.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">Scan a bill image in Step 1 to unlock item-wise split.</p>
            )}
          </div>

          {/* Method selector */}
          {splitScope === 'overall' && (
            <div className="flex gap-2">
            {['equal', 'percentage', 'custom'].map((m) => (
              <button key={m} onClick={() => handleMethodChange(m)}
                className={`flex-1 rounded-xl py-2 text-xs font-bold capitalize transition-colors
                  ${splitMethod === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {m === 'equal' ? <span className="flex items-center justify-center gap-1.5"><Scale className="w-3.5 h-3.5" /> Equal</span> : m === 'percentage' ? <span className="flex items-center justify-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Percent</span> : <span className="flex items-center justify-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> Custom</span>}
              </button>
            ))}
            </div>
          )}

          {splitScope === 'itemwise' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Item-wise total: <span className="font-bold">{fmt(itemWiseTotal)}</span>
              </div>
              {itemAssignments.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-600">
                      Qty {item.quantity} × {fmt(item.price)} = <span className="font-bold text-slate-800">{fmt(item.totalPrice)}</span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Whom to Pay ?</label>
                    <select
                      value={item.owedBy[0] || ''}
                      onChange={(e) => changeItemPayer(item.id, e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
                    >
                      {participantMembers.map((m) => (
                        <option key={`${item.id}-payer-${m.id}`} value={m.id}>{m.displayName || m.username}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Whom to receive</label>
                    <select
                      value={item.owedTo}
                      onChange={(e) => changeItemReceiver(item.id, e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none"
                    >
                      {participantMembers.map((m) => (
                        <option key={`${item.id}-receiver-${m.id}`} value={m.id}>{m.displayName || m.username}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {hasItemWiseValidationError && (
                <p className="text-xs text-rose-600">Each item must have at least one owing member and one receiver.</p>
              )}
            </div>
          )}

          {/* EQUAL split */}
          {splitScope === 'overall' && splitMethod === 'equal' && (
            <div className="space-y-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                <span className="font-semibold">{fmt(equalShare)}</span> each
                &nbsp;(Total {fmt(totalAmount)} ÷ {participants.length} people)
              </div>
              {participantMembers.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={m.displayName || m.username} size={7} colorIndex={i} />
                    <span className="text-sm font-semibold text-slate-800">{m.displayName || m.username}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{fmt(equalShare)}</span>
                </div>
              ))}
            </div>
          )}

          {/* PERCENTAGE split */}
          {splitScope === 'overall' && splitMethod === 'percentage' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Each participant's % of the total. Must add up to exactly 100%.
              </p>
              {participantMembers.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <Avatar name={m.displayName || m.username} size={7} colorIndex={i} />
                  <span className="text-sm font-semibold text-slate-800 flex-1">{m.displayName || m.username}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" step="0.01"
                      value={pctMap[m.id] ?? 0}
                      onChange={(e) => setPctMap((p) => ({ ...p, [m.id]: Number(e.target.value) }))}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right outline-none focus:border-emerald-400" />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                  <span className="w-20 text-right text-sm font-bold text-slate-700">{fmt(pctPreview(m.id))}</span>
                </div>
              ))}
              <div className={`flex justify-between rounded-xl px-4 py-2.5 text-sm font-bold
                ${Math.abs(totalPct - 100) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <span>Total percentage</span>
                <span>{totalPct.toFixed(2)}%</span>
              </div>
              {Math.abs(totalPct - 100) > 0.01 && (
                <p className="text-xs text-rose-600">
                  {totalPct < 100
                    ? `Remaining ${(100 - totalPct).toFixed(2)}% unassigned`
                    : `Over by ${(totalPct - 100).toFixed(2)}%`}
                </p>
              )}
            </div>
          )}

          {/* CUSTOM split */}
          {splitScope === 'overall' && splitMethod === 'custom' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Enter the exact rupee amount each person owes. Must sum to {fmt(totalAmount)}.
              </p>
              {participantMembers.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <Avatar name={m.displayName || m.username} size={7} colorIndex={i} />
                  <span className="text-sm font-semibold text-slate-800 flex-1">{m.displayName || m.username}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-slate-500">₹</span>
                    <input type="number" min="0" step="0.01"
                      value={customMap[m.id] ?? 0}
                      onChange={(e) => setCustomMap((p) => ({ ...p, [m.id]: Number(e.target.value) }))}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right outline-none focus:border-emerald-400" />
                  </div>
                </div>
              ))}
              <div className={`flex justify-between rounded-xl px-4 py-2.5 text-sm font-bold
                ${Math.abs(totalCustom - totalAmount) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <span>Assigned</span>
                <span>{fmt(totalCustom)} / {fmt(totalAmount)}</span>
              </div>
              {Math.abs(totalCustom - totalAmount) > 0.01 && (
                <p className="text-xs text-rose-600">
                  {totalCustom < totalAmount
                    ? `Still need to assign ${fmt(totalAmount - totalCustom)}`
                    : `Over by ${fmt(totalCustom - totalAmount)}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</p>}

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          {step === 1 ? 'Cancel' : '← Back'}
        </button>
        {step < 3 ? (
          <button
            disabled={step === 2 && participants.length === 0}
            onClick={() => setStep(s => s + 1)}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">
            Next →
          </button>
        ) : (
          <button onClick={submit} disabled={loading || !canSubmit()}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40">
            {loading ? 'Saving…' : 'Save Expense'}
          </button>
        )}
      </div>
    </Modal>
  )
}
