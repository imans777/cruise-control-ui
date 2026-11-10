<template>
  <div>
    <div class="rd-toolbar">
      <h4 class="mb-0 mr-auto">{{ resourceOptions.find(o => o.value === resource).label }} of each topic, per broker</h4>
      <input type="text" class="form-control form-control-sm rd-filter" v-model="filter" placeholder="Filter topics" :disabled="stacked" :title="stacked ? 'The stacked view shows every topic' : null">
      <segmented-control v-model="resource" :options="resourceOptions" aria-label="Resource" />
      <label class="chip-check"><input type="checkbox" v-model="stacked"> Stacked view</label>
    </div>

    <div v-if="error">
      <exception :exception='error'></exception>
    </div>

    <div class="row" v-show="stacked">
      <div class="col-8 mx-auto">
        <div class="card mx-4 mt-4">
          <div class="card-inner" style="height:500px;">
            <LineChart
              v-bind:style="{
                height: '100%',
                width: '100%',
                position: 'relative'
              }"
              :chart-data="formatStackedData"
              :options="getStackedOptions"
            ></LineChart>
          </div>
        </div>
      </div>
    </div>

    <div
      class="row mx-auto"
      v-show="!stacked"
    >
      <div
        class="col-4"
        v-for="item in cachedKccData"
        v-bind:key="item[0]"
        v-show="item[0].toLowerCase().includes(filter.toLowerCase())"
      >
        <div class="card mt-4">
          <div class="card-inner">
            <LineChart
              :chart-data="formatItemData(item)"
              :options="formatItemOptions(item)"
            ></LineChart>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import LineChart from '@/components/LineChart.vue'
import SegmentedControl from '@/components/SegmentedControl'
import { ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

class Topic {
  constructor () {
    this.leaders = {}
    this.replicas = {}
    this.cpu = {}
    this.replicationFactor = 0
    this.disk = 0
  }

  addLeader (item) {
    const broker = item.leader
    if (this.leaders[broker] === undefined) {
      this.leaders[broker] = 1
      return
    }
    this.leaders[broker]++
  }

  addReplicas (item) {
    const replicas = Object.values(item.followers)
    replicas.push(item.leader)

    replicas.forEach(follower => {
      if (this.replicas[follower] === undefined) {
        this.replicas[follower] = 1
        return
      }
      this.replicas[follower]++
    })
  }

  countCpu (item) {
    if (this.cpu[item.leader] === undefined) {
      this.cpu[item.leader] = item.cpu
      return
    }
    this.cpu[item.leader] += item.cpu
  }

  countDisk (item) {
    const replicationFactor = item.followers.length + 1
    this.disk += item.disk * replicationFactor
  }

  getSize () {
    const decimals = 2
    if (this.disk === 0) return '0 MiB'
    const k = 1024
    const sizes = ['MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    let i
    if (this.disk <= 1) {
      i = 0
    } else {
      i = Math.floor(Math.log(this.disk) / Math.log(k))
    }
    return parseFloat((this.disk / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  }
}

export default {
  name: 'ResourceDistributionChart',
  components: {
    LineChart,
    SegmentedControl
  },

  props: {
    group: String,
    cluster: String
  },

  data () {
    return {
      resource: 'leaders',
      resourceOptions: [{ value: 'leaders', label: 'Leaders' }, { value: 'replicas', label: 'Replicas' }, { value: 'cpu', label: 'CPU' }],
      stacked: false,
      filter: '',
      cachedKccData: [],
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      error: null,
      brokerList: []
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

  mounted () {
    this.moptions = this.getOptions('test')
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
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.fetchKccData()
    },
    fetchKccData () {
      const vm = this
      vm.error = null
      vm.cachedKccData = []
      vm.brokerList = []
      const topicMap = {}
      const url = vm.$helpers.getURL('partitionload', {})
      fetchCC(url).then(function (result) {
        if (result.type === 'error') {
          vm.error = result.data
          return
        }
        if (result.type !== 'success' || !result.data || !result.data.records) {
          return
        }
        const brokerList = new Set()
        for (const record of result.data.records) {
          if (!topicMap[record.topic]) {
            topicMap[record.topic] = new Topic()
          }
          const topic = topicMap[record.topic]
          topic.addLeader(record)
          topic.addReplicas(record)
          topic.countCpu(record)
          topic.countDisk(record)
          topic.replicationFactor = Math.max(topic.replicationFactor, record.followers.length + 1)
          brokerList.add(record.leader)
          record.followers.forEach(f => brokerList.add(f))
        }
        vm.brokerList = [...brokerList].sort()
        vm.cachedKccData = Object.entries(topicMap)
          .sort((a, b) => a[1].disk > b[1].disk ? -1 : 1)
      }).catch(function (error) {
        vm.error = error && error.message ? error.message : error
      })
    },
    formatItemData (item) {
      const resources = item[1][this.resource]
      return {
        datasets: [{
          data: [...Object.values(resources)],
          backgroundColor: 'rgba(129, 140, 248, 0.55)',
          borderColor: 'rgba(129, 140, 248, 0.95)',
          borderWidth: 1
        }],
        labels: [...Object.keys(resources)].map(e => 'broker ' + e)
      }
    },
    formatItemOptions (item) {
      const title = `${item[0]} (RF ${item[1].replicationFactor}, size ${item[1].getSize()})`
      return this.getOptions(title)
    },
    getOptions (title) {
      const options = {
        legend: {
          display: false
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              // counts are whole numbers
              precision: this.resource === 'cpu' ? undefined : 0
            },
            scaleLabel: {
              labelString: this.resource === 'cpu' ? '% cpu' : `nb ${this.resource}`,
              display: true
            }
          }]
        },
        title: {
          display: true,
          text: title
        }
      }
      return options
    },
    setResource (resource) {
      this.resource = resource
    }
  },

  computed: {
    formatStackedData () {
      const stackedKccData = {
        labels: this.brokerList,
        datasets: []
      }

      if (!this.cachedKccData || this.cachedKccData.length === 0) {
        return stackedKccData
      }

      let counter = 0
      for (const topic of this.cachedKccData) {
        const dataset = {
          label: topic[0],
          data: [],
          backgroundColor: this.$store.state.chartColors[counter]
        }
        counter++
        counter = counter % this.$store.state.chartColors.length
        for (const broker of this.brokerList) {
          const value = (topic[1][this.resource][broker] !== undefined) ? topic[1][this.resource][broker] : 0
          dataset.data.push(value)
        }
        stackedKccData.datasets.push(dataset)
      }

      return stackedKccData
    },

    getStackedOptions () {
      const options = this.getOptions(`stacked ${this.resource} view`)
      options.scales.xAxes = [{ stacked: true }]
      options.scales.yAxes[0].stacked = true
      options.scales.yAxes[0].scaleLabel.labelString = this.resource === 'cpu' ? '% cpu' : `nb ${this.resource}`
      options.maintainAspectRatio = false
      options.responsive = true
      options.legend = {
        display: true,
        position: 'bottom'
      }
      return options
    }
  }
}
</script>

<style scoped>
.rd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 1rem; }
.rd-filter { width: 240px; }
</style>
