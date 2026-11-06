<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Anomaly Detector State" :loading="loading" @click="getState()" />
      <auto-refresh v-model='autoRefreshMs' class="ml-1" />
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

      <div class="stat-grid cols-4">
        <!-- CC reports -1 until it has computed the score (e.g. right after a restart) -->
        <stat-tile v-if="balancedness === null" label="Balancedness Score" icon="bi-speedometer2" value="N/A" sub="not computed yet" />
        <stat-tile v-else label="Balancedness Score" icon="bi-speedometer2" :tone="balancedness === 100 ? 'success' : 'warning'" :value="balancedness.toFixed(2) + '%'">
          <template #sub>
            <div class="progress"><div :class="['progress-bar', balancedness === 100 ? 'bg-success' : null]" :style="{ width: Math.min(100, balancedness) + '%' }"></div></div>
          </template>
        </stat-tile>
        <stat-tile label="Self Healings Started" icon="bi-bandaid" :tone="AnomalyDetectorState.metrics.numSelfHealingStarted > 0 ? 'success' : null" :value="AnomalyDetectorState.metrics.numSelfHealingStarted" />
        <stat-tile label="Self Healings Failed to Start" icon="bi-x-circle" :tone="AnomalyDetectorState.metrics.numSelfHealingFailedToStart > 0 ? 'danger' : 'success'" :value="AnomalyDetectorState.metrics.numSelfHealingFailedToStart" />
        <stat-tile label="Avg Minutes To Start Fix" icon="bi-stopwatch" tone="info" :value="Number(AnomalyDetectorState.metrics.meanTimeToStartFixMs / 60000).toFixed(1)" />
      </div>

      <div>
        <h4>Self Healing Status</h4>
        <div v-if="toggleBusy" class="alert alert-info"><div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Applying {{ toggleRequest }} ...</div>
        <div v-else-if="toggleError"><exception :exception="toggleResponse"></exception></div>
        <div v-else-if="toggleResponse" class="alert alert-success alert-dismissible">
          <b>{{ toggleRequest }}</b>: <span class="response-value">{{ toggleResponseText }}</span>
          <button type="button" class="close" @click="toggleResponse = null">&times;</button>
        </div>
        <!-- one tile per anomaly type; its switch turns self-healing on or off for the type (right away, on the cluster) -->
        <div class="heal-grid">
          <div v-for="h in healingTypes" :key="h.type" :class="['heal-tile', { on: h.enabled, busy: toggleBusy }]">
            <div class="heal-head">
              <!-- may break after an underscore -->
              <span class="heal-name"><template v-for="(part, i) in h.type.split('_')">{{ i ? '_' : '' }}<wbr :key="i">{{ part }}</template></span>
              <input type="checkbox" class="switch" :checked="h.enabled" :disabled="toggleBusy" :title="(h.enabled ? 'Disable' : 'Enable') + ' self-healing for ' + h.type" :aria-label="'Self-healing for ' + h.type" @click.prevent="setSelfHealing(h.type, !h.enabled)">
            </div>
            <div class="heal-sub">
              <span :class="h.enabled ? 'text-success' : null">{{ h.enabled ? 'On' : 'Off' }}</span>
              <span title="selfHealingEnabledRatio: the share of the time since Cruise Control started that self-healing was on for this type">on {{ h.ratio }}% of the time</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="anomalyRates.length">
        <h4>Anomaly Rates</h4>
        <p class="small text-muted mb-1">
          <template v-if="AnomalyDetectorState.ongoingSelfHealingAnomaly">Ongoing self-healing anomaly: <code>{{ AnomalyDetectorState.ongoingSelfHealingAnomaly }}</code> &middot; </template>
          <template v-if="AnomalyDetectorState.metrics.ongoingAnomalyDurationMs">Ongoing anomaly for {{ AnomalyDetectorState.metrics.ongoingAnomalyDurationMs | formatDuration }}</template>
        </p>
        <table class="table table-sm table-bordered">
          <thead class="thead-light">
            <tr>
              <th>Anomaly Type</th>
              <!-- CC's meanTimeBetweenAnomaliesMs is not a time: it is the mean anomaly rate (per second, since Cruise Control
                   started) x 1000, so the mean time between anomalies is 1000 s divided by it -->
              <th title="Since Cruise Control started. Cruise Control reports it as meanTimeBetweenAnomaliesMs, which is in fact the anomaly rate per second x 1000: the time shown is 1000 s divided by that value (hover a row for it).">Mean Time Between Anomalies <i class="bi bi-question-circle help-icon"></i></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in anomalyRates" :key="r.type" :class="{ 'quiet-row': !(r.reported > 0) }" :title="'meanTimeBetweenAnomaliesMs as reported: ' + r.reported">
              <td>{{ r.type }}</td>
              <td>{{ r.reported > 0 ? $options.filters.formatDuration(1e6 / r.reported) : 'no anomaly yet' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentDiskFailures && AnomalyDetectorState.recentDiskFailures.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentDiskFailures }]" @click="toggle('recentDiskFailures')"><i class="bi bi-chevron-right chev"></i> Recent Disk Failures
          <small class="text-muted">({{ AnomalyDetectorState.recentDiskFailures.length }}, latest {{ AnomalyDetectorState.recentDiskFailures[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentDiskFailures" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Failed Disks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentDiskFailures' :key='ridx'>
              <td class="text-nowrap">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <ul class="goal-chips">
                  <template v-for="(broker, bid) in r.failedDisksByTimeMs">
                    <li v-for="disk in Object.keys(broker)" :key="bid + disk" class="goal-chip unfixable" :title="'failed ' + $options.filters.formatLocalTime(broker[disk])">broker {{ bid }}: {{ disk }}</li>
                  </template>
                </ul>
              </td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentBrokerFailures && AnomalyDetectorState.recentBrokerFailures.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentBrokerFailures }]" @click="toggle('recentBrokerFailures')"><i class="bi bi-chevron-right chev"></i> Recent Broker Failures
          <small class="text-muted">({{ AnomalyDetectorState.recentBrokerFailures.length }}, latest {{ AnomalyDetectorState.recentBrokerFailures[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentBrokerFailures" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Failed Brokers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentBrokerFailures' :key='ridx'>
              <td class="text-nowrap">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <ul class="goal-chips">
                  <li v-for="(time, broker) in r.failedBrokersByTimeMs" :key='broker' class="goal-chip unfixable" :title="'failed ' + $options.filters.formatLocalTime(time)">broker {{ broker }}</li>
                </ul>
              </td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentGoalViolations && AnomalyDetectorState.recentGoalViolations.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentGoalViolations }]" @click="toggle('recentGoalViolations')"><i class="bi bi-chevron-right chev"></i> Recent Goal Violations
          <small class="text-muted">({{ AnomalyDetectorState.recentGoalViolations.length }}, latest {{ AnomalyDetectorState.recentGoalViolations[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentGoalViolations" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th title="Green: fixable, red: not fixable">Violated Goals <i class="bi bi-question-circle help-icon"></i></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ridx) in AnomalyDetectorState.recentGoalViolations" :key='ridx'>
              <td class="text-nowrap">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <!-- Depedning on the version of CC we use, two types of responses are being sent out -->
                <ul class="goal-chips">
                  <template v-if='r.hasOwnProperty("violatedGoals")'>
                    <li v-for="(g, gidx) in r.violatedGoals" :key="'v' + gidx" class="goal-chip unfixable">{{ g }}</li>
                  </template>
                  <template v-else>
                    <li v-for="(g, gidx) in r.fixableViolatedGoals" :key="'f' + gidx" class="goal-chip fixable" title="Fixable">{{ g }}</li>
                    <li v-for="(g, gidx) in r.unfixableViolatedGoals" :key="'u' + gidx" class="goal-chip unfixable" title="Not fixable">{{ g }}</li>
                  </template>
                </ul>
              </td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentIntraBrokerGoalViolations && AnomalyDetectorState.recentIntraBrokerGoalViolations.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentIntraBrokerGoalViolations }]" @click="toggle('recentIntraBrokerGoalViolations')"><i class="bi bi-chevron-right chev"></i> Recent Intra-Broker Goal Violations
          <small class="text-muted">({{ AnomalyDetectorState.recentIntraBrokerGoalViolations.length }}, latest {{ AnomalyDetectorState.recentIntraBrokerGoalViolations[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentIntraBrokerGoalViolations" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th title="Green: fixable, red: not fixable">Violated Intra-Broker Goals <i class="bi bi-question-circle help-icon"></i></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ridx) in AnomalyDetectorState.recentIntraBrokerGoalViolations" :key='ridx'>
              <td class="text-nowrap" :title="r.anomalyId">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <ul class="goal-chips">
                  <li v-for="(g, gidx) in (r.fixableViolatedGoals || [])" :key="'f' + gidx" class="goal-chip fixable" title="Fixable">{{ g }}</li>
                  <li v-for="(g, gidx) in (r.unfixableViolatedGoals || [])" :key="'u' + gidx" class="goal-chip unfixable" title="Not fixable">{{ g }}</li>
                </ul>
              </td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span><div v-if="r.statusUpdateMs" class="small text-muted mt-1">{{ r.statusUpdateMs | formatLocalTime }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentMetricAnomalies && AnomalyDetectorState.recentMetricAnomalies.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentMetricAnomalies }]" @click="toggle('recentMetricAnomalies')"><i class="bi bi-chevron-right chev"></i> Recent Metric Anomalies
          <small class="text-muted">({{ AnomalyDetectorState.recentMetricAnomalies.length }}, latest {{ AnomalyDetectorState.recentMetricAnomalies[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentMetricAnomalies" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentMetricAnomalies' :key='ridx'>
              <td class="text-nowrap">{{ r.detectionMs | formatLocalTime }}</td>
              <td>{{ r.description }}</td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentTopicAnomalies && AnomalyDetectorState.recentTopicAnomalies.length > 0'>
        <h4 :class="['collapse-title', { open: !collapsed.recentTopicAnomalies }]" @click="toggle('recentTopicAnomalies')"><i class="bi bi-chevron-right chev"></i> Recent Topic Anomalies
          <small class="text-muted">({{ AnomalyDetectorState.recentTopicAnomalies.length }}, latest {{ AnomalyDetectorState.recentTopicAnomalies[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentTopicAnomalies" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>Detected</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentTopicAnomalies' :key='ridx'>
              <td class="text-nowrap">{{ r.detectionMs | formatLocalTime }}</td>
              <td>{{ r.description }}</td>
              <td class="text-nowrap"><span :class="['badge', statusBadge(r.status)]">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
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
  name: 'AnomalyDetector',
  mixins: [autoRefreshMixin],
  components: {
    AutoRefresh
  },
  props: {
    group: String,
    cluster: String
  },
  data () {
    return {
      loaded: false,
      loading: false,
      error: false,
      errorData: null,
      async: false, // when the server treats this request as async
      asyncData: null, // when the server treats the request as async and sends progress instead of actual response
      argsRetryTimer: null,
      asyncRetryTimer: null,
      toggleBusy: false,
      toggleError: false,
      toggleRequest: '',
      toggleResponse: null,
      // anomaly lists collapsed by the user (kept across refreshes)
      collapsed: { recentDiskFailures: false, recentBrokerFailures: false, recentGoalViolations: false, recentIntraBrokerGoalViolations: false, recentMetricAnomalies: false, recentTopicAnomalies: false },
      AnomalyDetectorState: {
        balancednessScore: 0,
        metrics: {},
        selfHealingDisabled: [],
        selfHealingEnabled: [],
        selfHealingEnabledRatio: {},
        recentBrokerFailures: [],
        recentDiskFailures: [],
        recentMetricAnomalies: [],
        recentGoalViolations: [],
        recentTopicAnomalies: [],
        recentIntraBrokerGoalViolations: []
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
      return this.$helpers.getURL('state', { substates: 'ANOMALY_DETECTOR', verbose: true })
    },
    balancedness () {
      const v = Number(this.AnomalyDetectorState.balancednessScore)
      return isFinite(v) && v >= 0 ? v : null
    },
    // the anomaly types, enabled or not, in a stable (alphabetical) order
    healingTypes () {
      const st = this.AnomalyDetectorState
      const ratio = st.selfHealingEnabledRatio || {}
      return [...st.selfHealingEnabled.map(t => [t, true]), ...st.selfHealingDisabled.map(t => [t, false])]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([type, enabled]) => ({ type, enabled, ratio: Number((ratio[type] || 0) * 100).toFixed(0) }))
    },
    anomalyRates () {
      const m = (this.AnomalyDetectorState.metrics || {}).meanTimeBetweenAnomaliesMs || {}
      return Object.keys(m).sort().map(type => ({ type, reported: Number(m[type]) }))
    },
    toggleResponseText () {
      const r = this.toggleResponse
      if (!r || typeof r !== 'object') return r
      if (r.selfHealingEnabledBefore || r.selfHealingEnabledAfter) {
        return 'before: ' + JSON.stringify(r.selfHealingEnabledBefore) + ' after: ' + JSON.stringify(r.selfHealingEnabledAfter)
      }
      return JSON.stringify(r)
    }
  },
  methods: {
    // the color of an anomaly status
    statusBadge (status) {
      const s = String(status || '')
      if (/FAILED/.test(s)) return 'badge-danger'
      if (/FIX_STARTED|FIXED/.test(s)) return 'badge-success'
      if (/NOT_READY|DELAY/.test(s)) return 'badge-warning'
      if (/IGNORED/.test(s)) return 'badge-secondary'
      return 'badge-info'
    },
    toggle (section) {
      this.collapsed[section] = !this.collapsed[section]
    },
    setSelfHealing (type, enable) {
      const vm = this
      const key = enable ? 'enable_self_healing_for' : 'disable_self_healing_for'
      const params = {}
      params[key] = type
      vm.toggleRequest = key + '=' + type
      vm.toggleBusy = true
      vm.toggleError = false
      vm.toggleResponse = null
      vm.$http.post(vm.$helpers.getURL('admin', params), null, { withCredentials: true }).then((r) => {
        vm.toggleBusy = false
        vm.toggleResponse = r.data
        vm.getState()
      }, (e) => {
        vm.toggleBusy = false
        vm.toggleError = true
        vm.toggleResponse = e && e.response ? e.response.data : (e.message || e)
      })
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
      this.getState()
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
          const defaults = { metrics: {}, selfHealingDisabled: [], selfHealingEnabled: [], selfHealingEnabledRatio: {}, recentBrokerFailures: [], recentDiskFailures: [], recentMetricAnomalies: [], recentGoalViolations: [], recentTopicAnomalies: [], recentIntraBrokerGoalViolations: [] }
          vm.$set(vm, 'AnomalyDetectorState', Object.assign(defaults, result.data.AnomalyDetectorState))
          // the latest anomaly first
          Object.keys(vm.collapsed).forEach(k => vm.AnomalyDetectorState[k].sort((a, b) => b.detectionMs - a.detectionMs))
          vm.loaded = true
          if (!vm.autoRefreshInterval) vm.startAutoRefresh()
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    }
  }
}
</script>

<style scoped>
.goal-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; padding: 0; list-style: none; }
.goal-chip { padding: 2px 10px; border: 1px solid transparent; border-radius: 999px; font-size: 0.8rem; }
.goal-chip.fixable { border-color: rgba(52, 211, 153, 0.4); background: var(--success-soft); color: var(--success); }
.goal-chip.unfixable { border-color: rgba(248, 113, 113, 0.45); background: var(--danger-soft); color: var(--danger); }
.quiet-row td { color: var(--muted); }
.heal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-bottom: 1.5rem; }
.heal-tile { padding: 12px 14px; border: 1px solid var(--glass-border); border-radius: 12px; background: var(--glass); transition: border-color 0.15s, background 0.15s; }
.heal-tile.on { border-color: rgba(52, 211, 153, 0.45); background: var(--success-soft); }
.heal-tile.busy { cursor: progress; opacity: 0.7; }
.heal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.heal-name { font-weight: 600; color: var(--text-strong); font-size: 0.85rem; }
.heal-sub { display: flex; justify-content: space-between; margin-top: 6px; color: var(--muted); font-size: 0.78rem; }
.response-value { white-space: pre-wrap; }
.pointer { cursor: pointer; }
.card-columns {
  column-count: 6;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s
}
.fade-enter, .fade-leave-to  {
  opacity: 0
}
</style>
