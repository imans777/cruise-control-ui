// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.

// Replica movement strategies shipped with Cruise Control (the default replica.movement.strategies).
// The order of replica_movement_strategies is the chain order: the first strategy decides, the next ones break ties.
export const REPLICA_MOVEMENT_STRATEGIES = [
  { name: 'ThrottleAwareReplicaMovementStrategy', description: 'Starts inter-broker movements only within the replication throttle of their brokers, so that movements whose combined write rate exceeds the throttle do not stall the execution. Use it with concurrency.adjuster.replication.throttle.enabled.' },
  { name: 'OneReplicaPerPartitionMovementStrategy', description: 'Moves at most one replica of each partition at a time (for RF >= 3 moves); chains with the throttle-aware strategy.' },
  { name: 'PostponeUrpReplicaMovementStrategy', description: 'Moves replicas of partitions that are not under-replicated first.' },
  { name: 'PrioritizeLargeReplicaMovementStrategy', description: 'Moves replicas of larger partitions first.' },
  { name: 'PrioritizeSmallReplicaMovementStrategy', description: 'Moves replicas of smaller partitions first.' },
  { name: 'PrioritizeMinIsrWithOfflineReplicasStrategy', description: 'Moves replicas of (At/Under)MinISR partitions with offline replicas first.' },
  { name: 'PrioritizeOneAboveMinIsrWithOfflineReplicasStrategy', description: 'Moves replicas of OneAboveMinISR partitions with offline replicas first; chain it after PrioritizeMinIsrWithOfflineReplicasStrategy.' },
  { name: 'BaseReplicaMovementStrategy', description: 'Orders the tasks by task id (CC chains it at the end if absent).' }
]

// ConcurrencyType values the concurrency adjuster supports, for enable_concurrency_adjuster_for / disable_concurrency_adjuster_for
// (INTRA_BROKER_REPLICA is rejected: its adjuster is pending upstream issue #1299)
export const CONCURRENCY_TYPES = [
  'INTER_BROKER_REPLICA',
  'LEADERSHIP_CLUSTER',
  'LEADERSHIP_BROKER'
]

// Executor states during which an execution (or the cleanup of an interrupted one) is ongoing
export const EXECUTION_STATES = [
  'STARTING_EXECUTION',
  'INITIALIZING_PROPOSAL_EXECUTION',
  'GENERATING_PROPOSALS_FOR_EXECUTION',
  'RECOVERING_INTERRUPTED_EXECUTION',
  'INTER_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS',
  'INTRA_BROKER_REPLICA_MOVEMENT_TASK_IN_PROGRESS',
  'LEADER_MOVEMENT_TASK_IN_PROGRESS',
  'STOPPING_EXECUTION'
]

// An execution queued after the ongoing one of the same user task (queuedExecution, e.g. by queue_rebalance_disk), in words
export function queuedExecutionLabel (type) {
  return { REBALANCE_DISK: 'disk rebalance' }[type] || type
}
