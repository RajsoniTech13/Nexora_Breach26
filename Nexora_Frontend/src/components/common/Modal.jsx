export default function Modal({ title, onClose, children, size = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0 -z-10" onClick={onClose} />
      <div className={`w-full ${size} rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl animate-slide-up`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors h-11 w-11 flex items-center justify-center">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[80vh] sm:max-h-[75vh] overflow-y-auto p-6 pb-12 sm:pb-6">{children}</div>
      </div>
    </div>
  )
}
