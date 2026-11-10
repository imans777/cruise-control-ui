<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <h4>Kafka Broker State</h4>
    <table class="table table-sm table-bordered">
      <thead class="thead-light">
        <tr>
          <th>Broker</th>
          <th>#Replicas </th>
          <th>#Leaders </th>
          <th>#Out of Sync</th>
          <template v-if='state.OfflineReplicaCountByBrokerId'>
          <!-- kafka 2.0 bits -->
          <th>#Offline Replicas</th>
          <th>#Online LogDirs</th>
          <th>#Offline LogDirs</th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for='(v, bid) in state.ReplicaCountByBrokerId' :key="bid">
          <td><span class="id-pill">{{ bid }}</span></td>
          <td><value-cell :value="v" /></td>
          <td :class='!state.LeaderCountByBrokerId[bid] ? "table-danger" : null'><value-cell :value="state.LeaderCountByBrokerId[bid] || 0" /></td>
          <td :class="state.OutOfSyncCountByBrokerId[bid] ? 'text-danger font-weight-bold' : 'muted-zero'">{{ state.OutOfSyncCountByBrokerId[bid] || 0 }}</td>
          <template v-if='state.OfflineReplicaCountByBrokerId'>
          <td :class='state.OfflineReplicaCountByBrokerId[bid] ? "table-danger" : "muted-zero"'>
            {{ state.OfflineReplicaCountByBrokerId[bid] ? state.OfflineReplicaCountByBrokerId[bid] : 0 }}
          </td>
          <td>
            {{ state.OnlineLogDirsByBrokerId[bid] ? state.OnlineLogDirsByBrokerId[bid].length : 0 }}
          </td>
          <td :class='state.OfflineLogDirsByBrokerId[bid] && state.OfflineLogDirsByBrokerId[bid].length > 0 ? "table-danger" : "muted-zero"'>
            {{ state.OfflineLogDirsByBrokerId[bid] ? state.OfflineLogDirsByBrokerId[bid].length : 0 }}
          </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  name: 'KafkaBrokerState',
  props: {
    state: Object
  }
}
</script>
