<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- The refresh button of a page toolbar: spins while the page loads and tells how old the data is. label names what
     it refreshes (title and aria-label); the button itself reads "Refresh". -->
<template>
  <button type="button" class="btn refresh-btn" :disabled="loading" :title="label" :aria-label="label" @click="$emit('click')">
    <i :class="['bi', 'bi-arrow-clockwise', { spinning: loading }]"></i>
    <span>{{ loading ? 'Refreshing' : 'Refresh' }}</span>
    <span v-if="age && !loading" class="refresh-age">{{ age }}</span>
  </button>
</template>

<script>
export default {
  name: 'RefreshButton',
  props: {
    label: { type: String, required: true },
    loading: Boolean
  },
  data () {
    return {
      updatedAt: this.loading ? null : Date.now(),
      now: Date.now()
    }
  },
  computed: {
    age () {
      if (!this.updatedAt) return ''
      const s = Math.max(0, Math.round((this.now - this.updatedAt) / 1000))
      if (s < 10) return 'just now'
      if (s < 60) return s + 's ago'
      if (s < 3600) return Math.floor(s / 60) + 'm ago'
      return Math.floor(s / 3600) + 'h ago'
    }
  },
  watch: {
    loading (n, o) {
      if (o && !n) {
        this.updatedAt = Date.now()
        this.now = this.updatedAt
      }
    }
  },
  mounted () {
    this.timer = setInterval(() => { this.now = Date.now() }, 5000)
  },
  beforeDestroy () {
    clearInterval(this.timer)
  }
}
</script>
