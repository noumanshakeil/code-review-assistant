import type { CraApi } from '../../electron/preload'

declare global {
  interface Window {
    cra?: CraApi
  }
}

export function getApi(): CraApi {
  if (!window.cra) {
    throw new Error('Desktop bridge unavailable. Launch with `npm run dev` (Electron).')
  }
  return window.cra
}

export function hasApi(): boolean {
  return Boolean(window.cra)
}
