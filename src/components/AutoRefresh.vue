<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Auto-refresh interval picker (v-model: the interval in ms, 0 = off) -->
<template>
  <div class="btn-group" role="group" aria-label="Auto-Refresh">
    <span class="btn btn-outline-secondary disabled">Auto-Refresh</span>
    <button v-for="o in options" :key="o.ms" type="button"
      :class="['btn', value === o.ms ? (o.ms ? 'btn-success' : 'btn-secondary') : 'btn-outline-secondary']"
      @click="$emit('input', o.ms)">{{ o.label }}</button>
  </div>
</template>

<script>
import { AUTO_REFRESH_OPTIONS } from '@/autoRefresh'

export default {
  name: 'AutoRefresh',
  props: {
    value: { type: Number, required: true }
  },
  data () {
    return {
      options: AUTO_REFRESH_OPTIONS
    }
  }
}
</script>
