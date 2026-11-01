// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.

// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import Vuex from 'vuex'
import Axios from 'axios'
import App from './App'
import Api from './api'
import router from './router'
import store from './store'
import Exception from '@/components/Exception'
import AsyncTask from '@/components/AsyncTask'
import 'bootstrap/js/dist/dropdown'
import 'bootswatch/dist/cosmo/bootstrap.css'

Vue.use(Vuex)

Vue.component('exception', Exception)
Vue.component('async-task', AsyncTask)

Axios.defaults.withCredentials = true
Vue.prototype.$http = Axios
Vue.prototype.$helpers = Api
Vue.config.productionTip = false

// disk is already in MB
Vue.filter('formatUnits', function (v) {
  if (v === 'DEAD') {
    return 'N/A'
  }
  v = v * 1024 * 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  for (let i = 0; i < units.length; i++) {
    if (v <= Math.pow(1024, i + 1)) {
      let value = v / Math.pow(1024, i)
      value = value.toFixed(2)
      return value + ' ' + units[i]
    }
  }
})

// network is in KB
Vue.filter('formatNetworkUnits', function (v) {
  if (v === 'DEAD') {
    return 'N/A'
  }
  v = v * 1000
  const units = ['Bps', 'KBps', 'MBps', 'GBps', 'TBps', 'PBps', 'EBps', 'ZBps', 'YBps']
  for (let i = 0; i < units.length; i++) {
    if (v <= Math.pow(1024, i + 1)) {
      let value = v / Math.pow(1024, i)
      value = value.toFixed(1)
      return value + ' ' + units[i]
    }
  }
})

// throttles are in bytes/second
Vue.filter('formatBytesRate', function (v) {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) {
    return '—'
  }
  v = Number(v)
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  for (let i = 0; i < units.length; i++) {
    if (v < Math.pow(1024, i + 1) || i === units.length - 1) {
      return (v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
    }
  }
})

// data movement rates are in MB/second
Vue.filter('formatMBRate', function (v) {
  if (v === null || v === undefined || isNaN(Number(v))) {
    return '—'
  }
  return Vue.filter('formatBytesRate')(Number(v) * 1024 * 1024)
})

// durations are in milliseconds
Vue.filter('formatDuration', function (v) {
  if (v === null || v === undefined || isNaN(Number(v))) {
    return '—'
  }
  let s = Math.round(Number(v) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  if (d > 0) return d + 'd ' + h + 'h'
  if (h > 0) return h + 'h ' + m + 'm'
  if (m > 0) return m + 'm ' + s + 's'
  return s + 's'
})

Vue.filter('formatHost', function (v) {
  if (v) {
    return v.replace(/\.(\w+)\.(com|org|biz|net)$/, '')
  } else {
    return v
  }
})

Vue.filter('formatNumber', function (v) {
  if (v === null || v === undefined || v === '') {
    return '—'
  }
  return Number(v).toLocaleString()
})

Vue.filter('formatDecimal', function (v) {
  const n = Number(v)
  return isNaN(n) ? '—' : n.toFixed(2)
})

Vue.filter('camelCase', function (v) {
  return v.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
})

Vue.filter('splitCamelCase', function (v) {
  // keeps acronyms together: IntraBrokerDiskIORate -> Intra Broker Disk IO Rate
  return v.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/^./, function (str) { return str.toUpperCase() })
})

Vue.filter('formatLocalTime', function (v) {
  const diff = Math.floor((Date.now() - v) / 1000)

  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60

  if (d > 0) {
    if (h > 0) return d + 'd ' + h + 'h ago'
    if (m > 0) return d + 'd ' + m + 'm ago'
    return d + 'd ago'
  }

  if (h > 0) {
    if (m > 0) return h + 'h ' + m + 'm ago'
    return h + 'h ago'
  }

  if (m > 0) {
    if (s > 0) return m + 'm ' + s + 's ago'
    return m + 'm ago'
  }

  return s + 's ago'
})

/* eslint-disable no-new */
new Vue({
  el: '#app',
  store,
  router,
  template: '<App/>',
  components: { App }
})
