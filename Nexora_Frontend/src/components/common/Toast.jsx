import { useEffect } from 'react'

export default function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])
  
  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl px-5 py-3 shadow-lg text-sm font-semibold animate-slide-up
      ${type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
      <span>{type === 'error' ? '✖' : '✔'}</span>
      <span>{message}</span>
    </div>
  )
}
