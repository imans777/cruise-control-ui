<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-if='!loading && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>
    <div v-sticky class="toolbar">
      <label class="chip-check"><input type="checkbox" v-model="allow_capacity_estimation" :disabled="loading"> Allow Capacity Estimation</label>
      <label class="chip-check"><input type="checkbox" v-model="populate_disk_info" :disabled="loading"> Populate Disk Info</label>
      <refresh-button class="ml-2" label="Refresh Kafka Cluster Load" :loading="loading" @click="getLoad()" />
    </div>
    <div v-if='error'>
      <exception :exception='errorData'>
        "Not enough valid windows": Cruise Control has not collected enough metrics yet, try again in a few minutes.
        "Broker does not exist": try without Populate Disk Info.
      </exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData' :task-id="taskId">
        <button v-if='showAsyncRefreshButton' class="btn btn-sm btn-outline-secondary" @click='getLoad()'><i class="bi bi-arrow-clockwise"></i> Check now</button>
      </async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <loading-state />
    </div>

    <div v-else>
      <!-- one section open at a time -->
      <div v-for="sec in sections" :key="sec.key" class="card mb-2 load-section">
        <button type="button" :class="['section-toggle', { open: openSection === sec.key }]" :aria-expanded="openSection === sec.key ? 'true' : 'false'" @click="openSection = openSection === sec.key ? '' : sec.key">
          <span class="stat-icon"><i :class="['bi', sec.icon]"></i></span>
          {{ sec.title }}
          <small class="text-muted font-weight-normal">{{ sec.hint }}</small>
          <i class="bi bi-chevron-right chevron"></i>
        </button>
        <div v-show="openSection === sec.key" class="card-body">
          <broker-load v-if="sec.key === 'brokers'" :brokers="brokers" :loading="loading" :error="error" :errorData="errorData" />
          <!-- TODO: it's better to unify broker-load and host-load -->
          <host-load v-else :hosts="hosts" :loading="loading" :error="error" :errorData="errorData" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import HostLoad from '@/components/HostLoad'
import BrokerLoad from '@/components/BrokerLoad'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

export default {
  name: 'Load',
  props: {
    group: String,
    cluster: String,
    rawdata: Object
  },
  data () {
    return {
      loading: false,
      loaded: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      // params
      allow_capacity_estimation: true,
      populate_disk_info: true,
      // broker load & host load
      sections: [
        { key: 'brokers', icon: 'bi-hdd-stack', title: 'Kafka Broker Load', hint: 'per broker, or per disk' },
        { key: 'hosts', icon: 'bi-pc-display', title: 'Kafka Server Load', hint: 'per host' }
      ],
      openSection: 'brokers',
      brokers: [],
      hosts: [],
      showAsyncRefreshButton: false,
      detectedUserTaskId: false // true in case the response has user-task-id
    }
  },
  created () {
    if (this.rawdata) {
      this.brokers = this.rawdata.brokers
      this.hosts = this.rawdata.hosts
    } else {
      this.argsChanged()
    }
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
    // a flag takes effect right away
    allow_capacity_estimation () {
      this.getLoad()
    },
    populate_disk_info () {
      this.getLoad()
    },
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  computed: {
    taskId () {
      return this.$store.getters.getTaskId(this.url)
    },
    url () {
      // KCC Supports additional parameters as well.
      // time=[TIMESTAMP]
      // allow_capacity_estimation=[true/false]
      // populate_disk_info=[true/false]
      const params = {
        allow_capacity_estimation: this.allow_capacity_estimation,
        populate_disk_info: this.populate_disk_info
      }
      return this.$helpers.getURL('load', params)
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
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
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      if (!this.rawdata) {
        this.getLoad()
      }
    },
    getLoad () {
      const vm = this
      vm.error = false
      vm.async = false
      vm.loading = true
      const fetchOptions = {}
      const task = this.$store.getters.getTaskId(vm.url)
      if (task) {
        fetchOptions.headers = { 'User-Task-ID': task }
      }
      fetchCC(vm.url, fetchOptions).then((result) => {
        vm.detectedUserTaskId = result.headers.has('user-task-id')
        if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with 200-OK status code. Please file a bug here https://github.com/linkedin/cruise-control/issues'
        } else if (result.type === 'async') {
          vm.loading = false
          const taskId = result.headers.has('user-task-id') ? result.headers.get('user-task-id') : null
          vm.$store.commit('setTaskId', { url: vm.url, taskid: taskId })
          vm.async = true
          vm.asyncData = result.data
          vm.showAsyncRefreshButton = true
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          // Only auto-retry if we have a task ID to poll; without one, each
          // retry starts a new expensive computation on CC.
          if (taskId) {
            vm.asyncRetryTimer = setTimeout(() => vm.getLoad(), ASYNC_RETRY_DELAY)
          }
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.loading = false
          vm.loaded = true
          vm.error = false
          vm.errorData = null
          vm.brokers = result.data.brokers || []
          vm.hosts = result.data.hosts || []
          // Clear the cached task ID so the next refresh fetches fresh data
          // instead of returning the cached result for the old task
          vm.$store.commit('setTaskId', { url: vm.url, taskid: null })
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    }
  },
  components: {
    BrokerLoad,
    HostLoad
  }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s
}
.fade-enter, .fade-leave-to  {
  opacity: 0
}
</style>
