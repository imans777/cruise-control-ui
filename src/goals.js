// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
export default {
  goals: [
    // Within a group the list order is the priority order sent to CC. Group 1: the hard goals in the order of the shipped
    // goals config, then the distribution goals.
    // situational: a goal not every cluster uses (shown in gray)
    {
      goal: 'BrokerSetAwareGoal',
      situational: true,
      hardGoal: false,
      group: 1,
      description: 'Hard goal, but only for clusters with broker sets (broker.set.config.file); without them every optimization using it fails. Ensures that the replicas of each topic stay within one broker set. With TopicPatternBrokerSetMappingPolicy, a topic is pinned to the broker set whose topicPattern it matches. First in the shipped goals list: the highest priority.'
    },
    {
      goal: 'RackAwareGoal',
      situational: true,
      hardGoal: true,
      group: 1,
      description: 'Ensures that all replicas of each partition are assigned in a rack aware manner -- i.e. no more than one replica of each partition resides in the same rack. Clusters with partitions that have more replicas than racks use Rack Aware Distribution instead. It is in the shipped default goals and hard goals: leaving it out needs Skip Hard Goal Check, or a hard.goals config without it.'
    },
    {
      goal: 'RackAwareDistributionGoal',
      hardGoal: true,
      group: 1,
      description: 'A relaxed version of RackAwareGoal to use in clusters with partitions whose replication factor > number of racks.'
    },
    {
      goal: 'ReplicaCapacityGoal',
      hardGoal: true,
      group: 1,
      description: 'Ensures that the maximum number of replicas per broker is under the specified maximum limit.'
    },
    {
      goal: 'DiskCapacityGoal',
      hardGoal: true,
      group: 1,
      description: 'Ensures that Disk space usage of each broker is below a given threshold.'
    },
    {
      goal: 'NetworkInboundCapacityGoal',
      hardGoal: true,
      group: 1,
      description: 'Ensures that inbound network utilization of each broker is below a given threshold.'
    },
    {
      goal: 'NetworkOutboundCapacityGoal',
      hardGoal: true,
      group: 1,
      description: 'Ensures that outbound network utilization of each broker is below a given threshold.'
    },
    {
      goal: 'CpuCapacityGoal',
      hardGoal: true,
      group: 1,
      description: 'Ensures that CPU utilization of each broker is below a given threshold.'
    },
    {
      goal: 'MinTopicLeadersPerBrokerGoal',
      hardGoal: false,
      group: 1,
      description: 'Hard goal, but only usable when listed in CC\'s goals config (not by default). Ensures that each alive broker has at least min.topic.leaders.per.broker leaders of each topic matching topics.with.min.leaders.per.broker (a full-match regex; empty = the goal does nothing). The regex must not match a topic excluded from movement, so use (?!__).* rather than .* for every topic. With 1 (the default), a topic with fewer partitions than brokers fails the optimization; 0 = each topic\'s leaders / brokers, rounded down.'
    },
    {
      goal: 'NetworkOutboundUsageDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to keep the outbound network utilization variance among brokers within a certain range relative to the average outbound network utilization.'
    },
    {
      goal: 'DiskUsageDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to keep the Disk space usage variance among brokers within a certain range relative to the average Disk utilization.'
    },
    {
      goal: 'NetworkInboundUsageDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to keep the inbound network utilization variance among brokers within a certain range relative to the average inbound network utilization.'
    },
    {
      goal: 'LeaderReplicaDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to maintain an even distribution of any topic\'s leader replicas across the entire cluster.'
    },
    {
      goal: 'LeaderBytesInDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to equalize the leader bytes in rate on each host.'
    },
    {
      goal: 'TopicReplicaDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to maintain an even distribution of any topic\'s replicas across the entire cluster.'
    },
    {
      goal: 'ReplicaDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to make all the brokers in a cluster have a similar number of replicas.'
    },
    {
      goal: 'PotentialNwOutGoal',
      hardGoal: false,
      group: 1,
      description: 'Ensures that the potential network output (when all the replicas in the broker become leaders) on each of the broker do not exceed the broker\'s network outbound bandwidth capacity.'
    },
    {
      goal: 'CpuUsageDistributionGoal',
      hardGoal: false,
      group: 1,
      description: 'Attempts to keep the CPU usage variance among brokers within a certain range relative to the average CPU utilization.'
    },
    {
      goal: 'PreferredLeaderElectionGoal',
      hardGoal: false,
      group: 1,
      skip: true,
      description: 'Simply move the leaders to the first replica of each partition.'
    },
    {
      goal: 'KafkaAssignerDiskUsageDistributionGoal',
      hardGoal: false,
      group: 2,
      description: '(Kafka-assigner mode) Attempts to distribute disk usage evenly among brokers based on swap.'
    },
    {
      goal: 'KafkaAssignerEvenRackAwareGoal',
      hardGoal: false,
      group: 2,
      description: '(Kafka-assigner mode) Attempts to achieve rack aware even replica distribution.'
    },
    // group 3: intra-broker goals, for rebalance_disk (only goals listed in intra.broker.goals are accepted).
    {
      goal: 'IntraBrokerDiskCapacityGoal',
      hardGoal: true,
      group: 3,
      description: 'Moves replicas between the disks of a broker to keep the usage of each disk under its capacity limit.'
    },
    {
      goal: 'IntraBrokerDiskIORateDistributionGoal',
      hardGoal: false,
      group: 3,
      description: 'Moves replicas between the disks of a broker to keep the estimated I/O rate of each disk within a range around the average of the broker\'s alive disks. Disk I/O is estimated from the replicas\' network rates. Keep it above the usage goal: a goal may only make moves that the goals above it accept.'
    },
    {
      goal: 'IntraBrokerDiskUsageDistributionGoal',
      hardGoal: false,
      group: 3,
      description: 'Moves replicas between the disks of a broker to keep the utilization of each disk within a range around the utilization of the whole broker.'
    }
  ]
}
