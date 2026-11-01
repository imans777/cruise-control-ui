<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Kafka Cluster State" :loading="loading" @click="getKafkaState()" />
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
      <!-- statistics -->
      <div class="stat-grid">
        <stat-tile label="Kafka Brokers" icon="bi-hdd-stack" :tone="stats_brokers > 0 ? 'success' : 'danger'" :value="stats_brokers" />
        <stat-tile label="Kafka Topics" icon="bi-collection" :tone="KafkaBrokerState.Summary.Topics > 0 ? 'primary' : 'warning'" :value="KafkaBrokerState.Summary.Topics" />
        <stat-tile label="Leader Partitions" icon="bi-star" :tone="stats_leaders > 0 ? 'primary' : 'danger'" :value="stats_leaders" />
        <stat-tile label="Total Replicas" icon="bi-files" :tone="stats_replicas > 0 ? 'primary' : 'danger'" :value="stats_replicas" />
        <stat-tile label="Avg Replication Factor" icon="bi-layers" :tone="stats_leaders > 0 && stats_replicas / stats_leaders >= 3 ? 'success' : 'info'" :value="stats_leaders > 0 ? Number(stats_replicas / stats_leaders).toFixed(2) : 'N/A'" />
        <stat-tile label="Out Of Sync Replicas" icon="bi-exclamation-triangle" :tone="stats_outofsync === 0 ? 'success' : 'danger'" :value="stats_outofsync" />
        <!-- per broker: max / avg / std, and how even the brokers are -->
        <stat-tile v-for="sp in perBroker" :key="sp.label" wide :label="sp.label" :icon="sp.icon" tone="primary">
          <div class="spread">
            <div><small>max</small>{{ sp.max }}</div>
            <div><small>avg</small>{{ sp.avg }}</div>
            <div><small>std</small>{{ sp.std }}</div>
          </div>
          <template #sub>
            <div class="spread-bar" title="Evenness: the average as a share of the maximum (100% = every broker has the same number)"><span :style="{ width: (sp.evenness || 0) + '%' }"></span></div>
            <div class="d-flex justify-content-between mt-1">
              <span>evenness {{ sp.evenness === null ? 'N/A' : sp.evenness + '%' }}</span>
              <span title="Standard deviation over average: the lower, the more even">std / avg {{ sp.cv === null ? 'N/A' : sp.cv + '%' }}</span>
            </div>
          </template>
        </stat-tile>
        <stat-tile label="Online LogDirs" icon="bi-device-hdd" :tone="stats_online_logdirs === 0 ? 'danger' : 'success'" :value="stats_online_logdirs" />
        <stat-tile label="Offline LogDirs" icon="bi-x-octagon" :tone="stats_offline_logdirs === 0 ? 'success' : 'danger'" :value="stats_offline_logdirs" />
      </div>

      <!-- detailed information -->
      <kafka-broker-state :state='KafkaBrokerState'></kafka-broker-state>
      <!-- one filter for the partition tables below: a broker matches the partitions it is a replica of; it floats over them -->
      <div class="partitions-panel">
        <div v-sticky class="form-inline mb-2">
          <label class="mr-2"><b>Partitions</b></label>
          <input v-model="partitionFilter" type="text" class="form-control form-control-sm filter-input" placeholder="Filter: broker ids (e.g. 1, 3) or topic" title="Comma- or space-separated: a number matches the partitions with a broker id containing it among their replicas, any other text a part of the topic">
        </div>
        <!-- sorted by bad ones on top -->
        <div class="partition-health">
          <kafka-partition-state title='Offline Partitions' successTitle='No Offline Partitions' :partitions='KafkaPartitionState.offline' :filter='partitionFilter' />
          <kafka-partition-state title='With Offline Replicas' successTitle='No With Offline Replicas' :partitions='KafkaPartitionState["with-offline-replicas"]' :filter='partitionFilter' />
          <kafka-partition-state title='Under MinISR Replicas' successTitle='No Under MinISR Replicas' :partitions='KafkaPartitionState["under-min-isr"]' :filter='partitionFilter' />
          <kafka-partition-state title='Under Replicated Partitions' successTitle='No Under Replicated Partitions' :partitions='KafkaPartitionState.urp' :filter='partitionFilter' />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import KafkaBrokerState from '@/components/KafkaBrokerState'
import KafkaPartitionState from '@/components/KafkaPartitionState'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

export default {
  name: 'KafkaClusterState',
  props: {
    group: String,
    cluster: String
  },
  components: {
    KafkaBrokerState,
    KafkaPartitionState
  },
  data () {
    return {
      loaded: false,
      loading: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      partitionFilter: '',
      stats: {
        brokers: 0,
        replicas: 0,
        leaders: 0,
        outofsync: 0
      },
      KafkaPartitionState: {
        offline: [],
        urp: [],
        'with-offline-replicas': [],
        'under-min-isr': []
      },
      KafkaBrokerState: {
        OfflineLogDirsByBrokerId: {},
        ReplicaCountByBrokerId: {},
        OutOfSyncCountByBrokerId: {},
        OnlineLogDirsByBrokerId: {},
        LeaderCountByBrokerId: {},
        OfflineReplicaCountByBrokerId: {},
        Summary: {}
      }
    }
  },
  beforeMount () {
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
    // the leaders and the replicas per broker: max, avg, std, evenness (avg / max) and std / avg, in %
    perBroker () {
      const s = this.KafkaBrokerState.Summary
      const spread = (label, icon, max, avg, std) => {
        max = Number(max)
        avg = Number(avg)
        std = Number(std)
        return {
          label,
          icon,
          max: isNaN(max) ? 'N/A' : max.toFixed(0),
          avg: isNaN(avg) ? 'N/A' : avg.toFixed(1),
          std: isNaN(std) ? 'N/A' : std.toFixed(1),
          evenness: max > 0 ? Math.round(avg / max * 100) : null,
          cv: avg > 0 ? Math.round(std / avg * 100) : null
        }
      }
      return [
        spread('Leaders per Broker', 'bi-star-half', s.MaxLeadersPerBroker, s.AvgLeadersPerBroker, s.StdLeadersPerBroker),
        spread('Replicas per Broker', 'bi-diagram-3', s.MaxReplicasPerBroker, s.AvgReplicasPerBroker, s.StdReplicasPerBroker)
      ]
    },
    url () {
      return this.$helpers.getURL('kafka_cluster_state')
    },
    stats_brokers () {
      return Object.keys(this.KafkaBrokerState.ReplicaCountByBrokerId).length
    },
    stats_leaders () {
      let nleaders = 0
      Object.values(this.KafkaBrokerState.LeaderCountByBrokerId).forEach(function (leaders) {
        nleaders += leaders
      })
      return nleaders
    },
    stats_replicas () {
      let nreplicas = 0
      Object.values(this.KafkaBrokerState.ReplicaCountByBrokerId).forEach(function (replicas) {
        nreplicas += replicas
      })
      return nreplicas
    },
    stats_outofsync () {
      let oos = 0
      Object.values(this.KafkaBrokerState.OutOfSyncCountByBrokerId).forEach(function (n) {
        oos += n
      })
      return oos
    },
    stats_online_logdirs () {
      return Object.values(this.KafkaBrokerState.OnlineLogDirsByBrokerId).flat().length
    },
    stats_offline_logdirs () {
      return Object.values(this.KafkaBrokerState.OfflineLogDirsByBrokerId).flat().length
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
      this.getKafkaState()
    },
    getKafkaState () {
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
          vm.asyncRetryTimer = setTimeout(() => vm.getKafkaState(), ASYNC_RETRY_DELAY)
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
          vm.loaded = true
          const data = result.data
          vm.KafkaPartitionState.offline = data.KafkaPartitionState.offline
          vm.KafkaPartitionState.urp = data.KafkaPartitionState.urp
          vm.KafkaBrokerState.ReplicaCountByBrokerId = data.KafkaBrokerState.ReplicaCountByBrokerId
          vm.KafkaBrokerState.OutOfSyncCountByBrokerId = data.KafkaBrokerState.OutOfSyncCountByBrokerId
          vm.KafkaBrokerState.LeaderCountByBrokerId = data.KafkaBrokerState.LeaderCountByBrokerId
          try {
            vm.KafkaPartitionState['with-offline-replicas'] = data.KafkaPartitionState['with-offline-replicas']
            vm.KafkaPartitionState['under-min-isr'] = data.KafkaPartitionState['under-min-isr']
            vm.KafkaBrokerState.OfflineReplicaCountByBrokerId = data.KafkaBrokerState.OfflineReplicaCountByBrokerId
            vm.KafkaBrokerState.OfflineLogDirsByBrokerId = data.KafkaBrokerState.OfflineLogDirsByBrokerId
            vm.KafkaBrokerState.OnlineLogDirsByBrokerId = data.KafkaBrokerState.OnlineLogDirsByBrokerId
            vm.KafkaBrokerState.Summary = data.KafkaBrokerState.Summary
          } catch (e) {
            // Kafka 2.0 features not available
          }
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
.filter-input { min-width: 300px; }
</style>
