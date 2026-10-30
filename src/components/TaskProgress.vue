<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- In-flight data movement progress of one execution task (partition.movement.progress.tracking.enabled) -->
<template>
  <div v-if="tracked" class="task-progress">
    <div class="progress" style="height: 14px">
      <div class="progress-bar bg-success" :style="{ width: pct + '%' }">{{ pct.toFixed(0) }}%</div>
    </div>
    <small class="text-muted">
      {{ task.movedDataInMB | formatUnits }} / {{ task.totalDataToMoveInMB | formatUnits }}
      &middot;
      <template v-if="task.dataMovementRateInMBPerSec != null">{{ task.dataMovementRateInMBPerSec | formatMBRate }}</template>
      <template v-else><span title="The rate is reported once the progress has been observed twice">measuring rate ...</span></template>
      <template v-if="eta"> &middot; <span :title="etaHelp">ETA {{ eta }}</span></template>
      <template v-if="task.dataMovementProgressUpdateTimeMs"> &middot; <span :title="'Progress measured at ' + new Date(Number(task.dataMovementProgressUpdateTimeMs)).toLocaleString()">updated {{ task.dataMovementProgressUpdateTimeMs | formatLocalTime }}</span></template>
    </small>
  </div>
  <span v-else class="text-muted small">-</span>
</template>

<script>
export default {
  name: 'TaskProgress',
  props: {
    task: { type: Object, required: true }
  },
  computed: {
    tracked () {
      return this.task.movedDataInMB !== undefined && this.task.movedDataInMB !== null
    },
    // the data left at the measured rate; the rate is growth-based, so a partition written as fast as it is copied never
    // gets closer (the ETA then stays put or grows)
    eta () {
      const rate = Number(this.task.dataMovementRateInMBPerSec)
      if (this.task.dataMovementRateInMBPerSec === null || this.task.dataMovementRateInMBPerSec === undefined || isNaN(rate)) return null
      const left = Math.max(0, Number(this.task.totalDataToMoveInMB) - Number(this.task.movedDataInMB))
      if (left === 0) return 'done'
      if (!(rate > 0)) return 'none (no progress)'
      return '~' + this.$options.filters.formatDuration(left / rate * 1000)
    },
    etaHelp () {
      return 'Data left / measured rate. The rate counts how fast the copy grows: for a partition written about as fast as it is copied, the ETA can stay put or grow.'
    },
    pct () {
      const total = Number(this.task.totalDataToMoveInMB)
      if (!total) return 0
      return Math.min(100, Number(this.task.movedDataInMB) / total * 100)
    }
  }
}
</script>

<style scoped>
.task-progress { min-width: 180px; }
</style>
