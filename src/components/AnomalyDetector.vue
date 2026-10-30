<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div class="alert alert-info" v-if='!hideHelperURL'>
      <b>URL ({{group}}, {{cluster}}):</b> <a target=_blank :href='url'>{{ url }}</a>
    </div>
    <div class="alert alert-primary text-right">
      <button class="btn btn-primary" :disabled='loading' @click='getState()'>Refresh Anomaly Detector State</button>
      <auto-refresh v-model='autoRefreshMs' class="ml-1" />
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div> Loading ...</div>
    </div>
    <div v-else>

      <div class="card-deck mb-3">
        <div class="card text-center">
          <div class="card-header">Balancedness Score</div>
          <div class="card-body">
            <h1 :class="['card-text', Number(AnomalyDetectorState.balancednessScore) === 100 ? 'text-success' : 'text-warning']">{{ Number(AnomalyDetectorState.balancednessScore).toFixed(2) }}%</h1>
          </div>
        </div>
        <div class="card text-center">
          <div class="card-header">Self Healings Started</div>
          <div class="card-body">
            <h1 :class="['card-text', AnomalyDetectorState.metrics.numSelfHealingStarted > 0 ? 'text-success' : null]">{{ AnomalyDetectorState.metrics.numSelfHealingStarted }}</h1>
          </div>
        </div>
        <div class="card text-center">
          <div class="card-header">Self Healings Failed to Start</div>
          <div class="card-body">
            <h1 :class="['card-text', AnomalyDetectorState.metrics.numSelfHealingFailedToStart > 0 ? 'text-danger' : 'text-success']">{{ AnomalyDetectorState.metrics.numSelfHealingFailedToStart }}</h1>
          </div>
        </div>
        <div class="card text-center">
          <div class="card-header">Avg Minutes To Start Fix</div>
          <div class="card-body">
            <h1>{{ Number(AnomalyDetectorState.metrics.meanTimeToStartFixMs / 60000).toFixed(1) }}</h1>
          </div>
        </div>
      </div>

      <div>
        <h4>Self Healing Status</h4>
        <div v-if="toggleBusy" class="alert alert-info"><div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Applying {{ toggleRequest }} ...</div>
        <div v-else-if="toggleError"><exception :exception="toggleResponse"></exception></div>
        <div v-else-if="toggleResponse" class="alert alert-success alert-dismissible">
          <b>{{ toggleRequest }}</b>: <span class="response-value">{{ toggleResponseText }}</span>
          <button type="button" class="close" @click="toggleResponse = null">&times;</button>
        </div>
        <table class="table table-sm table-bordered">
          <tbody>
            <tr>
              <th>Healing Disabled For</th>
              <td>
                <b v-if='AnomalyDetectorState.selfHealingDisabled.length == 0'>None</b>
                <ul v-else class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center" v-for='(d, idx) in AnomalyDetectorState.selfHealingDisabled' :key='idx'>
                    {{ d }}
                    <span>
                      <span class="badge badge-primary badge-pill ml-3" title="Self-healing enabled ratio">{{ Number(AnomalyDetectorState.selfHealingEnabledRatio[d] * 100).toFixed(0) }}%</span>
                      <button class="btn btn-sm btn-outline-success ml-2" :disabled="toggleBusy" @click="setSelfHealing(d, true)">Enable</button>
                    </span>
                  </li>
                </ul>
              </td>
            </tr>
            <tr>
              <th>Healing Enabled For</th>
              <td>
                <b v-if='AnomalyDetectorState.selfHealingEnabled.length == 0'>None</b>
                <ul v-else class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center" v-for='(d, idx) in AnomalyDetectorState.selfHealingEnabled' :key='idx'>
                    {{ d }}
                    <span>
                      <span class="badge badge-primary badge-pill ml-3" title="Self-healing enabled ratio">{{ Number(AnomalyDetectorState.selfHealingEnabledRatio[d] * 100).toFixed(0) }}%</span>
                      <button class="btn btn-sm btn-outline-danger ml-2" :disabled="toggleBusy" @click="setSelfHealing(d, false)">Disable</button>
                    </span>
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
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
              <th title="CC reports meanTimeBetweenAnomaliesMs as the mean anomaly rate (per second) x 1000; the mean time between anomalies is 1000 s divided by it">meanTimeBetweenAnomaliesMs (as reported) ❓</th>
              <th>Mean Time Between Anomalies</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in anomalyRates" :key="r.type">
              <td>{{ r.type }}</td>
              <td>{{ r.reported | formatDecimal }}</td>
              <td>{{ r.reported > 0 ? $options.filters.formatDuration(1e6 / r.reported) : 'no anomaly yet' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentDiskFailures && AnomalyDetectorState.recentDiskFailures.length > 0'>
        <h4 class="pointer" @click="toggle('recentDiskFailures')">{{ collapsed.recentDiskFailures ? '▶' : '▼' }} Recent Disk Failures
          <small class="text-muted">({{ AnomalyDetectorState.recentDiskFailures.length }}, latest {{ AnomalyDetectorState.recentDiskFailures[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentDiskFailures" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Failed Disks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentDiskFailures' :key='ridx'>
              <td class="align-middle text-center">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <ul class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center" v-for="(broker, bid) in r.failedDisksByTimeMs" :key='bid'>
                    {{  bid }}
                    <ul class="list-group" v-for="disk in Object.keys(broker)" :key='disk'>
                      <li class="list-group-item d-flex justify-content-between align-items-center">
                        <code>{{ disk }}</code>
                        <span class="badge badge-primary badge-pill ml-3">{{ broker[disk] | formatLocalTime }}</span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </td>
              <td class="align-middle text-center">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentBrokerFailures && AnomalyDetectorState.recentBrokerFailures.length > 0'>
        <h4 class="pointer" @click="toggle('recentBrokerFailures')">{{ collapsed.recentBrokerFailures ? '▶' : '▼' }} Recent Broker Failures
          <small class="text-muted">({{ AnomalyDetectorState.recentBrokerFailures.length }}, latest {{ AnomalyDetectorState.recentBrokerFailures[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentBrokerFailures" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Failed Brokers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentBrokerFailures' :key='ridx'>
              <td class="align-middle text-center">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <ul class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center" v-for="(time, broker) in r.failedBrokersByTimeMs" :key='broker'>
                    {{ broker }}
                    <span class="badge badge-primary badge-pill">{{ time | formatLocalTime }}</span>
                  </li>
                </ul>
              </td>
              <td class="align-middle text-center">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentGoalViolations && AnomalyDetectorState.recentGoalViolations.length > 0'>
        <h4 class="pointer" @click="toggle('recentGoalViolations')">{{ collapsed.recentGoalViolations ? '▶' : '▼' }} Recent Goal Violations
          <small class="text-muted">({{ AnomalyDetectorState.recentGoalViolations.length }}, latest {{ AnomalyDetectorState.recentGoalViolations[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentGoalViolations" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Violated Goals</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ridx) in AnomalyDetectorState.recentGoalViolations" :key='ridx'>
              <td class="align-middle text-center">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <!-- Depedning on the version of CC we use, two types of responses are being sent out -->
                <template v-if='r.hasOwnProperty("violatedGoals")'>
                  <ul class="list-group">
                    <li class="list-group-item list-group-item-danger" v-for="(g, gidx) in r.violatedGoals" :key='gidx'>{{ g }}</li>
                  </ul>
                </template>
                <template v-else>
                  <h5>Fixable</h5>
                  <ul class="list-group" v-if='r.fixableViolatedGoals.length > 0'>
                    <li class="list-group-item list-group-item-success" v-for="(g, gidx) in r.fixableViolatedGoals" :key='gidx'>{{ g }}</li>
                  </ul>
                  <div class="alert alert-info" v-else>None</div>
                  <h5>UnFixable</h5>
                  <ul class="list-group" v-if='r.unfixableViolatedGoals.length > 0'>
                    <li class="list-group-item list-group-item-danger" v-for="(g, gidx) in r.unfixableViolatedGoals" :key='gidx'>{{ g }}</li>
                  </ul>
                  <div class="alert alert-info" v-else>None</div>
                </template>
              </td>
              <td class="align-middle text-center">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentIntraBrokerGoalViolations && AnomalyDetectorState.recentIntraBrokerGoalViolations.length > 0'>
        <h4 class="pointer" @click="toggle('recentIntraBrokerGoalViolations')">{{ collapsed.recentIntraBrokerGoalViolations ? '▶' : '▼' }} Recent Intra-Broker Goal Violations
          <small class="text-muted">({{ AnomalyDetectorState.recentIntraBrokerGoalViolations.length }}, latest {{ AnomalyDetectorState.recentIntraBrokerGoalViolations[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentIntraBrokerGoalViolations" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Violated Intra-Broker Goals</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ridx) in AnomalyDetectorState.recentIntraBrokerGoalViolations" :key='ridx'>
              <td class="align-middle text-center" :title="r.anomalyId">{{ r.detectionMs | formatLocalTime }}</td>
              <td>
                <h5>Fixable</h5>
                <ul class="list-group" v-if='r.fixableViolatedGoals && r.fixableViolatedGoals.length > 0'>
                  <li class="list-group-item list-group-item-success" v-for="(g, gidx) in r.fixableViolatedGoals" :key='gidx'>{{ g }}</li>
                </ul>
                <div class="alert alert-info" v-else>None</div>
                <h5>UnFixable</h5>
                <ul class="list-group" v-if='r.unfixableViolatedGoals && r.unfixableViolatedGoals.length > 0'>
                  <li class="list-group-item list-group-item-danger" v-for="(g, gidx) in r.unfixableViolatedGoals" :key='gidx'>{{ g }}</li>
                </ul>
                <div class="alert alert-info" v-else>None</div>
              </td>
              <td class="align-middle text-center">{{ r.status }}<div v-if="r.statusUpdateMs" class="small text-muted">{{ r.statusUpdateMs | formatLocalTime }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentMetricAnomalies && AnomalyDetectorState.recentMetricAnomalies.length > 0'>
        <h4 class="pointer" @click="toggle('recentMetricAnomalies')">{{ collapsed.recentMetricAnomalies ? '▶' : '▼' }} Recent Metric Anomalies
          <small class="text-muted">({{ AnomalyDetectorState.recentMetricAnomalies.length }}, latest {{ AnomalyDetectorState.recentMetricAnomalies[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentMetricAnomalies" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentMetricAnomalies' :key='ridx'>
              <td class="align-middle text-center">{{ r.detectionMs | formatLocalTime }}</td>
              <td>{{ r.description }}</td>
              <td class="align-middle text-center">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if='AnomalyDetectorState.recentTopicAnomalies && AnomalyDetectorState.recentTopicAnomalies.length > 0'>
        <h4 class="pointer" @click="toggle('recentTopicAnomalies')">{{ collapsed.recentTopicAnomalies ? '▶' : '▼' }} Recent Topic Anomalies
          <small class="text-muted">({{ AnomalyDetectorState.recentTopicAnomalies.length }}, latest {{ AnomalyDetectorState.recentTopicAnomalies[0].detectionMs | formatLocalTime }})</small>
        </h4>
        <table v-show="!collapsed.recentTopicAnomalies" class="table table-sm table-bordered">
          <thead>
            <tr>
              <th>DetectionTime</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for='(r, ridx) in AnomalyDetectorState.recentTopicAnomalies' :key='ridx'>
              <td class="align-middle text-center">{{ r.detectionMs | formatLocalTime }}</td>
              <td>{{ r.description }}</td>
              <td class="align-middle text-center">{{ r.status }}</td>
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
