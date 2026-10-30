<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div class="alert alert-info" v-if='!hideHelperURL'>
      <b>URL ({{group}}, {{cluster}}):</b> <a target=_blank :href='url'>{{ url }}</a>
    </div>
    <div class="alert alert-primary text-right">
      <button class="btn btn-primary" :disabled='loading' @click='getState()'>Refresh Executor State</button>
      <auto-refresh v-model='autoRefreshMs' class="ml-1" />
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div> Loading ...</div>
    </div>
    <div v-else>
      <!-- Executor: the state; what triggered the ongoing execution (task ids and reason) behind one toggle -->
      <div class="card mb-3">
        <div class="card-header">Executor</div>
        <div class="card-body py-2">
          <div class="text-center">
            <span :class="['badge', stateBadgeClass]">{{ ExecutorState.state }}</span>
            <button v-if="hasTriggeredTaskInfo" type="button" class="btn btn-sm btn-outline-secondary ml-2 py-0" @click="showTriggeredTaskInfo = !showTriggeredTaskInfo">
              {{ showTriggeredTaskInfo ? '▼' : '▶' }} Triggered Task
            </button>
          </div>
          <p class="card-text small text-muted mb-0 text-center" v-if="ExecutorState.recentlyRemovedBrokers && ExecutorState.recentlyRemovedBrokers.length">Recently removed brokers: {{ ExecutorState.recentlyRemovedBrokers }}</p>
          <p class="card-text small text-muted mb-0 text-center" v-if="ExecutorState.recentlyDemotedBrokers && ExecutorState.recentlyDemotedBrokers.length">Recently demoted brokers: {{ ExecutorState.recentlyDemotedBrokers }}</p>
          <table v-if="hasTriggeredTaskInfo && showTriggeredTaskInfo" class="table table-sm table-bordered mb-0 mt-2 triggered-task">
            <tbody>
              <tr v-if="ExecutorState.triggeredUserTaskId">
                <th>User Task ID</th>
                <td><code>{{ ExecutorState.triggeredUserTaskId }}</code></td>
              </tr>
              <tr v-if="ExecutorState.triggeredSelfHealingTaskId">
                <th>Self-Healing Task ID</th>
                <td><code>{{ ExecutorState.triggeredSelfHealingTaskId }}</code></td>
              </tr>
              <tr v-if="ExecutorState.triggeredTaskReason">
                <th>Reason</th>
                <td>
                  <div v-if="parsedTaskReason.prefix">{{ parsedTaskReason.prefix }}</div>
                  <table v-if="parsedTaskReason.entries.length" class="table table-sm table-bordered mb-0 mt-1">
                    <tbody>
                      <tr v-for="(entry, idx) in parsedTaskReason.entries" :key="idx">
                        <td><strong>{{ entry.key }}</strong></td>
                        <td>{{ entry.value }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <span v-if="!parsedTaskReason.entries.length && !parsedTaskReason.prefix">{{ ExecutorState.triggeredTaskReason }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <recovery-card v-if="ExecutorState.recovery" :recovery="ExecutorState.recovery" />

      <!-- Throttles and concurrency in force, and live controls (POST admin); CC does not apply them while recovering an
           interrupted execution -->
      <execution-controls v-if='isInProgressState && !isRecoveringState' :state="ExecutorState" @changed="getState()" />

      <!-- Main execution card (shown for all in-progress/stopping states) -->
      <div v-if='isInProgressState' class="card">
        <div>
          <div class='card-header'>
            {{ ExecutorState.state | camelCase }}
          </div>
        </div>
        <div class='card-body'>
          <div>
            <button class="btn btn-primary" @click='stopProposalExecution'>Stop Proposal Execution</button>
            <button class="btn btn-secondary" @click='okDataStopProposalExecution = null'>Clear Response</button>
            <div v-if='errStopProposalExecution'>
              <exception :exception='errDataStopProposalExecution'></exception>
            </div>
            <div v-else>
              <pre>{{ okDataStopProposalExecution }}</pre>
            </div>
            <hr>
          </div>

          <!-- ===================== INITIALIZING SECTION ===================== -->
          <div v-if="isInitializingState" class="alert alert-info text-center">
            <div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div>
            {{ ExecutorState.state | camelCase }} &mdash; preparing execution plan...
          </div>

          <!-- ===================== RECOVERING SECTION ===================== -->
          <div v-if="isRecoveringState" class="alert alert-warning">
            <div class="spinner-border spinner-border-sm text-warning mr-2" role="status"></div>
            <b>Recovering an execution interrupted by a Cruise Control restart.</b>
            Its in-flight movements and throttles are being cleaned up (or the execution resumed), see the recovery card above.
            New executions are refused meanwhile; "Stop Proposal Execution" ends the cleanup.
          </div>

          <!-- ===================== INTER-BROKER SECTION ===================== -->
          <div v-if="isInterBrokerState || isLeaderMovementState || isStoppingState">
            <h4 class="mt-2 mb-3">Inter-Broker Replica Movement Progress</h4>
            <!-- Data progress bar -->
            <div v-if='ExecutorState.totalDataToMove' class="mb-2">
              <small class="text-muted font-weight-bold">Data Movement ({{ ExecutorState.finishedDataMovement | formatUnits }}<template v-if="interProgress.tracked"> + {{ ExecutorState.inProgressMovedData | formatUnits }} in flight</template> / {{ ExecutorState.totalDataToMove | formatUnits }})</small>
              <div class="progress" style="height:28px;font-size:14px">
                <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" :style="'width:' + interProgress.finishedPct + '%'">
                  {{ interProgress.finishedPct.toFixed(1) + '%' }}
                </div>
                <div v-if="interProgress.tracked" class="progress-bar progress-bar-striped progress-bar-animated bg-info" :style="'width:' + interProgress.inFlightPct + '%'" title="Moved by the movements in progress">
                  {{ interProgress.inFlightPct >= 5 ? interProgress.inFlightPct.toFixed(1) + '%' : '' }}
                </div>
              </div>
              <movement-rate v-if="interProgress.tracked" :rate="ExecutorState.inProgressDataMovementRate" :eta="ExecutorState.estimatedRemainingTimeMs" />
            </div>
            <!-- Partition progress bar -->
            <div v-if='ExecutorState.numTotalPartitionMovements' class="mb-3">
              <small class="text-muted font-weight-bold">Partition Movements ({{ ExecutorState.numFinishedPartitionMovements }} / {{ ExecutorState.numTotalPartitionMovements }})</small>
              <div class="progress" style="height:28px;font-size:14px">
                <div class="progress-bar progress-bar-striped bg-success" :style="'width:' + ExecutorState.numFinishedPartitionMovements / ExecutorState.numTotalPartitionMovements * 100 + '%'">Done</div>
                <div class="progress-bar progress-bar-striped progress-bar-animated" :style="'width:' + getInProgressPartitionMovements.length / ExecutorState.numTotalPartitionMovements * 100 + '%'">In Progress</div>
              </div>
            </div>
            <table class="table table-bordered mb-3">
              <thead class="thead-light">
                <tr>
                  <th></th>
                  <th>Total</th>
                  <th class="text-success">Finished</th>
                  <th class="text-warning">In Progress</th>
                  <th class="text-info">Remaining</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Data</strong></td>
                  <td>{{ ExecutorState.totalDataToMove | formatUnits }}</td>
                  <td>{{ ExecutorState.finishedDataMovement | formatUnits }}</td>
                  <td>{{ interProgress.tracked ? $options.filters.formatUnits(ExecutorState.inProgressMovedData) : '-' }}</td>
                  <td>{{ interProgress.remaining | formatUnits }}</td>
                </tr>
                <tr>
                  <td><strong>Partitions</strong></td>
                  <td>{{ ExecutorState.numTotalPartitionMovements | formatNumber }}</td>
                  <td>{{ ExecutorState.numFinishedPartitionMovements | formatNumber }}</td>
                  <td>{{ getInProgressPartitionMovements.length | formatNumber }}</td>
                  <td>{{ ExecutorState.numTotalPartitionMovements - ExecutorState.numFinishedPartitionMovements | formatNumber }}</td>
                </tr>
                <tr>
                  <td><strong>Leadership</strong></td>
                  <td>{{ ExecutorState.numTotalLeadershipMovements | formatNumber }}</td>
                  <td>{{ ExecutorState.numFinishedLeadershipMovements | formatNumber }}</td>
                  <td>-</td>
                  <td>{{ ExecutorState.numTotalLeadershipMovements - ExecutorState.numFinishedLeadershipMovements | formatNumber }}</td>
                </tr>
              </tbody>
            </table>
            <!-- Abort stats (the concurrency is in the controls card) -->
            <table class="table table-bordered mb-3">
              <thead class="thead-light">
                <tr>
                  <th>Aborting</th>
                  <th>Aborted</th>
                  <th>Dead</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ ExecutorState.abortingPartitions }}</td>
                  <td>{{ ExecutorState.abortedPartitions }}</td>
                  <td>{{ ExecutorState.deadPartitions }}</td>
                </tr>
              </tbody>
            </table>
            <!-- Inter-broker stopping stats -->
            <div v-if="isStoppingState">
              <table class="table table-bordered mb-3">
                <thead class="thead-light">
                  <tr>
                    <th class="text-warning">Cancelled</th>
                    <th class="text-info">In Progress</th>
                    <th class="text-danger">Aborting</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{{ ExecutorState.numCancelledPartitionMovements }}</td>
                    <td>{{ ExecutorState.numInProgressPartitionMovements }}</td>
                    <td>{{ ExecutorState.numAbortingPartitionMovements }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ===================== INTRA-BROKER SECTION ===================== -->
          <div v-if="isIntraBrokerState || isStoppingState">
            <hr>
            <h4 class="mt-2 mb-3">Intra-Broker Replica Movement Progress</h4>
            <div v-if="isIntraBrokerState">
              <!-- Data progress bar -->
              <div v-if='ExecutorState.totalIntraBrokerDataToMove' class="mb-2">
                <small class="text-muted font-weight-bold">Data Movement ({{ ExecutorState.finishedIntraBrokerDataMovement | formatUnits }}<template v-if="intraProgress.tracked"> + {{ ExecutorState.inProgressIntraBrokerMovedData | formatUnits }} in flight</template> / {{ ExecutorState.totalIntraBrokerDataToMove | formatUnits }})</small>
                <div class="progress" style="height:28px;font-size:14px">
                  <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" :style="'width:' + intraProgress.finishedPct + '%'">
                    {{ intraProgress.finishedPct.toFixed(1) + '%' }}
                  </div>
                  <div v-if="intraProgress.tracked" class="progress-bar progress-bar-striped progress-bar-animated bg-info" :style="'width:' + intraProgress.inFlightPct + '%'" title="Moved by the movements in progress">
                    {{ intraProgress.inFlightPct >= 5 ? intraProgress.inFlightPct.toFixed(1) + '%' : '' }}
                  </div>
                </div>
                <movement-rate v-if="intraProgress.tracked" :rate="ExecutorState.inProgressIntraBrokerDataMovementRate" :eta="ExecutorState.estimatedIntraBrokerRemainingTimeMs" />
              </div>
              <!-- Partition progress bar -->
              <div v-if='ExecutorState.numTotalIntraBrokerPartitionMovements' class="mb-3">
                <small class="text-muted font-weight-bold">Partition Movements ({{ ExecutorState.numFinishedIntraBrokerPartitionMovements }} / {{ ExecutorState.numTotalIntraBrokerPartitionMovements }})</small>
                <div class="progress" style="height:28px;font-size:14px">
                  <div class="progress-bar progress-bar-striped bg-success" :style="'width:' + ExecutorState.numFinishedIntraBrokerPartitionMovements / ExecutorState.numTotalIntraBrokerPartitionMovements * 100 + '%'">Done</div>
                  <div class="progress-bar progress-bar-striped progress-bar-animated" :style="'width:' + getInProgressIntraBrokerPartitionMovements.length / ExecutorState.numTotalIntraBrokerPartitionMovements * 100 + '%'">In Progress</div>
                </div>
              </div>
              <table class="table table-bordered mb-3">
                <thead class="thead-light">
                  <tr>
                    <th></th>
                    <th>Total</th>
                    <th class="text-success">Finished</th>
                    <th class="text-warning">Pending</th>
                    <th class="text-info">In Progress</th>
                    <th class="text-danger">Aborting</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Data</strong></td>
                    <td>{{ ExecutorState.totalIntraBrokerDataToMove | formatUnits }}</td>
                    <td>{{ ExecutorState.finishedIntraBrokerDataMovement | formatUnits }}</td>
                    <td>-</td>
                    <td>{{ intraProgress.tracked ? $options.filters.formatUnits(ExecutorState.inProgressIntraBrokerMovedData) : '-' }}</td>
                    <td>-</td>
                  </tr>
                  <tr>
                    <td><strong>Partitions</strong></td>
                    <td>{{ ExecutorState.numTotalIntraBrokerPartitionMovements | formatNumber }}</td>
                    <td>{{ ExecutorState.numFinishedIntraBrokerPartitionMovements | formatNumber }}</td>
                    <td>{{ ExecutorState.numPendingIntraBrokerPartitionMovements | formatNumber }}</td>
                    <td>{{ ExecutorState.numInProgressIntraBrokerPartitionMovements | formatNumber }}</td>
                    <td>{{ ExecutorState.numAbortingIntraBrokerPartitionMovements | formatNumber }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Stopping state: intra-broker cancelled/in-progress/aborting counts -->
            <div v-if="isStoppingState">
              <table class="table table-bordered mb-3">
                <thead class="thead-light">
                  <tr>
                    <th class="text-warning">Cancelled</th>
                    <th class="text-info">In Progress</th>
                    <th class="text-danger">Aborting</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{{ ExecutorState.numCancelledIntraBrokerPartitionMovements }}</td>
                    <td>{{ ExecutorState.numInProgressIntraBrokerPartitionMovements }}</td>
                    <td>{{ ExecutorState.numAbortingIntraBrokerPartitionMovements }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ===================== RUNNING REASSIGNMENTS ===================== -->
          <div class="mb-3">
            <h4 class="mt-2 mb-3">Running Reassignments</h4>
            <!-- In-progress inter-broker movements table -->
            <inter-broker-movement-table
              v-if="isInterBrokerState || isStoppingState"
              title="In Progress Inter-Broker Movements"
              :movements="getInProgressPartitionMovements"
              :hide-empty="true"
              table-class="table table-sm table-bordered table-striped"
              thead-class="thead-dark"
            />
            <!-- In-progress intra-broker movements table -->
            <intra-broker-movement-table
              v-if="isIntraBrokerState || isStoppingState"
              title="In Progress Intra-Broker Movements"
              :movements="getInProgressIntraBrokerPartitionMovements"
              :hide-empty="true"
              table-class="table table-sm table-bordered table-striped"
              thead-class="thead-dark"
            />
          </div>

          <!-- ===================== MOVEMENT DETAILS (below Running Reassignments) ===================== -->
          <!-- Inter-broker verbose tables (only when not stopping, stopping has its own) -->
          <div v-if="isInterBrokerState">
            <button class="btn btn-sm btn-outline-secondary mb-3" @click="showInterBrokerDetails = !showInterBrokerDetails">
              {{ showInterBrokerDetails ? 'Hide' : 'Show' }} Movement Details
            </button>
            <div v-if="showInterBrokerDetails">
              <inter-broker-movement-table title="Completed Movements" :movements="ExecutorState.completedPartitionMovement" />
              <inter-broker-movement-table title="Pending Movements" :movements="getPendingPartitionMovements" />
              <inter-broker-movement-table title="In Progress Movements" :movements="getInProgressPartitionMovements" />
              <inter-broker-movement-table title="Aborting Movements" :movements="ExecutorState.abortingPartitionMovement" />
              <inter-broker-movement-table title="Aborted Movements" :movements="ExecutorState.abortedPartitionMovement" />
              <inter-broker-movement-table title="Dead partition Movements" :movements="ExecutorState.deadPartitionMovement" />
            </div>
          </div>
          <!-- Stopping state: inter-broker verbose tables -->
          <div v-if="isStoppingState">
            <inter-broker-movement-table title="Cancelled Inter-Broker Movements" :movements="ExecutorState.cancelledPartitionMovement" :hide-empty="true" />
            <inter-broker-movement-table title="In Progress Inter-Broker Movements" :movements="ExecutorState.inProgressPartitionMovement" :hide-empty="true" />
            <inter-broker-movement-table title="Aborting Inter-Broker Movements" :movements="ExecutorState.abortingPartitionMovement" :hide-empty="true" />
          </div>
          <!-- Intra-broker verbose tables (active intra-broker state) -->
          <div v-if="isIntraBrokerState">
            <button class="btn btn-sm btn-outline-secondary mb-3" @click="showIntraBrokerDetails = !showIntraBrokerDetails">
              {{ showIntraBrokerDetails ? 'Hide' : 'Show' }} Intra-Broker Movement Details
            </button>
            <div v-if="showIntraBrokerDetails">
              <intra-broker-movement-table title="Completed Intra-Broker Movements" :movements="ExecutorState.completedIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Pending Intra-Broker Movements" :movements="getPendingIntraBrokerPartitionMovements" />
              <intra-broker-movement-table title="In Progress Intra-Broker Movements" :movements="getInProgressIntraBrokerPartitionMovements" />
              <intra-broker-movement-table title="Aborting Intra-Broker Movements" :movements="ExecutorState.abortingIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Aborted Intra-Broker Movements" :movements="ExecutorState.abortedIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Dead Intra-Broker Movements" :movements="ExecutorState.deadIntraBrokerPartitionMovement" />
            </div>
          </div>
          <!-- Stopping state: intra-broker verbose tables -->
          <div v-if="isStoppingState">
            <intra-broker-movement-table title="Cancelled Intra-Broker Movements" :movements="ExecutorState.cancelledIntraBrokerPartitionMovement" :hide-empty="true" />
            <intra-broker-movement-table title="In Progress Intra-Broker Movements" :movements="ExecutorState.inProgressIntraBrokerPartitionMovement" :hide-empty="true" />
            <intra-broker-movement-table title="Aborting Intra-Broker Movements" :movements="ExecutorState.abortingIntraBrokerPartitionMovement" :hide-empty="true" />
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script>
import InterBrokerMovementTable from '@/components/InterBrokerMovementTable'
import IntraBrokerMovementTable from '@/components/IntraBrokerMovementTable'
import ExecutionControls from '@/components/ExecutionControls'
import RecoveryCard from '@/components/RecoveryCard'
import MovementRate from '@/components/MovementRate'
import { EXECUTION_STATES } from '@/ccOptions'
import parseTaskReason from '@/taskReason'
import AutoRefresh from '@/components/AutoRefresh'
import { autoRefreshMixin } from '@/autoRefresh'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

const DEFAULT_EXECUTOR_STATE = {
  state: null,
  // Inter-broker fields
  totalDataToMove: 0,
  finishedDataMovement: 0,
  numTotalLeadershipMovements: 0,
  numFinishedLeadershipMovements: 0,
  numTotalPartitionMovements: 0,
  numFinishedPartitionMovements: 0,
  abortingPartitions: 0,
  abortedPartitions: 0,
  deadPartitions: 0,
  numFinishedPartitions: 0,
  numTotalPartitions: 0,
  completedPartitionMovement: [],
  pendingPartitionMovement: [],
  inProgressPartitionMovement: [],
  abortingPartitionMovement: [],
  abortedPartitionMovement: [],
  deadPartitionMovement: [],
  // Inter-broker concurrency
  maximumConcurrentPartitionMovementsPerBroker: null,
  minimumConcurrentPartitionMovementsPerBroker: null,
  averageConcurrentPartitionMovementsPerBroker: null,
  // Inter-broker stopping fields
  numCancelledPartitionMovements: 0,
  numInProgressPartitionMovements: 0,
  numAbortingPartitionMovements: 0,
  cancelledPartitionMovement: [],
  // Intra-broker fields
  numTotalIntraBrokerPartitionMovements: 0,
  numFinishedIntraBrokerPartitionMovements: 0,
  numPendingIntraBrokerPartitionMovements: 0,
  numInProgressIntraBrokerPartitionMovements: 0,
  numAbortingIntraBrokerPartitionMovements: 0,
  totalIntraBrokerDataToMove: 0,
  finishedIntraBrokerDataMovement: 0,
  // Intra-broker concurrency
  maximumConcurrentIntraBrokerPartitionMovementsPerBroker: null,
  minimumConcurrentIntraBrokerPartitionMovementsPerBroker: null,
  averageConcurrentIntraBrokerPartitionMovementsPerBroker: null,
  // Intra-broker verbose
  completedIntraBrokerPartitionMovement: [],
  pendingIntraBrokerPartitionMovement: [],
  inProgressIntraBrokerPartitionMovement: [],
  abortingIntraBrokerPartitionMovement: [],
  abortedIntraBrokerPartitionMovement: [],
  deadIntraBrokerPartitionMovement: [],
  // Intra-broker stopping fields
  numCancelledIntraBrokerPartitionMovements: 0,
  cancelledIntraBrokerPartitionMovement: [],
  // In-flight data movement progress (absent unless partition.movement.progress.tracking.enabled; rate and ETA are
  // absent until the progress has been observed twice)
  inProgressMovedData: null,
  inProgressDataMovementRate: null,
  estimatedRemainingTimeMs: null,
  inProgressIntraBrokerMovedData: null,
  inProgressIntraBrokerDataMovementRate: null,
  estimatedIntraBrokerRemainingTimeMs: null,
  // Throttles in force for the ongoing execution (absent when not throttled)
  ongoingReplicationThrottle: null,
  ongoingLogDirThrottleByBroker: null,
  // The latest execution interrupted by a Cruise Control restart (until the next execution starts)
  recovery: null,
  recentlyDemotedBrokers: null,
  recentlyRemovedBrokers: null,
  // Triggered task info
  triggeredUserTaskId: null,
  triggeredSelfHealingTaskId: null,
  triggeredTaskReason: null
}

function progress (total, finished, inFlight) {
  total = Number(total) || 0
  finished = Number(finished) || 0
  const tracked = inFlight !== null && inFlight !== undefined
  inFlight = tracked ? Number(inFlight) : 0
  const pct = (v) => total > 0 ? Math.min(100, v / total * 100) : 0
  return {
    tracked,
    finishedPct: pct(finished),
    inFlightPct: Math.min(pct(inFlight), 100 - pct(finished)),
    remaining: Math.max(0, total - finished - inFlight)
  }
}

export default {
  name: 'Executor',
  mixins: [autoRefreshMixin],
  props: {
    group: String,
    cluster: String
  },
  components: {
    InterBrokerMovementTable,
    IntraBrokerMovementTable,
    ExecutionControls,
    RecoveryCard,
    MovementRate,
    AutoRefresh
  },
  data () {
    return {
      loaded: false,
      loading: false,
      error: false,
      errorData: null,
      async: false, // when the server treats this request as async
      asyncData: null, // when the server treats the request as async and sends progress instead of actual response
      showTriggeredTaskInfo: false,
      showInterBrokerDetails: false,
      showIntraBrokerDetails: false,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      errStopProposalExecution: false, // true when stop proposal execution is success
      errDataStopProposalExecution: null, // err data of stop proposal execution
      okDataStopProposalExecution: null, // success data from stop proposal execution
      ExecutorState: JSON.parse(JSON.stringify(DEFAULT_EXECUTOR_STATE))
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    if (this.argsRetryTimer) {
      clearTimeout(this.argsRetryTimer)
    }
    if (this.asyncRetryTimer) {
      clearTimeout(this.asyncRetryTimer)
    }
  },
  watch: {
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  computed: {
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    },
    url () {
      return this.$helpers.getURL('state', { substates: 'EXECUTOR', verbose: true })
    },
    stopProposalExecutionURL () {
      return this.$helpers.getURL('stop_proposal_execution')
    },
    isInterBrokerState () {
      return this.ExecutorState.state === 'INTER_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS'
    },
    isIntraBrokerState () {
      return this.ExecutorState.state === 'INTRA_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS'
    },
    isStoppingState () {
      return this.ExecutorState.state === 'STOPPING_EXECUTION'
    },
    isLeaderMovementState () {
      return this.ExecutorState.state === 'LEADER_MOVEMENT_TASK_IN_PROGRESS'
    },
    isInitializingState () {
      const s = this.ExecutorState.state
      return s === 'STARTING_EXECUTION' || s === 'INITIALIZING_PROPOSAL_EXECUTION' || s === 'GENERATING_PROPOSALS_FOR_EXECUTION'
    },
    isRecoveringState () {
      return this.ExecutorState.state === 'RECOVERING_INTERRUPTED_EXECUTION'
    },
    isInProgressState () {
      return EXECUTION_STATES.includes(this.ExecutorState.state)
    },
    stateBadgeClass () {
      const s = this.ExecutorState.state || ''
      if (s.match(/STOP|ERROR/)) return 'badge-danger'
      if (s === 'RECOVERING_INTERRUPTED_EXECUTION') return 'badge-warning'
      // idle is not a movement: dark, so the green of an execution stands out
      if (s === 'NO_TASK_IN_PROGRESS') return 'badge-dark'
      return 'badge-success'
    },
    interProgress () {
      return progress(this.ExecutorState.totalDataToMove, this.ExecutorState.finishedDataMovement, this.ExecutorState.inProgressMovedData)
    },
    intraProgress () {
      return progress(this.ExecutorState.totalIntraBrokerDataToMove, this.ExecutorState.finishedIntraBrokerDataMovement, this.ExecutorState.inProgressIntraBrokerMovedData)
    },
    hasTriggeredTaskInfo () {
      const e = this.ExecutorState
      return this.isInProgressState && !!(e.triggeredUserTaskId || e.triggeredSelfHealingTaskId || e.triggeredTaskReason)
    },
    parsedTaskReason () {
      return parseTaskReason(this.ExecutorState.triggeredTaskReason)
    },
    getPendingPartitionMovements () {
      if (typeof this.ExecutorState.pendingPartitionMovement === 'undefined') return []
      return this.ExecutorState.pendingPartitionMovement.filter(f => f.state === 'PENDING')
    },
    getInProgressPartitionMovements () {
      let inprogress = []
      let pending = []
      if (typeof this.ExecutorState.inProgressPartitionMovement !== 'undefined') {
        inprogress = this.ExecutorState.inProgressPartitionMovement
      }
      if (typeof this.ExecutorState.pendingPartitionMovement !== 'undefined') {
        pending = this.ExecutorState.pendingPartitionMovement
      }
      return inprogress.concat(pending.filter(f => f.state === 'IN_PROGRESS'))
    },
    getPendingIntraBrokerPartitionMovements () {
      if (typeof this.ExecutorState.pendingIntraBrokerPartitionMovement === 'undefined') return []
      return this.ExecutorState.pendingIntraBrokerPartitionMovement.filter(f => f.state === 'PENDING')
    },
    getInProgressIntraBrokerPartitionMovements () {
      let inprogress = []
      let pending = []
      if (typeof this.ExecutorState.inProgressIntraBrokerPartitionMovement !== 'undefined') {
        inprogress = this.ExecutorState.inProgressIntraBrokerPartitionMovement
      }
      if (typeof this.ExecutorState.pendingIntraBrokerPartitionMovement !== 'undefined') {
        pending = this.ExecutorState.pendingIntraBrokerPartitionMovement
      }
      return inprogress.concat(pending.filter(f => f.state === 'IN_PROGRESS'))
    }
  },
  methods: {
    argsChanged (retries) {
      retries = retries || 0
      const newurl = this.$store.getters.getnewurl(this.group, this.cluster)
      if (!newurl) {
        if (retries < ARGS_RETRY_MAX) {
          this.argsRetryTimer = setTimeout(() => this.argsChanged(retries + 1), ARGS_RETRY_DELAY)
        }
        return
      }
      this.$store.commit('seturl', newurl)
      this.loaded = false
      this.stopAutoRefresh()
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getState()
      this.startAutoRefresh()
    },
    getState () {
      const vm = this
      vm.loading = true
      // Uses fetchCC which sends credentials:'include' for authentication.
      fetchCC(vm.url).then((result) => {
        if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with ' + result.status + ' status code.'
        } else if (result.type === 'async') {
          vm.loading = false
          vm.async = true
          vm.asyncData = result.data
          vm.stopAutoRefresh()
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getState(), ASYNC_RETRY_DELAY)
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.error = false
          vm.errorData = null
          vm.loading = false
          vm.$set(vm, 'ExecutorState', Object.assign(JSON.parse(JSON.stringify(DEFAULT_EXECUTOR_STATE)), result.data.ExecutorState))
          vm.loaded = true
          if (!vm.autoRefreshInterval) vm.startAutoRefresh()
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    },
    stopProposalExecution () {
      const vm = this
      // cancel the on-going proposal execution
      vm.$http.post(this.stopProposalExecutionURL, null, { withCredentials: true }).then((r) => {
        vm.errStopProposalExecution = false
        vm.okDataStopProposalExecution = r.data
      }, (e) => {
        vm.errStopProposalExecution = true
        vm.errDataStopProposalExecution = e && e.response ? e.response.data : e
      })
    }
  }
}
</script>

<style scoped>
.card-columns {
  column-count: 6;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .5s
}
.fade-enter, .fade-leave-to  {
  opacity: 0
}

.triggered-task > tbody > tr > th { width: 20%; }
</style>
