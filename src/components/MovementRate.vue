<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Data movement rate and estimated remaining time of an execution (absent until the progress was observed twice) -->
<template>
  <div class="movement-rate">
    <span><i class="bi bi-speedometer"></i>
      <template v-if="rate !== null && rate !== undefined">{{ rate | formatMBRate }}</template>
      <span v-else title="Reported once the progress of the movements has been observed twice">measuring the rate ...</span>
    </span>
    <span title="Estimated from the current rate. A partition written at about its throttle keeps growing and may never catch up, so this estimate can be optimistic."><i class="bi bi-hourglass-split"></i>
      <template v-if="eta !== null && eta !== undefined">about {{ eta | formatDuration }} left</template>
      <span v-else>measuring the time left ...</span>
      <i class="bi bi-question-circle help-icon"></i>
    </span>
  </div>
</template>

<script>
export default {
  name: 'MovementRate',
  props: {
    rate: { type: Number, default: null }, // MB/s
    eta: { type: Number, default: null } // ms
  }
}
</script>

<style scoped>
.movement-rate { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 5px; color: var(--muted); font-size: 0.8rem; }
.movement-rate .bi:first-child { margin-right: 3px; color: var(--primary); }
</style>
