<template>
  <div class="card-deck mb-3" v-if="!hideEmpty || movements.length">
    <h4>{{ title }} ({{ movements.length }})</h4>
    <div v-if="movements.length > 1" class="form-inline mb-2">
      <input type="text" class="form-control form-control-sm filter-input" v-model="filter" placeholder="Filter: broker ids (e.g. 1, 3) or topic" title="Comma- or space-separated: a number matches the movements on that broker or with that broker among the replicas, any other text a part of the topic">
    </div>
    <table :class="tableClass">
      <thead :class="theadClass">
        <tr>
          <th>Topic</th>
          <th>Partition</th>
          <th>Broker ID</th>
          <th title="All the replicas of the partition (the one moving is on the broker of the Broker ID column)">Replicas ❓</th>
          <th v-if="hasLogdirs">Logdir Move</th>
          <th v-if="hasProgress">Data Movement Progress</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(h, idx) in filteredMovements" :key="idx">
          <td>{{ h.proposal.topicPartition.topic }}</td>
          <td>{{ h.proposal.topicPartition.partition }}</td>
          <td>{{ h.brokerId }}</td>
          <td>{{ (h.proposal.newReplicas || h.proposal.oldReplicas || []).join(', ') }}</td>
          <td v-if="hasLogdirs">
            <logdir-moves v-if="h.proposal.newReplicaLogdirs" :proposal="h.proposal" :broker-id="h.brokerId" />
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
  computed: {
    // a broker matches the movements on it and the ones of the partitions it is a replica of
    filteredMovements () {
      const f = parseFilter(this.filter)
      return this.movements.filter(m => matchesFilter(f, [m.brokerId].concat(m.proposal.newReplicas || m.proposal.oldReplicas || []), [m.proposal.topicPartition.topic]))
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
