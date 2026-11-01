<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- Auto-refresh interval picker (v-model: the interval in ms, 0 = off) -->
<template>
  <segmented-control :value="value" :options="choices" aria-label="Auto-Refresh" @input="$emit('input', $event)"><i class="bi bi-arrow-repeat"></i> Auto</segmented-control>
</template>

<script>
import { AUTO_REFRESH_OPTIONS } from '@/autoRefresh'
import SegmentedControl from '@/components/SegmentedControl'

export default {
  name: 'AutoRefresh',
  components: {
    SegmentedControl
  },
  props: {
    value: { type: Number, required: true }
  },
  computed: {
    choices () {
      return AUTO_REFRESH_OPTIONS.map(o => ({ value: o.ms, label: o.label, title: o.ms ? 'Refresh every ' + o.label : 'No auto-refresh' }))
    }
  }
}
</script>
