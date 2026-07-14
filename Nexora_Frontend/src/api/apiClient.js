const API_BASE_URL = import.meta.env?.VITE_API_URL || ''

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch (err) {
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    throw new Error('Received non-JSON response from server')
  }

  if (!res.ok) throw new Error(json.message || json.error || 'Request failed')
  return json.status === 'success' ? json.data : json
}

export async function apiUploadBinary(path, { file, token } = {}) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (file?.type) headers['Content-Type'] = file.type

  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: file,
  })

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch (err) {
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
    throw new Error('Received non-JSON response from server')
  }

  if (!res.ok) throw new Error(json.message || json.error || 'Request failed')
  return json.status === 'success' ? json.data : json
}
