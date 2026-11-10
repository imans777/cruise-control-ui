// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// The color theme follows the OS appearance (live, e.g. macOS Auto by the time of day), applied as html[data-theme]
// (see assets/styles/glass.css). A click picks the other theme until the OS next switches between light and dark;
// picking the OS's own theme follows the OS again. Kept across reloads.

// keys of their own: the old one ('cruise-control-ui.theme') was written as 'dark' on every load, so only its 'light' was a choice
const STORAGE_KEY = 'cruise-control-ui.theme-mode'
// the OS theme when the pick was made: the OS has switched since (even while the page was closed) when it differs
const OS_KEY = 'cruise-control-ui.theme-os'
const OLD_STORAGE_KEY = 'cruise-control-ui.theme'

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
let mode = 'system'

function read (key) {
  try {
    return window.localStorage.getItem(key)
  } catch (e) {
    return null
  }
}

function save (m) {
  try {
    window.localStorage.setItem(STORAGE_KEY, m)
    if (m === 'system') window.localStorage.removeItem(OS_KEY)
    else window.localStorage.setItem(OS_KEY, systemTheme())
  } catch (e) {
    // not kept across reloads then
  }
}

// the OS appearance (dark when the browser does not tell)
export function systemTheme () {
  return media && media.matches ? 'light' : 'dark'
}

// 'system', or the theme picked (and the OS has not switched since)
export function loadThemeMode () {
  let m = read(STORAGE_KEY)
  if (m !== 'light' && m !== 'dark' && m !== 'system') m = read(OLD_STORAGE_KEY) === 'light' ? 'light' : 'system'
  if (m === 'system' || m === systemTheme()) return 'system'
  const os = read(OS_KEY)
  return os && os !== systemTheme() ? 'system' : m
}

export function resolveTheme (m) {
  return m === 'system' ? systemTheme() : m
}

export function applyThemeMode (m) {
  mode = m
  document.documentElement.setAttribute('data-theme', resolveTheme(m))
  save(m)
}

// a click: the other theme than the one shown; the OS's own is 'system' again. Returns the new mode.
export function toggleThemeMode (m) {
  const next = resolveTheme(m) === 'dark' ? 'light' : 'dark'
  return next === systemTheme() ? 'system' : next
}

// the OS switching between light and dark ends a pick: the theme follows the OS again. listener (optional) gets 'system'.
export function onSystemThemeChange (listener) {
  if (!media) return
  const changed = () => {
    if (mode === 'system') {
      document.documentElement.setAttribute('data-theme', systemTheme())
    } else if (read(OS_KEY) !== systemTheme()) {
      applyThemeMode('system')
    }
    if (listener) listener(mode)
  }
  if (media.addEventListener) media.addEventListener('change', changed)
  else if (media.addListener) media.addListener(changed)
}
