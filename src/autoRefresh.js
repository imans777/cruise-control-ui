// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// Auto-refresh intervals of the pages with periodic polling. The choice is shared by those pages and kept across reloads.
import { AUTO_REFRESH_INTERVAL } from '@/constants'

export const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', ms: 0 },
  { label: '5s', ms: 5000 },
  { label: '30s', ms: 30000 },
  { label: '10m', ms: 600000 }
]

const STORAGE_KEY = 'cruise-control-ui.autoRefreshMs'

export function loadAutoRefreshMs () {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null && AUTO_REFRESH_OPTIONS.some(o => o.ms === Number(stored))) return Number(stored)
  } catch (e) {
    // no localStorage (e.g. disabled): use the default
  }
  return AUTO_REFRESH_INTERVAL
}

export function saveAutoRefreshMs (ms) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ms))
  } catch (e) {
    // not kept across reloads then
  }
}

// The periodic polling of a State tab: v-model the picker on autoRefreshMs; the component calls startAutoRefresh() once its
// state is loaded and stopAutoRefresh() while CC answers asynchronously. A tick is skipped while a request is in flight.
export const autoRefreshMixin = {
  data () {
    return {
      autoRefreshMs: loadAutoRefreshMs(), // 0 = off
      autoRefreshInterval: null
    }
  },
  watch: {
    autoRefreshMs (ms) {
      saveAutoRefreshMs(ms)
      this.startAutoRefresh()
    }
  },
  beforeDestroy () {
    this.stopAutoRefresh()
  },
  methods: {
    stopAutoRefresh () {
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval)
        this.autoRefreshInterval = null
      }
    },
    // (re)starts the timer with the chosen interval, or just stops it when off
    startAutoRefresh () {
      this.stopAutoRefresh()
      if (this.autoRefreshMs > 0) {
        this.autoRefreshInterval = setInterval(() => {
          if (!this.loading) {
            this.getState()
          }
        }, this.autoRefreshMs)
      }
    }
  }
}
