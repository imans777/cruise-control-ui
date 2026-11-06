<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- Cruise Control answered "still computing" (202): the progress of each step; the page asks again by itself.
       taskId and the default slot (e.g. a "Check now" button) go in the header. -->
  <div class="card async-card">
    <div class="card-header async-head">
      <span class="spinner-border spinner-border-sm text-primary"></span>
      <span>Cruise Control is still computing</span>
      <span v-if="isParsed" class="small text-muted font-weight-normal">{{ Math.round(totalCompletion) }}% &middot; {{ seconds(totalTime) }}</span>
      <span class="ml-auto d-flex align-items-center async-actions">
        <code v-if="taskId" class="small" title="User-Task-ID">{{ taskId }}</code>
        <slot></slot>
      </span>
    </div>
    <div class="card-body">
      <p class="small text-muted mb-2">This request takes longer than usual (building the cluster model, for one); the page asks again every few seconds.</p>
      <pre v-if="!isParsed" class="mb-0">{{ asyncData }}</pre>
      <template v-else>
        <div class="progress mb-3"><div class="progress-bar progress-bar-striped progress-bar-animated" :style="{ width: totalCompletion + '%' }"></div></div>
        <div v-for="(step, idx) in steps" :key="idx" class="async-step">
          <i :class="['bi', step.completionPercentage >= 100 ? 'bi-check-circle-fill text-success' : 'bi-hourglass-split text-primary']"></i>
          <div class="async-step-text">
            <b>{{ humanize(step.step) }}</b>
            <small class="text-muted">{{ step.description }}<template v-if="steps.length > 1 && step.label"> &middot; {{ step.label }}</template></small>
          </div>
          <span class="small text-muted text-nowrap">{{ step.completionPercentage }}% &middot; {{ seconds(step['time-in-ms']) }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AsyncTask',
  props: {
    asyncData: [String, Object],
    taskId: String
  },
  methods: {
    // "GeneratingClusterModel" -> "Generating cluster model"
    humanize (step) {
      const words = String(step || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
      return words.charAt(0).toUpperCase() + words.slice(1)
    },
    seconds (ms) {
      const v = Number(ms) || 0
      return v < 1000 ? v + ' ms' : (v / 1000).toFixed(1) + ' s'
    },
    checkNow () {
      this.$emit('CheckAsyncResponse')
    }
  },
  computed: {
    isParsed () {
      return !!this.asyncData && typeof this.asyncData === 'object' && Object.prototype.hasOwnProperty.call(this.asyncData, 'progress')
    },
    steps () {
      if (!this.isParsed) {
        return []
      }
      const steps = []
      this.asyncData.progress.forEach((op) => {
        if (Object.prototype.hasOwnProperty.call(op, 'operationProgress')) {
          op.operationProgress.forEach((step) => {
            steps.push({
              label: op.operation,
              step: step.step,
              completionPercentage: step.completionPercentage,
              description: step.description,
              'time-in-ms': step['time-in-ms']
            })
          })
        } else {
          steps.push({
            label: 'Async Task',
            step: op.step,
            completionPercentage: op.completionPercentage,
            description: op.description,
            'time-in-ms': op['time-in-ms']
          })
        }
      })
      return steps
    },
    totalCompletion () {
      if (this.steps.length === 0) return 0
      let total = 0
      this.steps.forEach((s) => { total += s.completionPercentage })
      return total / this.steps.length
    },
    totalTime () {
      let total = 0
      this.steps.forEach((s) => { total += s['time-in-ms'] })
      return total
    }
  }
}
</script>
