// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// The color theme: dark (default) or light, kept across reloads, applied as html[data-theme] (see assets/styles/glass.css).

const STORAGE_KEY = 'cruise-control-ui.theme'

export function loadTheme () {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch (e) {
    return 'dark'
  }
}

export function applyTheme (theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch (e) {
    // not kept across reloads then
  }
}
