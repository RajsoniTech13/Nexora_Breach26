import {
  Utensils,
  Plane,
  Home,
  Zap,
  Car,
  Laptop,
  PartyPopper,
  Package
} from 'lucide-react'
import React from 'react'

export const CATEGORY_ICONS = {
  Food: <Utensils className="w-6 h-6 text-orange-500" />,
  Travel: <Plane className="w-6 h-6 text-sky-500" />,
  Stay: <Home className="w-6 h-6 text-indigo-500" />,
  Utilities: <Zap className="w-6 h-6 text-amber-500" />,
  Transport: <Car className="w-6 h-6 text-teal-500" />,
  Tech: <Laptop className="w-6 h-6 text-slate-500" />,
  Entertainment: <PartyPopper className="w-6 h-6 text-rose-500" />,
  General: <Package className="w-6 h-6 text-emerald-500" />,
}
export const AVATAR_COLORS = [
  'bg-violet-200 text-violet-800', 'bg-sky-200 text-sky-800',
  'bg-emerald-200 text-emerald-800', 'bg-amber-200 text-amber-800',
  'bg-rose-200 text-rose-800',
]
