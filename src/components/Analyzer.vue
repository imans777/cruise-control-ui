<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Analyzer State" :loading="loading" @click="getState()" />
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
        <stat-tile label="Analyzer" icon="bi-lightbulb" :tone="AnalyzerState.isProposalReady ? 'success' : 'info'">
          <span :class="['badge', AnalyzerState.isProposalReady ? 'badge-success' : 'badge-info']">{{ !AnalyzerState.isProposalReady ? 'PROPOSAL_NOT_READY' : 'PROPOSALS_READY' }}</span>
        </stat-tile>
        <stat-tile v-if="AnalyzerState.goalReadiness.length" label="Goals Ready" icon="bi-bullseye" :tone="readyGoals === AnalyzerState.goalReadiness.length ? 'success' : 'warning'">
          {{ readyGoals }} <small class="text-muted">/ {{ AnalyzerState.goalReadiness.length }}</small>
          <template #sub>
            <div class="progress"><div :class="['progress-bar', readyGoals === AnalyzerState.goalReadiness.length ? 'bg-success' : null]" :style="{ width: (readyGoals / AnalyzerState.goalReadiness.length * 100) + '%' }"></div></div>
          </template>
        </stat-tile>
      </div>
      <div>
        <div v-if='AnalyzerState.goalReadiness.length > 0'>
          <table class="table table-sm table-bordered">
            <thead class="thead-light">
              <tr>
                <th>Goal</th>
                <th>Status</th>
                <th>Include All Topics</th>
                <th title="The share of the partitions the goal needs monitored before it can run">Min Monitored Partitions <i class="bi bi-question-circle help-icon"></i></th>
                <th>Required Snapshots</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in AnalyzerState.goalReadiness" :key="idx">
                <td>{{ r.name }}</td>
                <td><boolean-el :label='r.status' /></td>
                <td><boolean-el :label='r.modelCompleteRequirement.includeAllTopics' /></td>
                <td><value-cell :value="r.modelCompleteRequirement.minMonitoredPartitionsPercentage" :text="(Number(r.modelCompleteRequirement.minMonitoredPartitionsPercentage) * 100).toFixed(0) + ' %'" /></td>
                <td>{{ r.modelCompleteRequirement.requiredNumSnapshots }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BooleanEL from '@/components/BooleanEL'
import AutoRefresh from '@/components/AutoRefresh'
import { autoRefreshMixin } from '@/autoRefresh'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

export default {
  name: 'Analyzer',
  mixins: [autoRefreshMixin],
  props: {
    group: String,
    cluster: String
  },
  components: {
    'boolean-el': BooleanEL,
    AutoRefresh
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
      AnalyzerState: {
        isProposalReady: false,
        readyGoals: [],
        goalReadiness: []
      }
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    this.stopAutoRefresh()
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
    // the goals whose status is ready (as BooleanEL reads it)
    readyGoals () {
      return this.AnalyzerState.goalReadiness.filter(r => r.status === true || (typeof r.status === 'string' && /^ready/i.test(r.status))).length
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    url () {
      return this.$helpers.getURL('state', { substates: 'ANALYZER', verbose: true })
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
          const defaults = { isProposalReady: false, readyGoals: [], goalReadiness: [] }
          vm.$set(vm, 'AnalyzerState', Object.assign(defaults, result.data.AnalyzerState))
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
