<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- ExecutorState.recovery: what happened to the latest execution interrupted by a Cruise Control restart -->
<template>
  <div :class="['card', 'mb-3', 'border-' + statusColor]">
    <div :class="['card-header', 'text-white', 'bg-' + statusColor]">
      Interrupted Execution Recovery: <b>{{ recovery.status }}</b>
      <small class="ml-2">(reported until the next execution starts)</small>
    </div>
    <div class="card-body">
      <p class="small text-muted">{{ statusHelp }}</p>
      <table class="table table-sm table-bordered mb-2">
        <tbody>
          <tr><th style="width: 25%">Execution UUID</th><td><code>{{ recovery.uuid }}</code></td></tr>
          <tr><th>Reason</th><td class="response-value">{{ recovery.reason }}</td></tr>
          <tr><th>Triggered By</th><td>{{ recovery.triggeredByUserRequest ? 'user request' : 'self-healing' }}</td></tr>
          <tr><th>Started</th><td>{{ recovery.startTime }}</td></tr>
          <tr><th title="The last checkpoint of the execution's state: it is checkpointed at least every executor.state.checkpoint.interval.ms, so this is about when Cruise Control stopped">Interrupted (Last Checkpoint) <i class="bi bi-question-circle help-icon"></i></th><td>{{ recovery.interruptedTime }}</td></tr>
          <tr><th title="Resumes in a row without completing a task; it starts over once a resumed execution completes a task (resume.interrupted.execution.max.count)">Resume Count <i class="bi bi-question-circle help-icon"></i></th><td>{{ recovery.resumeCount }}</td></tr>
          <tr v-if="recovery.reasonNotResumed"><th>Not Resumed Because</th><td class="response-value">{{ recovery.reasonNotResumed }}</td></tr>
          <tr v-if="recovery.queuedExecutionNotResumed"><th>Queued, Not Resumed</th><td>The {{ queuedLabel }} queued after this execution (<code>{{ recovery.queuedExecutionNotResumed }}</code>): the restart could not queue it again (e.g. it was persisted without its parameters, or this execution is not resumed). Request it again once this execution is done.</td></tr>
          <tr v-if="recovery.queuedExecutionResumed"><th>Queued, Resumed</th><td>The {{ queuedResumedLabel }} queued after this execution (<code>{{ recovery.queuedExecutionResumed }}</code>) is queued again: it starts once the resumed execution completes -- or now, if this execution had completed before the restart.</td></tr>
          <tr v-if="recovery.cleanupDeadline"><th>Cleanup Deadline</th><td>{{ recovery.cleanupDeadline }} <small class="text-muted">(in-flight reassignments and log dir movements still running then are cancelled)</small></td></tr>
          <tr v-if="recovery.error"><th class="text-danger">Error</th><td class="text-danger response-value">{{ recovery.error }}</td></tr>
        </tbody>
      </table>
      <div v-if="actions.length" class="mb-2">
        <h6>Tasks by Recovery Action</h6>
        <span v-for="a in actions" :key="a.action" :class="['badge', 'mr-2', 'p-2', 'badge-' + a.color]" :title="a.help">{{ a.action }}: {{ a.count }}</span>
      </div>
      <div v-if="recovery.inFlightPartitionMovements && recovery.inFlightPartitionMovements.length" class="mb-2">
        <h6>In-Flight Partition Movements ({{ recovery.inFlightPartitionMovements.length }})</h6>
        <code v-for="p in recovery.inFlightPartitionMovements" :key="p" class="mr-2">{{ p }}</code>
      </div>
      <div v-if="recovery.inFlightLogDirMovements && recovery.inFlightLogDirMovements.length" class="mb-2">
        <h6 title="Log dir movements of the interrupted execution that Kafka is still copying: the cleanup waits for them (they keep their log dir throttle), and cancels them at the deadline or on a stop">In-Flight Log Dir Movements ({{ recovery.inFlightLogDirMovements.length }}) <i class="bi bi-question-circle help-icon"></i></h6>
        <ul class="mb-0"><li v-for="p in recovery.inFlightLogDirMovements" :key="p" class="small"><code>{{ p }}</code></li></ul>
      </div>
      <div v-if="recovery.keptThrottles && recovery.keptThrottles.length" class="mb-2">
        <h6 title="Throttles set by someone else (kept), and brokers whose throttles are retained until they are reachable">Kept Throttles <i class="bi bi-question-circle help-icon"></i></h6>
        <ul class="mb-0"><li v-for="(t, i) in recovery.keptThrottles" :key="i" class="small">{{ t }}</li></ul>
      </div>
      <div v-if="recovery.divergences && recovery.divergences.length">
        <h6 title="Differences between the persisted execution and the cluster found at startup">Divergences <i class="bi bi-question-circle help-icon"></i></h6>
        <ul class="mb-0"><li v-for="(d, i) in recovery.divergences" :key="i" class="small">{{ d }}</li></ul>
      </div>
    </div>
  </div>
</template>

<script>
import { queuedExecutionLabel } from '@/ccOptions'

const STATUS = {
  DECIDING: { color: 'info', help: 'Cruise Control is deciding whether to resume the interrupted execution or to clean it up.' },
  RESUMED: { color: 'success', help: 'The interrupted execution was resumed.' },
  WAITING_FOR_IN_FLIGHT_MOVEMENTS: { color: 'warning', help: 'Waiting for the reassignments and log dir movements that were in flight at the restart to finish (until the cleanup deadline).' },
  WAITING_FOR_KAFKA: { color: 'warning', help: 'Waiting for Kafka to be reachable to clean up.' },
  CANCELLING_IN_FLIGHT_MOVEMENTS: { color: 'warning', help: 'Cancelling the reassignments and log dir movements still in flight.' },
  REMOVING_THROTTLES: { color: 'warning', help: 'Removing the throttles the interrupted execution had set.' },
  CLEANED_UP: { color: 'success', help: 'The interrupted execution was cleaned up; nothing is left dangling.' },
  FAILED: { color: 'danger', help: 'The recovery failed; see the error.' },
  RETAINED_FOR_RESTART: { color: 'secondary', help: 'Some cleanup is retained for the next restart (e.g. throttles of brokers that were not reachable).' }
}
const ACTIONS = {
  COMPLETED: { color: 'success', help: 'Done before the restart, or got done meanwhile: nothing to do' },
  ADOPT: { color: 'info', help: 'Submitted to Kafka before the restart and still executing: monitored, not resubmitted' },
  PENDING: { color: 'secondary', help: 'Not started (or its effect is not visible in the cluster): executed if the execution is resumed' },
  ROLLBACK_IN_FLIGHT: { color: 'warning', help: 'Being rolled back before the restart and Kafka is still executing the rollback: waited for' },
  FINISHED_WITH_ERROR: { color: 'danger', help: 'Aborted or dead before the restart: not retried' },
  DROPPED: { color: 'dark', help: 'Partition deleted, or modified by someone else since the task was generated: dropped' }
}

export default {
  name: 'RecoveryCard',
  props: {
    recovery: { type: Object, required: true }
  },
  computed: {
    queuedLabel () {
      return queuedExecutionLabel(this.recovery.queuedExecutionNotResumed)
    },
    queuedResumedLabel () {
      return queuedExecutionLabel(this.recovery.queuedExecutionResumed)
    },
    statusColor () {
      return (STATUS[this.recovery.status] || { color: 'secondary' }).color
    },
    statusHelp () {
      return (STATUS[this.recovery.status] || { help: '' }).help
    },
    actions () {
      const t = this.recovery.tasksByRecoveryAction || {}
      return Object.keys(t).map(a => ({
        action: a,
        count: t[a],
        color: t[a] > 0 ? (ACTIONS[a] || { color: 'light' }).color : 'light',
        help: (ACTIONS[a] || { help: '' }).help
      }))
    }
  }
}
</script>

<style scoped>
.response-value { white-space: pre-wrap; }
</style>
