export function fmt(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(value)
}

export function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}
