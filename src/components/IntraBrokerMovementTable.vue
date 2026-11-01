<template>
  <div class="movement-table" v-if="!hideEmpty || movements.length">
    <!-- the title and the filter float over a long table -->
    <div v-sticky class="movement-head">
      <h4>{{ title }} <span class="count-pill">{{ movements.length }}</span></h4>
      <div v-if="movements.length > 1" class="movement-tools">
        <span v-if="!parsedFilter.empty" class="small text-muted">{{ filteredMovements.length }} of {{ movements.length }}</span>
        <input type="text" class="form-control form-control-sm filter-input" v-model="filter" placeholder="Filter: broker ids (e.g. 1, 3) or topic" title="Comma- or space-separated: a number matches the movements on a broker whose id contains it or with such a broker among the replicas, any other text a part of the topic">
      </div>
    </div>
    <div v-if="!movements.length" class="movement-none">None.</div>
    <table v-else :class="tableClass">
      <thead :class="theadClass">
        <tr>
          <th>Topic</th>
          <th>Partition</th>
          <th>Broker ID</th>
          <th title="All the replicas of the partition, as Kafka lists them. Highlighted with the disk icon: the one moving to another disk (on the broker of the Broker ID column)">Replicas <i class="bi bi-question-circle help-icon"></i></th>
          <th v-if="hasLogdirs">Logdir Move</th>
          <th v-if="hasProgress">Data Movement Progress</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(h, idx) in filteredMovements" :key="idx">
          <td><hit-text :text="h.proposal.topicPartition.topic" :filter="parsedFilter" /></td>
          <td>{{ h.proposal.topicPartition.partition }}</td>
          <td :data-ids="String(h.brokerId)"><span :class="['id-pill', { hit: parsedFilter.hitId(h.brokerId) }]">{{ h.brokerId }}</span></td>
          <td :data-ids="replicas(h).join(', ')">
            <span class="id-list"><span v-for="(r, idx) in replicas(h)" :key="idx" :class="['id-pill', { moving: String(r) === String(h.brokerId), hit: parsedFilter.hitId(r) }]" :title="String(r) === String(h.brokerId) ? 'Moves to another disk' : null"><i v-if="String(r) === String(h.brokerId)" class="bi bi-device-hdd"></i>{{ r }}</span></span>
          </td>
          <td v-if="hasLogdirs">
            <logdir-moves v-if="h.proposal.newReplicaLogdirs" :proposal="h.proposal" :broker-id="h.brokerId" :filter="parsedFilter" />
          </td>
          <td v-if="hasProgress"><task-progress :task="h" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import LogdirMoves from '@/components/LogdirMoves'
import TaskProgress from '@/components/TaskProgress'
import { parseFilter, matchesFilter } from '@/brokerFilter'

export default {
  name: 'IntraBrokerMovementTable',
  components: {
    LogdirMoves,
    TaskProgress
  },
  props: {
    title: { type: String, required: true },
    movements: { type: Array, default: () => [] },
    hideEmpty: { type: Boolean, default: false },
    tableClass: { type: String, default: 'table table-sm table-bordered' },
    theadClass: { type: String, default: 'thead-light' }
  },
  data () {
    return {
      filter: ''
    }
  },
  methods: {
    // Kafka's order (a disk move keeps it; CC's newReplicas may list the leader first)
    replicas (m) {
      return m.proposal.oldReplicas || m.proposal.newReplicas || []
    }
  },
  computed: {
    // a broker matches the movements on it and the ones of the partitions it is a replica of
    parsedFilter () {
      return parseFilter(this.filter)
    },
    filteredMovements () {
      return this.movements.filter(m => matchesFilter(this.parsedFilter, [m.brokerId].concat(this.replicas(m)), [m.proposal.topicPartition.topic]))
    },
    hasLogdirs () {
      return this.movements.some(m => m.proposal && m.proposal.newReplicaLogdirs)
    },
    hasProgress () {
      return this.movements.some(m => m.movedDataInMB !== undefined && m.movedDataInMB !== null)
    }
  }
}
</script>

<style scoped>
.filter-input { min-width: 300px; }
</style>
