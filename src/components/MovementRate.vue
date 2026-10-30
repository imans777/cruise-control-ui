<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Data movement rate and estimated remaining time of an execution (absent until the progress was observed twice) -->
<template>
  <div class="small mt-1">
    <span class="mr-3">
      <b>Rate:</b>
      <template v-if="rate !== null && rate !== undefined">{{ rate | formatMBRate }}</template>
      <span v-else class="text-muted" title="Reported once the progress of the movements has been observed twice">measuring ...</span>
    </span>
    <span>
      <b title="Estimated from the current rate. A partition written at about its throttle keeps growing and may never catch up, so this estimate can be optimistic.">ETA ❓:</b>
      <template v-if="eta !== null && eta !== undefined">~{{ eta | formatDuration }}</template>
      <span v-else class="text-muted">measuring ...</span>
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
