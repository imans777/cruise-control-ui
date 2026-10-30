<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- A throttle in a unit of choice; v-model is the throttle in bytes/second (CC's unit), or null when empty. -->
<template>
  <div>
    <div class="input-group input-group-sm">
      <input type="number" class="form-control" :min="min" step="any" v-model="amount" :placeholder="placeholder" @input="emit">
      <div class="input-group-append">
        <select class="custom-select custom-select-sm" v-model="unit" @change="emit">
          <option v-for="u in units" :key="u.label" :value="u.label">{{ u.label }}</option>
        </select>
      </div>
    </div>
    <small v-if="bytes !== null" class="form-text text-muted mt-0">= {{ bytes | formatNumber }} bytes/s</small>
  </div>
</template>

<script>
const UNITS = [
  { label: 'B/s', factor: 1 },
  { label: 'KB/s', factor: 1024 },
  { label: 'MB/s', factor: 1024 * 1024 },
  { label: 'GB/s', factor: 1024 * 1024 * 1024 }
]

export default {
  name: 'ThrottleInput',
  props: {
    value: { type: Number, default: null },
    min: { type: Number, default: 0 },
    placeholder: { type: String, default: '(CC Default)' }
  },
  data () {
    return {
      amount: '',
      unit: 'MB/s',
      units: UNITS
    }
  },
  computed: {
    bytes () {
      if (this.amount === '' || this.amount === null || isNaN(Number(this.amount))) return null
      const factor = UNITS.find(u => u.label === this.unit).factor
      return Math.round(Number(this.amount) * factor)
    }
  },
  watch: {
    value (n) {
      // the parent cleared the value (e.g. "Show All Options" turned off)
      if (n === null && this.bytes !== null) this.amount = ''
    }
  },
  methods: {
    emit () {
      this.$emit('input', this.bytes)
    }
  }
}
</script>
