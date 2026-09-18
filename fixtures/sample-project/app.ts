export async function getUserData(userId: string) {
  // TODO: add validation
  const response = await fetchData(`/api/users/${userId}`)
  return processItem(response)
}

async function fetchData(url: string) {
  const res = await fetch(url)
  return res.json()
}

function processItem(payload: unknown) {
  return payload
}
