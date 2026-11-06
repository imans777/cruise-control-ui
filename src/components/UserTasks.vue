<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh User Tasks" :loading="loading" @click="getUserTasks()" />
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if="loading">
      <loading-state />
    </div>
    <div v-else-if='sortedTasks.length > 0'>
      <div v-sticky class="tasks-toolbar">
        <input type="search" class="form-control form-control-sm search-input" v-model="searchText" placeholder="Search: task id, client or request">
        <segmented-control v-model="statusFilter" :options="statusOptions" aria-label="Status" />
      </div>
      <table class="table table-sm table-bordered">
        <thead class="thead-light">
          <tr>
            <th class="pointer" @click='sort("UserTaskId")'>Task Id</th>
            <th class="pointer" @click='sort("ClientIdentity")'>Client</th>
            <th class="pointer" @click='sort("StartMs")'>Started</th>
            <th class="pointer" @click='sort("Status")'>Status</th>
            <th class="pointer" @click='sort("RequestURL")'>Request</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in shownTasks" :key="t.UserTaskId">
            <td class="task-id">{{ t.UserTaskId }}</td>
            <td class="nowrap client">{{ String(t.ClientIdentity || '').replace(/^\[|\]$/g, '') }}</td>
            <td class="nowrap" :title="(new Date(parseInt(t.StartMs, 10))).toLocaleString()">{{ t.StartMs | formatLocalTime }}<div class="small text-muted">{{ (new Date(parseInt(t.StartMs, 10))).toLocaleTimeString() }}</div></td>
            <td class="nowrap"><span :class="['badge', statusBadge(t.Status)]"><i v-if="t.Status === 'Active'" class="bi bi-circle-fill pulse-dot"></i> {{ t.Status }}</span></td>
            <td class="request" :title="t.RequestURL">
              <span :class="['method', request(t).method === 'POST' ? 'post' : 'get']">{{ request(t).method }}</span>
              <b>{{ request(t).endpoint }}</b>
              <span class="params">{{ request(t).params }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filteredTasks.length > shownTasks.length" class="text-center">
        <button class="btn btn-sm btn-outline-secondary" @click="limit += 50">Show {{ Math.min(50, filteredTasks.length - shownTasks.length) }} more ({{ filteredTasks.length - shownTasks.length }} left)</button>
      </div>
      <div v-else-if="!filteredTasks.length" class="text-muted small">No task matches.</div>
    </div>
    <div v-else class="card card-body text-center empty-state"><i class="bi bi-list-check empty-icon"></i>No user tasks yet.</div>
  </div>
</template>

<script>
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
import SegmentedControl from '@/components/SegmentedControl'
const sortBy = require('lodash.sortby')

export default {
  name: 'UserTasks',
  props: {
    group: String,
    cluster: String
  },
  components: {
    SegmentedControl
  },
  data () {
    return {
      limit: 50, // the tasks shown ("Show more" adds 50)
      loaded: false,
      loading: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      tasks: [],
      sortColumn: 'StartMs',
      searchText: '',
      statusFilter: ''
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    if (this.argsRetryTimer) {
      clearTimeout(this.argsRetryTimer)
    }
    if (this.asyncRetryTimer) {
      clearTimeout(this.asyncRetryTimer)
    }
  },
  watch: {
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  methods: {
    statusBadge (status) {
      return status === 'Completed' ? 'badge-success' : status === 'CompletedWithError' ? 'badge-danger' : 'badge-info'
    },
    // "GET /kafkacruisecontrol/load?allow_capacity_estimation=true&json=true" -> GET, load, allow_capacity_estimation=true
    request (t) {
      const m = String(t.RequestURL || '').match(/^(\w+)\s+\S*?\/([\w_]+)(?:\?(.*))?$/)
      if (!m) return { method: '', endpoint: t.RequestURL, params: '' }
      const params = (m[3] || '').split('&').filter(p => p && p !== 'json=true').join(' · ')
      return { method: m[1], endpoint: m[2], params }
    },
    argsChanged (retries) {
      retries = retries || 0
      const newurl = this.$store.getters.getnewurl(this.group, this.cluster)
      if (!newurl) {
        if (retries < ARGS_RETRY_MAX) {
          this.argsRetryTimer = setTimeout(() => this.argsChanged(retries + 1), ARGS_RETRY_DELAY)
        }
        return
      }
      this.$store.commit('seturl', newurl)
      this.loaded = false
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getUserTasks()
    },
    sort (col) {
      this.sortColumn = col
    },
    getUserTasks () {
      const vm = this
      vm.loading = true
      fetchCC(vm.url).then((result) => {
        if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with ' + result.status + ' status code.'
        } else if (result.type === 'async') {
          vm.loading = false
          vm.async = true
          vm.asyncData = result.data
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getUserTasks(), ASYNC_RETRY_DELAY)
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.loading = false
          vm.error = false
          vm.errorData = null
          vm.tasks = result.data.userTasks || []
          vm.loaded = true
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    }
  },
  computed: {
    // the status choices, with how many tasks each has
    statusOptions () {
      const n = (st) => this.tasks.filter(t => t.Status === st).length
      return [
        { value: '', label: 'All ' + this.tasks.length },
        { value: 'Active', label: 'Active ' + n('Active') },
        { value: 'Completed', label: 'Completed ' + n('Completed') },
        { value: 'CompletedWithError', label: 'With error ' + n('CompletedWithError') }
      ]
    },
    shownTasks () {
      return this.filteredTasks.slice(0, this.limit)
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    url () {
      return this.$helpers.getURL('user_tasks')
    },
    sortedTasks () {
      return sortBy(this.tasks, this.sortColumn).reverse()
    },
    filteredTasks () {
      let result = this.sortedTasks
      if (this.statusFilter) {
        result = result.filter(t => t.Status === this.statusFilter)
      }
      if (this.searchText) {
        const q = this.searchText.toLowerCase()
        result = result.filter(t => {
          return (t.UserTaskId && t.UserTaskId.toLowerCase().includes(q)) ||
            (t.ClientIdentity && t.ClientIdentity.toLowerCase().includes(q)) ||
            (t.RequestURL && t.RequestURL.toLowerCase().includes(q))
        })
      }
      return result
    }
  }
}
</script>

<style scoped>
.pointer { cursor: pointer; }
.tasks-toolbar .search-input { width: 320px; flex: none; }
.nowrap { white-space: nowrap; }
.task-id { font-family: var(--mono); font-size: 0.78rem; white-space: nowrap; }
.client { color: var(--muted); font-family: var(--mono); font-size: 0.78rem; }
.tasks-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 0.7rem; }
.request { font-size: 0.82rem; word-break: break-all; }
.request b { color: var(--text-strong); font-weight: 600; }
.request .params { margin-left: 6px; color: var(--muted); font-family: var(--mono); font-size: 0.76rem; }
.method { display: inline-block; min-width: 40px; margin-right: 6px; padding: 0 6px; border-radius: 5px; font-family: var(--mono); font-size: 0.7rem; font-weight: 700; text-align: center; }
.method.get { background: var(--info-soft); color: var(--info); }
.method.post { background: var(--warning-soft); color: var(--warning); }
.pulse-dot { font-size: 0.5rem; vertical-align: 2px; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
</style>
