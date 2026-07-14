import { initials } from '../../utils/formatters'
import { AVATAR_COLORS } from '../../utils/constants'

export default function Avatar({ name, url, size = 10, colorIndex = 0 }) {
  if (url) return <img src={url} className={`h-${size} w-${size} rounded-full object-cover`} alt={name} />
  return (
    <span className={`inline-flex h-${size} w-${size} items-center justify-center rounded-full text-sm font-bold ${AVATAR_COLORS[colorIndex % AVATAR_COLORS.length]}`}>
      {initials(name)}
    </span>
  )
}
