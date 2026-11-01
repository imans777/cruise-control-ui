<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- The logdir changes of a proposal (oldReplicaLogdirs -> newReplicaLogdirs). The maps list every replica: only the
     brokers whose logdir changes are shown, one line each. -->
<template>
  <div class="logdir-moves">
    <!-- data-move: the move as text ("2: /d4 -> /d2"), for scripts -->
    <div v-for="m in moves" :key="m.broker" class="logdir-move" :data-move="m.broker + ': ' + (m.from || (m.isNew ? 'new replica' : 'unknown')) + ' → ' + m.to">
      <span :class="['id-pill', { hit: filter && filter.hitId(m.broker) }]">{{ m.broker }}</span>
      <code v-if="m.from">{{ m.from }}</code><span v-else class="text-muted">{{ m.isNew ? 'new replica' : 'unknown' }}</span>
      <i class="bi bi-arrow-right move-arrow"></i> <code>{{ m.to }}</code>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LogdirMoves',
  props: {
    proposal: { type: Object, required: true },
    // only this broker (intra-broker execution tasks)
    brokerId: { type: [Number, String], default: null },
    // the table's filter (parseFilter): the brokers it picks are highlighted
    filter: { type: Object, default: null }
  },
  computed: {
    moves () {
      const before = this.proposal.oldReplicaLogdirs || {}
      const after = this.proposal.newReplicaLogdirs || {}
      const oldReplicas = (this.proposal.oldReplicas || []).map(String)
      return Object.keys(after)
        .filter(b => this.brokerId === null || String(b) === String(this.brokerId))
        .filter(b => before[b] !== after[b])
        .map(b => ({ broker: b, from: before[b], to: after[b], isNew: !oldReplicas.includes(String(b)) }))
        .sort((x, y) => Number(x.broker) - Number(y.broker))
    }
  }
}
</script>

<style scoped>
.logdir-moves { white-space: nowrap; font-size: 90%; }
.logdir-move { display: flex; align-items: center; gap: 7px; margin: 2px 0; }
.move-arrow { color: var(--muted); font-size: 0.8em; }
</style>
