<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Executor State" :loading="loading" @click="getState()" />
      <auto-refresh v-model='autoRefreshMs' class="ml-1" />
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <loading-state />
    </div>
    <div v-else>
      <!-- Executor: the state; what triggered the ongoing execution (task ids and reason) behind one toggle -->
      <div class="card mb-3">
        <div class="card-header">Executor</div>
        <div class="card-body py-3">
          <div class="exec-state">
            <span :class="['exec-dot', 'tone-' + stateTone, { live: isInProgressState }]"></span>
            <span :class="['badge', 'exec-badge', stateBadgeClass]">{{ ExecutorState.state }}</span>
            <span class="exec-hint">{{ stateHint }}</span>
            <span v-if="ExecutorState.queuedExecution" class="badge badge-info" :title="'queuedExecution: ' + ExecutorState.queuedExecution + '. Once this execution completes, Cruise Control computes it from a fresh model and executes it under the same user task; stopping this execution also cancels it.'"><i class="bi bi-hourglass-split"></i> Then: {{ queuedLabel(ExecutorState.queuedExecution) }}</span>
            <button v-if="hasTriggeredTaskInfo" type="button" class="btn btn-sm btn-outline-secondary ml-auto" @click="showTriggeredTaskInfo = !showTriggeredTaskInfo">
              <i :class="['bi', showTriggeredTaskInfo ? 'bi-chevron-down' : 'bi-chevron-right']"></i> Triggered Task
            </button>
          </div>
          <p class="card-text small text-muted mb-0 mt-2" v-if="ExecutorState.recentlyRemovedBrokers && ExecutorState.recentlyRemovedBrokers.length">Recently removed brokers: {{ ExecutorState.recentlyRemovedBrokers }}</p>
          <p class="card-text small text-muted mb-0 mt-2" v-if="ExecutorState.recentlyDemotedBrokers && ExecutorState.recentlyDemotedBrokers.length">Recently demoted brokers: {{ ExecutorState.recentlyDemotedBrokers }}</p>
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
      <div v-if='isInProgressState' class="card exec-run">
        <div class='card-header exec-run-head'>
          <span><i class="bi bi-activity mr-2"></i>Execution</span>
          <button class="btn btn-sm btn-outline-danger ml-auto" @click="confirmStop = true"><i class="bi bi-stop-circle"></i> Stop Proposal Execution…</button>
        </div>
        <div class='card-body'>
          <!-- stopping is asked first -->
          <div v-if="confirmStop" class="alert alert-danger confirm-box">
            <b><i class="bi bi-exclamation-triangle"></i> Stop the execution?</b>
            Cruise Control starts no new movement and stops the execution; the movements already running are dealt with first, so the stop can take a progress check or two.
            <div class="mt-2">
              <button class="btn btn-danger btn-sm" @click="confirmStop = false; stopProposalExecution()">Stop now</button>
              <button class="btn btn-outline-secondary btn-sm ml-1" @click="confirmStop = false">Cancel</button>
            </div>
          </div>
          <exception v-if='errStopProposalExecution' :exception='errDataStopProposalExecution'></exception>
          <div v-else-if="okDataStopProposalExecution" class="alert alert-success alert-dismissible">
            <b>Stop requested:</b> {{ okDataStopProposalExecution.message || okDataStopProposalExecution }}
            <button type="button" class="close" title="Dismiss" @click="okDataStopProposalExecution = null">&times;</button>
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
          <div v-if="isInterBrokerState || isLeaderMovementState || isStoppingState" class="exec-section">
            <h5 class="exec-section-title">Inter-Broker Replica Movement Progress</h5>
            <!-- Data progress bar -->
            <!-- CC counts a movement's data as finished once it ends, however it ends (completed, dead or aborted) -->
            <div v-if='ExecutorState.totalDataToMove' class="exec-bar">
              <div class="exec-bar-label">
                <span>Data</span>
                <span>{{ ExecutorState.finishedDataMovement | formatUnits }} finished<template v-if="interProgress.tracked"> + {{ ExecutorState.inProgressMovedData | formatUnits }} in flight</template> of {{ ExecutorState.totalDataToMove | formatUnits }}
                  <b>{{ interProgress.finishedPct.toFixed(1) }}%</b></span>
              </div>
              <div class="progress">
                <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" :style="'width:' + interProgress.finishedPct + '%'" title="Finished: the data of the movements that ended (completed, dead or aborted)"></div>
                <div v-if="interProgress.tracked" class="progress-bar progress-bar-striped progress-bar-animated bg-info" :style="'width:' + interProgress.inFlightPct + '%'" title="Moved by the movements in progress"></div>
              </div>
              <div v-if="interEnded.dead || interEnded.aborted" class="exec-bar-note" :title="endedDataHelp">
                <i class="bi bi-exclamation-triangle"></i> Includes the data of {{ endedNote(interEnded) }}
              </div>
              <movement-rate v-if="interProgress.tracked" :rate="ExecutorState.inProgressDataMovementRate" :eta="ExecutorState.estimatedRemainingTimeMs" />
            </div>
            <!-- Partition progress bar: completed, dead, aborted, in progress -->
            <div v-if='ExecutorState.numTotalPartitionMovements' class="exec-bar">
              <div class="exec-bar-label">
                <span>Partition movements</span>
                <span><span class="legend done"></span>{{ interEnded.completed }} completed
                  <span v-if="interEnded.dead" :title="deadHelp"><span class="legend dead"></span>{{ interEnded.dead }} dead</span>
                  <span v-if="interEnded.aborted" :title="abortedHelp"><span class="legend aborted"></span>{{ interEnded.aborted }} aborted</span>
                  <span class="legend running"></span>{{ getInProgressPartitionMovements.length }} in progress
                  &middot; {{ ExecutorState.numTotalPartitionMovements }} in all</span>
              </div>
              <div class="progress">
                <div class="progress-bar progress-bar-striped bg-success" :style="barWidth(interEnded.completed, ExecutorState.numTotalPartitionMovements)" title="Completed"></div>
                <div v-if="interEnded.dead" class="progress-bar progress-bar-striped bg-danger" :style="barWidth(interEnded.dead, ExecutorState.numTotalPartitionMovements)" :title="deadHelp"></div>
                <div v-if="interEnded.aborted" class="progress-bar progress-bar-striped bg-warning" :style="barWidth(interEnded.aborted, ExecutorState.numTotalPartitionMovements)" :title="abortedHelp"></div>
                <div class="progress-bar progress-bar-striped progress-bar-animated" :style="barWidth(getInProgressPartitionMovements.length, ExecutorState.numTotalPartitionMovements)" title="In progress"></div>
              </div>
            </div>
            <div class="stat-grid cols-3">
              <stat-tile label="Data Finished" icon="bi-hdd" tone="primary">
                {{ ExecutorState.finishedDataMovement | formatUnits }} <small class="text-muted">of {{ ExecutorState.totalDataToMove | formatUnits }}</small>
                <template #sub>{{ interProgress.tracked ? $options.filters.formatUnits(ExecutorState.inProgressMovedData) + ' in flight · ' : '' }}{{ interProgress.remaining | formatUnits }} left<span v-if="interEnded.dead || interEnded.aborted" class="text-danger" :title="endedDataHelp"> &middot; incl. {{ endedNote(interEnded) }}</span></template>
              </stat-tile>
              <stat-tile label="Partitions Moved" icon="bi-arrow-left-right" tone="primary">
                {{ interEnded.completed | formatNumber }} <small class="text-muted">of {{ ExecutorState.numTotalPartitionMovements | formatNumber }}</small>
                <template #sub>{{ getInProgressPartitionMovements.length | formatNumber }} in progress<span v-if="interEnded.dead" class="text-danger" :title="deadHelp"> &middot; {{ interEnded.dead | formatNumber }} dead</span><span v-if="interEnded.aborted" class="text-warning" :title="abortedHelp"> &middot; {{ interEnded.aborted | formatNumber }} aborted</span> &middot; {{ ExecutorState.numTotalPartitionMovements - ExecutorState.numFinishedPartitionMovements | formatNumber }} left</template>
              </stat-tile>
              <!-- CC reports the leadership counts only in their own phase, the last one (after every replica move) -->
              <stat-tile v-if="leadershipReported" label="Leadership Moved" icon="bi-star" tone="primary">
                {{ ExecutorState.numFinishedLeadershipMovements | formatNumber }} <small class="text-muted">of {{ ExecutorState.numTotalLeadershipMovements | formatNumber }}</small>
                <template #sub>{{ ExecutorState.numTotalLeadershipMovements - ExecutorState.numFinishedLeadershipMovements | formatNumber }} left</template>
              </stat-tile>
              <stat-tile v-else-if="isStoppingState" label="Leadership" icon="bi-star" tone="primary">
                {{ ExecutorState.numCancelledLeadershipMovements || 0 | formatNumber }} <small class="text-muted">cancelled</small>
                <template #sub>the stop cancels the leadership movements</template>
              </stat-tile>
              <!-- before that phase: the leader changes of the replica moves, done once the old leader left the replicas -->
              <stat-tile v-else label="Leadership Moved" icon="bi-star" tone="primary" class="leadership-moves">
                {{ leaderChanges.done | formatNumber }} <small class="text-muted">of {{ leaderChanges.planned | formatNumber }}</small>
                <template #sub>
                  <span title="The partitions whose leader the moves change (a new first replica), done as their move completes: the new first replica is then the preferred leader, which Kafka elects (also when the move only reorders the replicas). Leader changes without a replica move come in Cruise Control's leadership phase, after every replica move, which counts them all.">
                    {{ leaderChanges.planned - leaderChanges.done | formatNumber }} left &middot; <span class="small">leader-only changes after the moves</span> <i class="bi bi-question-circle help-icon"></i>
                  </span>
                </template>
              </stat-tile>
            </div>
            <!-- the movements that went wrong (red once not 0), and while stopping the ones cancelled -->
            <div class="exec-flags">
              <span :class="{ bad: ExecutorState.abortingPartitions > 0 }">Aborting <b>{{ ExecutorState.abortingPartitions || 0 }}</b></span>
              <!-- counted from the movement lists, which CC sends in the movement phase only -->
              <template v-if="isInterBrokerState">
                <span :class="{ bad: interEnded.aborted > 0 }" :title="abortedHelp">Aborted <b>{{ interEnded.aborted }}</b></span>
                <span :class="{ bad: interEnded.dead > 0 }" :title="deadHelp">Dead <b>{{ interEnded.dead }}</b></span>
              </template>
              <template v-if="isStoppingState">
                <span>Cancelled <b>{{ ExecutorState.numCancelledPartitionMovements || 0 }}</b></span>
                <span>In progress <b>{{ ExecutorState.numInProgressPartitionMovements || 0 }}</b></span>
                <span :class="{ bad: ExecutorState.numAbortingPartitionMovements > 0 }">Aborting movements <b>{{ ExecutorState.numAbortingPartitionMovements || 0 }}</b></span>
              </template>
            </div>
          </div>

          <!-- ===================== INTRA-BROKER SECTION ===================== -->
          <div v-if="isIntraBrokerState || isStoppingState" class="exec-section">
            <h5 class="exec-section-title">Intra-Broker Replica Movement Progress</h5>
            <div v-if="isIntraBrokerState">
              <!-- Data progress bar -->
              <!-- CC counts a movement's data as finished once it ends, however it ends (completed, dead or aborted) -->
              <div v-if='ExecutorState.totalIntraBrokerDataToMove' class="exec-bar">
                <div class="exec-bar-label">
                  <span>Data</span>
                  <span>{{ ExecutorState.finishedIntraBrokerDataMovement | formatUnits }} finished<template v-if="intraProgress.tracked"> + {{ ExecutorState.inProgressIntraBrokerMovedData | formatUnits }} in flight</template> of {{ ExecutorState.totalIntraBrokerDataToMove | formatUnits }}
                    <b>{{ intraProgress.finishedPct.toFixed(1) }}%</b></span>
                </div>
                <div class="progress">
                  <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" :style="'width:' + intraProgress.finishedPct + '%'" title="Finished: the data of the movements that ended (completed, dead or aborted)"></div>
                  <div v-if="intraProgress.tracked" class="progress-bar progress-bar-striped progress-bar-animated bg-info" :style="'width:' + intraProgress.inFlightPct + '%'" title="Moved by the movements in progress"></div>
                </div>
                <div v-if="intraEnded.dead || intraEnded.aborted" class="exec-bar-note" :title="endedDataHelp">
                  <i class="bi bi-exclamation-triangle"></i> Includes the data of {{ endedNote(intraEnded) }}
                </div>
                <movement-rate v-if="intraProgress.tracked" :rate="ExecutorState.inProgressIntraBrokerDataMovementRate" :eta="ExecutorState.estimatedIntraBrokerRemainingTimeMs" />
              </div>
              <!-- Partition progress bar: completed, dead, aborted, in progress -->
              <div v-if='ExecutorState.numTotalIntraBrokerPartitionMovements' class="exec-bar">
                <div class="exec-bar-label">
                  <span>Partition movements</span>
                  <span><span class="legend done"></span>{{ intraEnded.completed }} completed
                    <span v-if="intraEnded.dead" :title="deadHelp"><span class="legend dead"></span>{{ intraEnded.dead }} dead</span>
                    <span v-if="intraEnded.aborted" :title="abortedHelp"><span class="legend aborted"></span>{{ intraEnded.aborted }} aborted</span>
                    <span class="legend running"></span>{{ getInProgressIntraBrokerPartitionMovements.length }} in progress
                    &middot; {{ ExecutorState.numTotalIntraBrokerPartitionMovements }} in all</span>
                </div>
                <div class="progress">
                  <div class="progress-bar progress-bar-striped bg-success" :style="barWidth(intraEnded.completed, ExecutorState.numTotalIntraBrokerPartitionMovements)" title="Completed"></div>
                  <div v-if="intraEnded.dead" class="progress-bar progress-bar-striped bg-danger" :style="barWidth(intraEnded.dead, ExecutorState.numTotalIntraBrokerPartitionMovements)" :title="deadHelp"></div>
                  <div v-if="intraEnded.aborted" class="progress-bar progress-bar-striped bg-warning" :style="barWidth(intraEnded.aborted, ExecutorState.numTotalIntraBrokerPartitionMovements)" :title="abortedHelp"></div>
                  <div class="progress-bar progress-bar-striped progress-bar-animated" :style="barWidth(getInProgressIntraBrokerPartitionMovements.length, ExecutorState.numTotalIntraBrokerPartitionMovements)" title="In progress"></div>
                </div>
              </div>
              <div class="stat-grid cols-3">
                <stat-tile label="Data Finished" icon="bi-hdd" tone="primary">
                  {{ ExecutorState.finishedIntraBrokerDataMovement | formatUnits }} <small class="text-muted">of {{ ExecutorState.totalIntraBrokerDataToMove | formatUnits }}</small>
                  <template v-if="intraProgress.tracked || intraEnded.dead || intraEnded.aborted" #sub><template v-if="intraProgress.tracked">{{ ExecutorState.inProgressIntraBrokerMovedData | formatUnits }} in flight</template><span v-if="intraEnded.dead || intraEnded.aborted" class="text-danger" :title="endedDataHelp"><template v-if="intraProgress.tracked"> &middot; </template>incl. {{ endedNote(intraEnded) }}</span></template>
                </stat-tile>
                <stat-tile label="Partitions Moved" icon="bi-device-hdd" tone="primary">
                  {{ intraEnded.completed | formatNumber }} <small class="text-muted">of {{ ExecutorState.numTotalIntraBrokerPartitionMovements | formatNumber }}</small>
                  <template #sub>{{ ExecutorState.numInProgressIntraBrokerPartitionMovements | formatNumber }} in progress<span v-if="intraEnded.dead" class="text-danger" :title="deadHelp"> &middot; {{ intraEnded.dead | formatNumber }} dead</span><span v-if="intraEnded.aborted" class="text-warning" :title="abortedHelp"> &middot; {{ intraEnded.aborted | formatNumber }} aborted</span> &middot; {{ ExecutorState.numPendingIntraBrokerPartitionMovements | formatNumber }} pending</template>
                </stat-tile>
              </div>
            </div>
            <div class="exec-flags">
              <span :class="{ bad: ExecutorState.numAbortingIntraBrokerPartitionMovements > 0 }">Aborting <b>{{ ExecutorState.numAbortingIntraBrokerPartitionMovements || 0 }}</b></span>
              <!-- counted from the movement lists, which CC sends in the movement phase only -->
              <template v-if="isIntraBrokerState">
                <span :class="{ bad: intraEnded.aborted > 0 }" :title="abortedHelp">Aborted <b>{{ intraEnded.aborted }}</b></span>
                <span :class="{ bad: intraEnded.dead > 0 }" :title="deadHelp">Dead <b>{{ intraEnded.dead }}</b></span>
              </template>
              <template v-if="isStoppingState">
                <span>Cancelled <b>{{ ExecutorState.numCancelledIntraBrokerPartitionMovements || 0 }}</b></span>
                <span>In progress <b>{{ ExecutorState.numInProgressIntraBrokerPartitionMovements || 0 }}</b></span>
              </template>
            </div>
          </div>

          <!-- ===================== RUNNING REASSIGNMENTS ===================== -->
          <div class="mb-3">
            <h5 class="exec-section-title">Running Reassignments</h5>
            <!-- In-progress inter-broker movements table -->
            <inter-broker-movement-table
              v-if="isInterBrokerState || isStoppingState"
              title="In Progress Inter-Broker Movements"
              :movements="getInProgressPartitionMovements"
              :hide-empty="true"
              table-class="table table-sm table-bordered"
              thead-class="thead-light"
            />
            <!-- In-progress intra-broker movements table -->
            <intra-broker-movement-table
              v-if="isIntraBrokerState || isStoppingState"
              title="In Progress Intra-Broker Movements"
              :movements="getInProgressIntraBrokerPartitionMovements"
              :hide-empty="true"
              table-class="table table-sm table-bordered"
              thead-class="thead-light"
            />
          </div>

          <!-- ===================== MOVEMENT DETAILS (below Running Reassignments) ===================== -->
          <!-- Inter-broker verbose tables (only when not stopping, stopping has its own) -->
          <div v-if="isInterBrokerState">
            <h5 :class="['collapse-title', 'exec-section-title', { open: showInterBrokerDetails }]" @click="showInterBrokerDetails = !showInterBrokerDetails">
              <i class="bi bi-chevron-right chev"></i> Movement Details <small class="text-muted font-weight-normal">pending, aborting, aborted, dead, completed</small>
            </h5>
            <!-- what is still to come first, the completed ones last; the ones in progress are in Running Reassignments above -->
            <div v-if="showInterBrokerDetails">
              <inter-broker-movement-table title="Pending Movements" :movements="getPendingPartitionMovements" />
              <inter-broker-movement-table title="Aborting Movements" :movements="ExecutorState.abortingPartitionMovement" />
              <inter-broker-movement-table title="Aborted Movements" :movements="ExecutorState.abortedPartitionMovement" />
              <inter-broker-movement-table title="Dead partition Movements" :movements="ExecutorState.deadPartitionMovement" />
              <inter-broker-movement-table title="Completed Movements" :movements="ExecutorState.completedPartitionMovement" />
            </div>
          </div>
          <!-- Stopping state: inter-broker verbose tables (the ones in progress are in Running Reassignments) -->
          <div v-if="isStoppingState">
            <inter-broker-movement-table title="Cancelled Inter-Broker Movements" :movements="ExecutorState.cancelledPartitionMovement" :hide-empty="true" />
            <inter-broker-movement-table title="Aborting Inter-Broker Movements" :movements="ExecutorState.abortingPartitionMovement" :hide-empty="true" />
          </div>
          <!-- Intra-broker verbose tables (active intra-broker state) -->
          <div v-if="isIntraBrokerState">
            <h5 :class="['collapse-title', 'exec-section-title', { open: showIntraBrokerDetails }]" @click="showIntraBrokerDetails = !showIntraBrokerDetails">
              <i class="bi bi-chevron-right chev"></i> Intra-Broker Movement Details <small class="text-muted font-weight-normal">pending, aborting, aborted, dead, completed</small>
            </h5>
            <div v-if="showIntraBrokerDetails">
              <intra-broker-movement-table title="Pending Intra-Broker Movements" :movements="getPendingIntraBrokerPartitionMovements" />
              <intra-broker-movement-table title="Aborting Intra-Broker Movements" :movements="ExecutorState.abortingIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Aborted Intra-Broker Movements" :movements="ExecutorState.abortedIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Dead Intra-Broker Movements" :movements="ExecutorState.deadIntraBrokerPartitionMovement" />
              <intra-broker-movement-table title="Completed Intra-Broker Movements" :movements="ExecutorState.completedIntraBrokerPartitionMovement" />
            </div>
          </div>
          <!-- Stopping state: intra-broker verbose tables -->
          <div v-if="isStoppingState">
            <intra-broker-movement-table title="Cancelled Intra-Broker Movements" :movements="ExecutorState.cancelledIntraBrokerPartitionMovement" :hide-empty="true" />
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
import { EXECUTION_STATES, queuedExecutionLabel } from '@/ccOptions'
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
  // null: not reported (CC sends them in the leadership phase only)
  numTotalLeadershipMovements: null,
  numFinishedLeadershipMovements: null,
  numTotalPartitionMovements: 0,
  numFinishedPartitionMovements: 0,
  abortingPartitions: 0,
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

// the movements that ended, by how: CC's numFinished* and finished*DataMovement count all three alike
function ended (completed, dead, aborted) {
  return { completed: (completed || []).length, dead: (dead || []).length, aborted: (aborted || []).length }
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
      confirmStop: false, // the Stop confirmation is shown
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
    // the color of the state dot: the badge's
    stateTone () {
      return this.stateBadgeClass.replace('badge-', '')
    },
    // the state in words; the queued execution of a user task (queue_rebalance_disk) runs with its reason suffixed with
    // "(queued REBALANCE_DISK)"
    stateHint () {
      const queued = (String(this.ExecutorState.triggeredTaskReason || '').match(/\(queued ([A-Z_]+)\)\s*$/) || [])[1]
      if (queued && this.ExecutorState.state === 'GENERATING_PROPOSALS_FOR_EXECUTION') {
        return 'Preparing the queued ' + this.queuedLabel(queued) + ' (it waits for a complete load model first)'
      }
      const hint = {
        NO_TASK_IN_PROGRESS: 'Idle: nothing is being moved',
        STARTING_EXECUTION: 'Starting an execution',
        INITIALIZING_PROPOSAL_EXECUTION: 'Initializing the execution',
        GENERATING_PROPOSALS_FOR_EXECUTION: 'Generating the proposals to execute',
        INTER_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS: 'Moving replicas between brokers',
        INTRA_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS: 'Moving replicas between the disks of brokers',
        LEADER_MOVEMENT_TASK_IN_PROGRESS: 'Moving leadership',
        STOPPING_EXECUTION: 'Stopping the execution',
        RECOVERING_INTERRUPTED_EXECUTION: 'Recovering an interrupted execution'
      }[this.ExecutorState.state] || ''
      return queued && hint && this.isInProgressState ? hint + ' (the queued ' + this.queuedLabel(queued) + ')' : hint
    },
    interProgress () {
      return progress(this.ExecutorState.totalDataToMove, this.ExecutorState.finishedDataMovement, this.ExecutorState.inProgressMovedData)
    },
    intraProgress () {
      return progress(this.ExecutorState.totalIntraBrokerDataToMove, this.ExecutorState.finishedIntraBrokerDataMovement, this.ExecutorState.inProgressIntraBrokerMovedData)
    },
    interEnded () {
      const st = this.ExecutorState
      return ended(st.completedPartitionMovement, st.deadPartitionMovement, st.abortedPartitionMovement)
    },
    intraEnded () {
      const st = this.ExecutorState
      return ended(st.completedIntraBrokerPartitionMovement, st.deadIntraBrokerPartitionMovement, st.abortedIntraBrokerPartitionMovement)
    },
    deadHelp () {
      return 'Dead: Cruise Control gave up on these movements and no longer tracks them (a broker of the move went down, the move took ' +
        'longer than its timeout, Kafka refused or did not confirm it, or the execution was stopped). Kafka may still finish some ' +
        'of them, or may have: check where their replicas are.'
    },
    abortedHelp () {
      return 'Aborted: Cruise Control rolled these movements back.'
    },
    endedDataHelp () {
      return 'Cruise Control counts the whole size of a movement as finished once it ends, also when it died or was aborted. ' +
        'It does not report the size of each movement, so their part cannot be taken out here.'
    },
    hasTriggeredTaskInfo () {
      const e = this.ExecutorState
      return this.isInProgressState && !!(e.triggeredUserTaskId || e.triggeredSelfHealingTaskId || e.triggeredTaskReason)
    },
    parsedTaskReason () {
      return parseTaskReason(this.ExecutorState.triggeredTaskReason)
    },
    leadershipReported () {
      return this.ExecutorState.numTotalLeadershipMovements !== null && this.ExecutorState.numTotalLeadershipMovements !== undefined
    },
    // the inter-broker moves that change the partition's leader (a new first replica), and the completed ones among them: a
    // completed reassignment makes the new first replica the preferred leader, which Kafka elects as it completes (also when the
    // move only reorders the replicas); Cruise Control's leadership phase elects any it did not
    leaderChanges () {
      const st = this.ExecutorState
      const changes = (m) => m.proposal && m.proposal.newReplicas && m.proposal.oldLeader !== m.proposal.newReplicas[0]
      const all = [].concat(st.completedPartitionMovement || [], st.inProgressPartitionMovement || [], st.pendingPartitionMovement || [],
        st.abortingPartitionMovement || [], st.abortedPartitionMovement || [], st.deadPartitionMovement || [])
      return {
        planned: all.filter(changes).length,
        done: (st.completedPartitionMovement || []).filter(changes).length
      }
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
    queuedLabel: queuedExecutionLabel,
    barWidth (n, total) {
      return 'width:' + (total > 0 ? Math.min(100, n / total * 100) : 0) + '%'
    },
    // "50 dead movements", "50 dead and 2 aborted movements"
    endedNote (e) {
      const parts = []
      if (e.dead) parts.push(e.dead + ' dead')
      if (e.aborted) parts.push(e.aborted + ' aborted')
      return parts.join(' and ') + ' movement' + (e.dead + e.aborted === 1 ? '' : 's')
    },
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
.exec-run { border-left: 3px solid var(--success); }
.exec-run-head { display: flex; align-items: center; gap: 10px; }
.exec-section { margin-bottom: 1.4rem; }
.exec-section-title { margin: 0.4rem 0 0.9rem; font-size: 1rem; }
.exec-bar { margin-bottom: 1rem; }
.exec-bar-label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin-bottom: 5px; color: var(--muted); font-size: 0.82rem; }
.exec-bar-label > span:first-child { color: var(--text-strong); font-weight: 600; }
.exec-bar-label b { margin-left: 6px; color: var(--text-strong); }
.exec-bar .progress { height: 12px; }
.legend { display: inline-block; width: 9px; height: 9px; margin: 0 4px 0 8px; border-radius: 3px; vertical-align: 0; }
.legend.done { background: var(--success); }
.legend.running { background: var(--primary); }
.legend.dead { background: var(--danger); }
.legend.aborted { background: var(--warning); }
.exec-bar-note { margin-top: 5px; color: var(--danger); font-size: 0.8rem; }
.exec-flags { display: flex; flex-wrap: wrap; gap: 8px; }
.exec-flags > span { padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 0.8rem; }
.exec-flags > span b { margin-left: 4px; color: var(--text); }
.exec-flags > span.bad { border-color: rgba(248, 113, 113, 0.5); background: var(--danger-soft); color: var(--danger); }
.exec-flags > span.bad b { color: var(--danger); }
.exec-state { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.exec-badge { font-size: 0.85rem; padding: 0.5em 0.95em; }
.exec-hint { color: var(--muted); }
.exec-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--secondary); }
.exec-dot.tone-success { background: var(--success); }
.exec-dot.tone-warning { background: var(--warning); }
.exec-dot.tone-danger { background: var(--danger); }
.exec-dot.live { animation: exec-pulse 1.6s ease-out infinite; }
@keyframes exec-pulse {
  0% { box-shadow: 0 0 0 0 var(--success-soft), 0 0 0 0 rgba(52, 211, 153, 0.55); }
  100% { box-shadow: 0 0 0 12px transparent, 0 0 0 6px rgba(52, 211, 153, 0); }
}
</style>
