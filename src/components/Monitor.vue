<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <button class="btn btn-sm btn-outline-danger" :disabled='loading' title="Clear the load monitor's metric samples and load them again" @click='confirmBootstrap = true'><i class="bi bi-arrow-counterclockwise"></i> Bootstrap Metrics…</button>
      <refresh-button label="Refresh Monitor SubState" :loading="loading" @click="getState()" />
      <auto-refresh v-model='autoRefreshMs' class="ml-1" />
    </div>
    <!-- bootstrapping drops the samples the load monitor holds: asked first -->
    <div v-if="confirmBootstrap" class="alert alert-danger confirm-box">
      <b><i class="bi bi-exclamation-triangle"></i> Bootstrap the load monitor?</b>
      Cruise Control drops the metric samples it holds and loads them again from the sample store (clearmetrics=true, start=0).
      Until it is done the load model is incomplete, and proposals may fail.
      <div class="mt-2">
        <button class="btn btn-danger btn-sm" @click="confirmBootstrap = false; bootstrapMetrics()">Bootstrap now</button>
        <button class="btn btn-outline-secondary btn-sm ml-1" @click="confirmBootstrap = false">Cancel</button>
      </div>
    </div>
    <div v-if="bootstrapNote" class="alert alert-success alert-dismissible">
      {{ bootstrapNote }}
      <button type="button" class="close" @click="bootstrapNote = ''">&times;</button>
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <loading-state />
    </div>
    <div v-else>
      <div class="stat-grid">
        <stat-tile label="Monitor" icon="bi-activity" :tone="MonitorState.state === 'RUNNING' ? 'success' : MonitorState.state === 'STOPPED' ? 'danger' : MonitorState.state === 'PAUSED' ? null : 'info'">
          <span v-if='MonitorState.state == "LOADING"' class="badge badge-info">{{ MonitorState.state }}</span>
          <template v-else>
            <span :class="monitor_class">{{ MonitorState.state }}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary ml-1 py-0 monitor-action" @click='doAction()' :title='monitor_title'>
              <i :class="['bi', MonitorState.state === 'PAUSED' ? 'bi-play-fill' : 'bi-pause-fill']"></i> {{ MonitorState.state === 'PAUSED' ? 'Resume' : 'Pause' }}
            </button>
          </template>
          <template v-if='MonitorState.state == "LOADING"' #sub>
            <div class="d-flex justify-content-between"><span>loading</span><span>{{ MonitorState.loadingProgressPct != null ? MonitorState.loadingProgressPct.toFixed(2) : '0.00' }} %</span></div>
            <div class="progress"><div class="progress-bar bg-info" :style="{ width: (MonitorState.loadingProgressPct || 0) + '%' }"></div></div>
          </template>
        </stat-tile>
        <stat-tile label="Training" icon="bi-mortarboard" :tone="MonitorState.trained === true ? 'success' : 'info'">
          <span :class="['badge', MonitorState.trained === true ? 'badge-success': 'badge-info']">{{ MonitorState.trained === true ? 'TRAINED' : 'TRAINING' }}</span>
          <template #sub>
            <div class="d-flex justify-content-between"><span>progress</span><span>{{ MonitorState.trainingPct != null ? MonitorState.trainingPct.toFixed(2) : '0.00' }} %</span></div>
            <div class="progress"><div :class="['progress-bar', MonitorState.trained === true ? 'bg-success' : null]" :style="{ width: (MonitorState.trainingPct || 0) + '%' }"></div></div>
          </template>
        </stat-tile>
        <stat-tile label="Snapshots" icon="bi-camera" :tone="MonitorState.numMonitoredWindows < 1 ? 'info' : 'success'" :value="MonitorState.numMonitoredWindows" sub="monitored windows" />
        <stat-tile label="Total Kafka Partitions" icon="bi-grid-3x3-gap" :tone="MonitorState.numTotalPartitions < 1 ? 'info' : 'primary'" :value="MonitorState.numTotalPartitions | formatNumber" />
        <stat-tile label="Valid Kafka Partitions" icon="bi-check2-circle" :tone="MonitorState.numValidPartitions != MonitorState.numTotalPartitions ? 'info' : 'success'" :value="MonitorState.numValidPartitions | formatNumber" :sub="MonitorState.numTotalPartitions > 0 ? (MonitorState.numValidPartitions / MonitorState.numTotalPartitions * 100).toFixed(1) + '% of total' : null" />
        <stat-tile label="Flawed Kafka Partitions" icon="bi-exclamation-diamond" :tone="MonitorState.numFlawedPartitions < 1 ? 'success' : 'warning'" :value="MonitorState.numFlawedPartitions | formatNumber" />
      </div>
    </div>
  </div>
</template>

<script>
import AutoRefresh from '@/components/AutoRefresh'
import { autoRefreshMixin } from '@/autoRefresh'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

export default {
  name: 'Monitor',
  mixins: [autoRefreshMixin],
  props: {
    group: String,
    cluster: String
  },
  components: {
    AutoRefresh
  },
  data () {
    return {
      confirmBootstrap: false,
      bootstrapNote: '',
      loaded: false,
      loading: false,
      error: false,
      errorData: null,
      async: false, // when the server treats this request as async
      asyncData: null, // when the server treats the request as async and sends progress instead of actual response
      argsRetryTimer: null,
      asyncRetryTimer: null,
      MonitorState: {
        trainingPct: 0,
        trained: false,
        numFlawedPartitions: 0,
        monitoredWindows: {},
        state: null,
        numTotalPartitions: 0,
        numMonitoredWindows: 0,
        monitoringCoveragePct: 0,
        numValidPartitions: 0
      }
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    if (this.argsRetryTimer) {
      clearTimeout(this.argsRetryTimer)
    }
    this.stopAutoRefresh()
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
  computed: {
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    url () {
      return this.$helpers.getURL('state', { substates: 'MONITOR', verbose: true })
    },
    bootstrapUrl () {
      return this.$helpers.getURL('bootstrap', { clearmetrics: true, start: 0 })
    },
    get_action_url () {
      if (this.MonitorState.state === 'PAUSED') {
        return this.$helpers.getURL('resume_sampling')
      } else {
        return this.$helpers.getURL('pause_sampling')
      }
    },
    monitor_title () {
      if (this.MonitorState.state === 'PAUSED') {
        return 'Resume monitor'
      } else {
        return 'Pause monitor'
      }
    },
    monitor_class () {
      if (this.MonitorState.state === 'PAUSED') {
        return 'badge badge-secondary'
      } else if (this.MonitorState.state === 'RUNNING') {
        return 'badge badge-success'
      } else if (this.MonitorState.state === 'STOPPED') {
        return 'badge badge-danger'
      } else {
        return 'badge badge-primary'
      }
    }
  },
  methods: {
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
      this.stopAutoRefresh()
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getState()
      this.startAutoRefresh()
    },
    getState () {
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
          vm.stopAutoRefresh()
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getState(), ASYNC_RETRY_DELAY)
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.error = false
          vm.errorData = null
          vm.loading = false
          const defaults = { trainingPct: 0, trained: false, numFlawedPartitions: 0, monitoredWindows: {}, state: null, numTotalPartitions: 0, numMonitoredWindows: 0, monitoringCoveragePct: 0, numValidPartitions: 0 }
          vm.$set(vm, 'MonitorState', Object.assign(defaults, result.data.MonitorState))
          vm.loaded = true
          if (!vm.autoRefreshInterval) vm.startAutoRefresh()
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    },
    bootstrapMetrics () {
      const vm = this
      vm.bootstrapNote = ''
      fetchCC(vm.bootstrapUrl, { method: 'GET' }).then((result) => {
        if (result.type === 'error') {
          vm.error = true
          vm.errorData = result.data
        } else {
          vm.error = false
          vm.errorData = null
          vm.bootstrapNote = 'Bootstrap started: the Monitor state shows its progress.'
          vm.getState()
        }
      }).catch((e) => {
        vm.error = true
        vm.errorData = e.message || e
      })
    },
    doAction () {
      const vm = this
      this.$http.post(vm.get_action_url, null, { withCredentials: true }).then((r) => {
        this.getState()
      }, (e) => {
        this.getState()
      })
    }
  }
}
</script>

<style scoped>
.card-columns {
  column-count: 6;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s
}
.fade-enter, .fade-leave-to  {
  opacity: 0
}
.pointer {cursor: pointer;}
</style>
