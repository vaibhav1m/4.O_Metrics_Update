export function jsonFetch(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
}
