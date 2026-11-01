<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div v-if='!loading'>
      <div class="alert alert-primary text-right">
        <button class="btn btn-primary" @click='getKafkaState()'>Refresh Broker Details</button>
      </div>
    </div>
    <div v-if='!loading && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <div class="alert alert-info text-center" v-if='showAsyncRefreshButton'>
        <button class="btn btn-sm btn-secondary" @click='getKafkaState()'>⟳ Refresh View Now</button>
      </div>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if="!loaded && loading">
      <div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div> Loading ...</div>
    </div>
    <div v-else-if='loaded'>
      <div class="form-inline mb-2">
        <input type="text" class="form-control form-control-sm filter-input" v-model="adminFilterText" placeholder="Filter: broker ids (e.g. 1, 3) or host / rack" title="Comma- or space-separated: a number matches that broker id, any other text a part of the host or rack">
        <label class="ml-3 mr-1" title="Show details of log dirs and ability to select them for demote or remove. Selecting log dirs and brokers are mutual exclusive">❓ Enable Log Dir Selection:</label>
        <input type=checkbox v-model=enableLogDirSelection @change="selectedBrokers=[]; selectedLogDirs={}" >
      </div>
      <table class="table table-sm table-bordered">
        <thead class="thead-light">
          <tr>
            <th @click='sortAdmin("bid")' style="cursor:pointer">Broker</th>
            <th @click='sortAdmin("host")' style="cursor:pointer">Host</th>
            <th @click='sortAdmin("rack")' style="cursor:pointer">Rack</th>
            <th @click='sortAdmin("state")' style="cursor:pointer">State</th>
            <th @click='sortAdmin("replicas")' style="cursor:pointer">#Replicas</th>
            <th @click='sortAdmin("leaders")' style="cursor:pointer">#Leaders</th>
            <th @click='sortAdmin("outofsync")' style="cursor:pointer">#Out of Sync Replicas</th>
            <template v-if='KafkaBrokerState.OfflineReplicaCountByBrokerId'>
              <!-- kafka 2.0 bits -->
              <th>#Offline Replicas</th>
              <th>#Online LogDirs</th>
              <th>#Offline LogDirs</th>
            </template>
            <th v-if="!enableLogDirSelection">
              Broker(s)
              <input type="checkbox" @change="selectedBrokers=$event.target.checked?filteredAdminBrokers.map(r=>r.bid):[]; selectedLogDirs={}">
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for='row in filteredAdminBrokers' :key='row.bid'>
            <td>{{ row.bid }}</td>
            <td>{{ row.host }}</td>
            <td>{{ row.rack || 'N/A' }}</td>
            <td><broker-state :state='row.state'></broker-state></td>
            <td>{{ row.replicas }}</td>
            <td :class='!row.leaders ? "table-danger" : null'>{{ row.leaders }}</td>
            <td :class='row.outofsync > 0 ? "table-danger" : null'>{{ row.outofsync }}</td>
            <template v-if='KafkaBrokerState.OfflineReplicaCountByBrokerId'>
              <td :class='row.offlineReplicas ? "table-danger" : null'>
                {{ row.offlineReplicas }}
              </td>
              <td>
                <template v-if="enableLogDirSelection">
                  <div v-for="logdir in (KafkaBrokerState.OnlineLogDirsByBrokerId[row.bid] || [])" :key="logdir">
                    <input type="checkbox" v-model="selectedLogDirs[`${row.bid}-${logdir}`]" @change="selectedBrokers=[]">
                    <code>{{ logdir }}</code>
                  </div>
                  <span v-if="!(KafkaBrokerState.OnlineLogDirsByBrokerId[row.bid] || []).length">-</span>
                </template>
                <template v-else>{{ row.onlineLogDirs }}</template>
              </td>
              <td :class='row.offlineLogDirs > 0 ? "table-danger" : null'>
                <template v-if="enableLogDirSelection">
                  <div v-for="logdir in (KafkaBrokerState.OfflineLogDirsByBrokerId[row.bid] || [])" :key="logdir">
                    <code>{{ logdir }}</code>
                  </div>
                  <span v-if="!(KafkaBrokerState.OfflineLogDirsByBrokerId[row.bid] || []).length">-</span>
                </template>
                <template v-else>{{ row.offlineLogDirs }}</template>
              </td>
            </template>
            <td v-if="!enableLogDirSelection">
              <input type="checkbox" v-model="selectedBrokers" :value='row.bid' @change="selectedLogDirs={}"/>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="alert alert-secondary">
        <div class="mb-3">(Hint: Some options are only available when any broker or logdir is selected. Rebalance Broker Disks is limited to the selected brokers, if any.)</div>
        <div class="mb-2"><b>Actions:</b></div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="ple" v-model='actionName' :disabled='selectedBrokers.length != 0 || brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Preferred Leader Election</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="rebalance" v-model='actionName' :disabled='selectedBrokers.length != 0 || brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Rebalance Cluster</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="rebalance_disk" v-model='actionName' :disabled='brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Rebalance Broker Disks</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="add" v-model='actionName' :disabled='selectedBrokers.length == 0'>
          <label class="form-check-label">Add Brokers</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="remove" v-model='actionName' :disabled='selectedBrokers.length == 0'>
          <label class="form-check-label">Remove Brokers</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="demote" v-model='actionName' :disabled='selectedBrokers.length == 0 && brokerIdAndLogDirs.length == 0'>
          <label v-if="brokerIdAndLogDirs.length != 0" class="form-check-label">Demote Disks</label>
          <label v-else class="form-check-label">Demote Brokers</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="remove_disks" v-model='actionName' :disabled='brokerIdAndLogDirs.length == 0'>
          <label class="form-check-label">Remove Disks</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="fix_offline_replicas" v-model='actionName' :disabled='selectedBrokers.length != 0 || brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Fix Offline Replicas</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="topic_configuration" v-model='actionName' :disabled='selectedBrokers.length != 0 || brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Topic Configuration</label>
        </div>
        <div class="form-check form-check-inline">
          <input class="form-check-input" type="radio" value="admin" v-model='actionName' :disabled='selectedBrokers.length != 0 || brokerIdAndLogDirs.length != 0'>
          <label class="form-check-label">Admin</label>
        </div>
        <div class="form-check form-check-inline float-right" v-if='actionName'>
          <input class="form-check-input" type="checkbox" v-model='showURL'>
          <label class="form-check-label">Show URL</label>
        </div>
      </div>

      <div class="alert alert-primary" v-if='showURL && actionURL'>
        <h6>POST URL</h6>
        <hr>
        <pre>
          <code> {{ actionURL.replace(/\&/g, "\n\t\t&") }} </code>
        </pre>
      </div>

      <!-- PLE Flags -->
      <div class="alert alert-primary" v-if='actionName === "ple"'>
        <h5>PLE Flags</h5>
        <p>Elect preferred leaders</p>
        <hr>
        <div class="row">
          <div class="col-md-4">
            <div class="form-inline">
              <label class="form-label"> Concurrent Leader Movements </label>
              <input type="number" class="form-input" v-model='concurrent_leader_movements' placeholder='(CC Default)'>
            </div>
          </div>
          <div class="col-md-4">
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="checkbox" v-model='dryrun'>
              <label class="form-check-label">DryRun</label>
            </div>
          </div>
        </div>
        <div class="text-right">
          <button @click='actionBroker' class="btn btn-primary">Run PLE</button>
        </div>
      </div>

      <!-- Optimization Flags: Rebalance Cluster, Rebalance Broker Disks, Add/Remove Brokers, Fix Offline Replicas, Topic Configuration -->
      <div :class="['alert', actionMeta.alertClass]" v-if='actionMeta && (!actionMeta.withBrokers || selectedBrokers.length > 0)'>
        <h5>{{ actionMeta.title }}</h5>
        <p v-if="actionMeta.description">{{ actionMeta.description }}</p>
        <p v-if="actionName === 'rebalance_disk' && selectedBrokers.length"><b>Limited to the {{ selectedBrokers.length }} selected broker{{ selectedBrokers.length > 1 ? 's' : '' }}</b> (destination_broker_ids={{ selectedBrokers.join(', ') }}): only their disks are rebalanced and the disk statistics cover them only.</p>
        <hr>
        <form @submit.prevent>
          <div class="row mb-2" v-if="actionName === 'topic_configuration'">
            <div class="col-md-4">
              <div class="form-inline">
                <label class="form-label mr-1"> Topic Regex: </label>
                <input type="text" class="form-input" v-model='topic_regex' placeholder='Mandatory'>
              </div>
            </div>
            <div class="col-md-4">
              <div class="form-inline">
                <label class="form-label mr-1"> Replication Factor: </label>
                <input class="form-input" type='number' min=1 v-model='replication_factor' placeholder='Mandatory'>
              </div>
            </div>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model='showAdvanced'>
            <label class="form-check-label">
              Show All Options
            </label>
          </div>
          <div class="form-check" v-if='!showAdvanced'>
            <input class="form-check-input" type="checkbox" v-model='dryrun'>
            <label class="form-check-label">
              Dry Run
            </label>
          </div>

          <template v-if='showAdvanced'>
          <hr>
          <div class="row">
            <div class="col-md-4">
              <h6>Choose Goals <small class="text-muted">({{ actionMeta.goalGroup === 3 ? 'intra-broker goals; none = intra.broker.goals' : 'none = CC default goals' }})</small></h6>
              <p class="small text-muted mb-1">The selected goals run in the listed order, highest priority first. <b>Bold</b>: hard goals. <span class="text-muted">Gray</span>: goals only some clusters use (hover for why).</p>
              <div class="small mb-1">
                Select: <a href="#" :class="{ 'text-muted': disable_goals1 }" title="Every goal except the gray ones: those fail the request on clusters that are not set up for them (Broker Set Aware without broker sets, for one)" @click.prevent="!disable_goals1 && (goals1 = actionGoals.filter(g => !g.situational).map(g => g.goal))">all</a>
                &middot; <a href="#" :class="{ 'text-muted': disable_goals1 }" @click.prevent="!disable_goals1 && (goals1 = [])">none</a>
              </div>
              <template v-for='g in actionGoals'>
              <div class="form-check" :key='g.goal'>
                  <input class="form-check-input" type="checkbox" :value="g.goal" v-model='goals1' :disabled='disable_goals1'>
                  <label class="form-check-label" :title='g.description' :class="{ 'text-muted': g.situational }">
                    <b v-if='g.hardGoal'>{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</b>
                    <template v-else>{{ g.goal.replace(/Goal/, '') | splitCamelCase }}</template>
                  </label>
              </div>
              </template>
            </div>
            <div class="col-md-4">
              <div class="form-group">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='disallow_capacity_estimation'>
                  <label class="form-check-label">
                    Disallow Capacity Estimation
                  </label>
                </div>
              </div>
              <div class="form-group">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='skip_hard_goal_check' :disabled='disable_skip_hard_goal_check && actionName !== "topic_configuration"'>
                  <label class="form-check-label">
                    Skip Hard Goal Check
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("skip_rack_awareness_check")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='skip_rack_awareness_check'>
                  <label class="form-check-label">
                    Skip Rackawareness Check
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("use_ready_default_goals")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='use_ready_default_goals' :disabled='disable_use_ready_default_goals'>
                  <label class="form-check-label">
                    Use Ready Default Goals
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("kafka_assigner")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='kafka_assigner' :disabled='disable_kafka_assigner'>
                  <label class="form-check-label">
                    Kafka Assigner Mode
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("throttle_added_broker")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='throttle_added_broker'>
                  <label class="form-check-label">
                    Throttle Added Broker
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("throttle_removed_broker")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='throttle_removed_broker'>
                  <label class="form-check-label">
                    Throttle Removed Broker
                  </label>
                </div>
              </div>
              <div class="form-group" v-if='supports("rebalance_disk_broker_by_broker")'>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='rebalance_disk_broker_by_broker'>
                  <label class="form-check-label" title="rebalance_disk_broker_by_broker: finish moving replicas between the disks of a broker before starting on the next broker">
                    One Broker At A Time ❓
                  </label>
                </div>
              </div>
              <div class="form-group">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" v-model='dryrun'>
                  <label class="form-check-label">
                    Dryrun
                  </label>
                </div>
              </div>
              <!-- the table picks the brokers an action acts on (for Rebalance Broker Disks: the brokers whose disks are
                   rebalanced); this picker the brokers replicas may move to -->
              <div class="form-row" v-if='supports("destination_broker_ids") && actionName !== "rebalance_disk"'>
                <label class="col-sm-12" :title='actionName === "remove" ? "destination_broker_ids: the brokers the replicas of the removed brokers may move to (none = any other broker). The brokers being removed are not offered." : "destination_broker_ids: the brokers replicas may move to (none = any broker)"'>Destination Brokers ❓</label>
                <div class="col-sm-12">
                  <broker-picker v-model="destination_broker_ids" :brokers="pickerBrokers" :exclude="actionName === 'remove' ? selectedBrokers : []" empty-text="none: any broker" />
                </div>
              </div>
              <p v-if='actionName === "rebalance_disk" && !selectedBrokers.length' class="small text-muted mt-2">Select brokers in the table above to limit the disk rebalance to them (none = every broker).</p>
            </div>

            <div class="col-md-4">
              <div class="form-row">
                <label class="col-sm-6">Use Data From:</label>
                <div class="col-sm-6">
                  <select v-model=data_from class="form-control">
                    <option value=''>(CC Default)</option>
                    <option value='valid_windows'>Valid Windows</option>
                    <option value='valid_partitions'>Valid Partitions</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <label class="col-sm-6">Excluded Topics <b title="Excluded Topics takes Regular Expression. Mutually exclusive with Included Topics.">❓</b></label>
                <div class="col-sm-6">
                  <input type='text' v-model='excluded_topics' class="form-control" placeholder='(CC Default)' :disabled='!!included_topics'>
                </div>
              </div>
              <div class="form-row">
                <label class="col-sm-6">Included Topics <b title="Only these topics may move (full-match regex). Overrides the configured topic exclusion, so __.* topics can be included explicitly. Mutually exclusive with Excluded Topics.">❓</b></label>
                <div class="col-sm-6">
                  <input type='text' v-model='included_topics' class="form-control" placeholder='(none)' :disabled='!!excluded_topics'>
                </div>
              </div>
              <div class="form-row" v-if='supports("concurrent_partition_movements_per_broker")'>
                <label class="col-sm-6">Concurrent Partition Movements Per Broker:</label>
                <div class="col-sm-6">
                  <input class="form-control" type='number' min=0 v-model='concurrent_partition_movements_per_broker' placeholder='(CC Default)'>
                </div>
              </div>
              <div class="form-row" v-if='supports("max_partition_movements_in_cluster")'>
                <label class="col-sm-6" title="max_partition_movements_in_cluster: the cap on inter-broker partition movements in progress at once in the whole cluster">Max Partition Movements In Cluster ❓</label>
                <div class="col-sm-6">
                  <input class="form-control" type='number' min=1 v-model='max_partition_movements_in_cluster' placeholder='(CC Default)'>
                </div>
              </div>
              <div class="form-row" v-if='supports("concurrent_intra_broker_partition_movements")'>
                <label class="col-sm-6">Concurrent Intra Broker Partition Movements:</label>
                <div class="col-sm-6">
                  <input class="form-control" type='number' min=0 v-model='concurrent_intra_broker_partition_movements' placeholder='(CC Default)'>
                </div>
              </div>
              <div class="form-row" v-if='supports("concurrent_leader_movements")'>
                <label class="col-sm-6">Concurrent Leader Movements:</label>
                <div class="col-sm-6">
                  <input class="form-control" type='number' min=0 v-model='concurrent_leader_movements' placeholder='(CC Default)'>
                </div>
              </div>
              <div class="form-row mb-1" v-if='supports("replication_throttle")'>
                <label class="col-sm-6">Replication Throttle:</label>
                <div class="col-sm-6">
                  <throttle-input v-model='replication_throttle' />
                </div>
              </div>
              <div class="form-row mb-1" v-if='supports("log_dir_throttle")'>
                <label class="col-sm-6" title="log_dir_throttle: upper bound on the bandwidth used to move replicas between the disks of a broker. Falls back to default.log.dir.throttle; without either, log-dir moves are unthrottled.">Log Dir Throttle: ❓</label>
                <div class="col-sm-6">
                  <throttle-input v-model='log_dir_throttle' :min='1' />
                </div>
              </div>
              <div class="form-row" v-if='supports("replica_movement_strategies")'>
                <label class="col-sm-6" title="Applied only when executing (ignored by a dry run). The first strategy decides the order, the next ones break ties.">Replica Movement Strategies: ❓</label>
                <div class="col-sm-6">
                  <strategy-picker v-model='replica_movement_strategies' />
                </div>
              </div>
            </div>
          </div>
          </template>
          <div class="text-right">
            <button @click.prevent='actionBroker' class="btn btn-primary">
              {{ actionMeta.button }}<template v-if="actionMeta.withBrokers"> {{ selectedBrokers }}</template><template v-if="!showAdvanced"> With Default Options</template>
            </button>
          </div>
        </form>
      </div>

      <!-- Demote Broker/Disk Flags -->
      <div class="alert alert-warning" v-if='(selectedBrokers.length > 0 || brokerIdAndLogDirs.length > 0) && actionName === "demote"'>
        <h5>Demote Flags</h5>
        <p>This moves all the leader replicas away from the list of brokers or disks. For log dirs, it only works with online log dirs. It doesn't affect single-ISR replicas.</p>
        <hr>
        <form @submit.prevent>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model='dryrun'>
            <label class="form-check-label">DryRun</label>
          </div>
          <hr>
          <div class="row">
            <div class="col-md-3">
              <div class="form-inline">
                <label class="form-label"> Concurrent Leader Movements </label>
                <input type="number" class="form-input" v-model='concurrent_leader_movements' placeholder='(CC Default)'>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">Replication Throttle:</label>
              <throttle-input v-model='replication_throttle' />
            </div>
            <div class="col-md-3">
              <label class="form-label" title="Applied only when executing (ignored by a dry run)">Replica Movement Strategies: ❓</label>
              <strategy-picker v-model='replica_movement_strategies' />
            </div>
            <div class="col-md-3">
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" v-model='disallow_capacity_estimation'>
                <label class="form-check-label">
                  Disallow Capacity Estimation
                </label>
              </div>
            </div>
          </div>
          <div class="text-right">
            <button v-if="selectedBrokers.length > 0" @click='actionBroker' class="btn btn-primary">Demote Brokers {{ selectedBrokers }}</button>
            <button v-else @click='actionBroker' class="btn btn-primary">Demote Disks {{ brokerIdAndLogDirs }}</button>
          </div>
        </form>
      </div>

      <!-- Remove Disk Flags -->
      <div class="alert alert-danger" v-if='brokerIdAndLogDirs.length > 0 && actionName === "remove_disks"'>
        <h5>Remove Disk Flags</h5>
        <p>This removes replicas off from selected disks. Note that it only works for online log dirs. If there's offline log dirs available, use "Fix Offline Replicas" or other endpoints.</p>
        <hr>
        <form @submit.prevent>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model='dryrun'>
            <label class="form-check-label">DryRun</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model='disallow_capacity_estimation'>
            <label class="form-check-label">Disallow Capacity Estimation</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model='remove_disks_verbose'>
            <label class="form-check-label" title="Returns the proposed replica movements (with their logdirs) and the load before the disk removal">Verbose ❓</label>
          </div>
          <div class="text-right">
            <button v-if="brokerIdAndLogDirs.length > 0" @click='actionBroker' class="btn btn-primary">Remove Disks {{ brokerIdAndLogDirs }}</button>
          </div>
        </form>
      </div>

      <!-- Admin Flags: what has no other place. Self-healing is switched on the Anomaly Detector page, and the throttles and
           concurrency of an ongoing execution on the Executor page (CC applies them to the ongoing execution only). -->
      <div class="alert alert-warning" v-if='actionName === "admin"'>
        <h5>Admin Flags</h5>
        <p>Switches that outlive executions: the adjusters (they stay as set until changed again or until Cruise Control
          restarts), and the recently removed / demoted brokers. Empty fields and "Unchanged" options are not sent.</p>
        <p class="small text-muted mb-0">Elsewhere: self-healing on the Anomaly Detector page; the throttles and concurrency of
          an ongoing execution under "Throttles, Concurrency &amp; Live Controls" on the Executor page. The concurrency of an
          execution you are about to start goes in that action's own form ("Show All Options"): an execution starts from its
          own request (or the config), whatever was set here before.</p>
        <hr>
        <form @submit.prevent>
          <h6>Adjusters</h6>
          <div class="row mb-2">
            <label class="form-label col-md-4" title="replication_throttle_adjustment: global switch of the concurrency adjuster's replication throttle adjustment (a restart reverts it to the config). Turning it off keeps the throttle at its last value for the rest of the execution. CC does not report its current value; the response shows before/after.">Replication Throttle Adjustment ❓</label>
            <div class="col-md-3">
              <select class="form-control form-control-sm" v-model="replication_throttle_adjustment">
                <option value="">Unchanged</option>
                <option value="true">Enable</option>
                <option value="false">Disable</option>
              </select>
            </div>
          </div>
          <div class="row mb-2">
            <label class="form-label col-md-4"> Enable Concurrency Adjuster For </label>
            <div class="col-md-8">
              <div class="form-check form-check-inline" v-for="t in concurrencyTypes" :key="'cen-' + t">
                <input class="form-check-input" type="checkbox" :value="t" v-model="enable_concurrency_adjuster_for" :disabled="disable_concurrency_adjuster_for.includes(t)">
                <label class="form-check-label small">{{ t }}</label>
              </div>
            </div>
          </div>
          <div class="row mb-2">
            <label class="form-label col-md-4"> Disable Concurrency Adjuster For </label>
            <div class="col-md-8">
              <div class="form-check form-check-inline" v-for="t in concurrencyTypes" :key="'cdis-' + t">
                <input class="form-check-input" type="checkbox" :value="t" v-model="disable_concurrency_adjuster_for" :disabled="enable_concurrency_adjuster_for.includes(t)">
                <label class="form-check-label small">{{ t }}</label>
              </div>
            </div>
          </div>
          <div class="row mb-2">
            <label class="form-label col-md-4"> Min ISR Based Concurrency Adjustment </label>
            <div class="col-md-3">
              <select class="form-control form-control-sm" v-model="min_isr_based_concurrency_adjustment">
                <option value="">Unchanged</option>
                <option value="true">Enable</option>
                <option value="false">Disable</option>
              </select>
            </div>
          </div>
          <hr>
          <h6>Recently Removed / Demoted Brokers</h6>
          <div class="row mb-1">
            <div class="form-inline col-md-12">
              <label class="form-label col-md-4"> Drop Recently Removed Brokers </label>
              <input type="text" class="form-input col-md-6" v-model='drop_recently_removed_brokers' placeholder='List of comma-separated broker ids'>
            </div>
          </div>
          <div class="row mb-2">
            <div class="form-inline col-md-12">
              <label class="form-label col-md-4"> Drop Recently Demoted Brokers </label>
              <input type="text" class="form-input col-md-6" v-model='drop_recently_demoted_brokers' placeholder='List of comma-separated broker ids'>
            </div>
          </div>
          <div class="text-right">
            <button @click='actionBroker' class="btn btn-primary">Configure</button>
          </div>
        </form>
      </div>

        <div v-if='posted'>
          <div v-if='postAsync'>
            <div class="alert alert-info text-center">
              Cruise Control is still computing this request (Task-Id: {{ postTaskId }}); it is polled every {{ asyncRetrySeconds }}s.
              <button class="btn btn-sm btn-secondary ml-2" @click='pollPost()'>⟳ Check Now</button>
              <button class="btn btn-sm btn-outline-secondary ml-1" @click='clearPostResponse'>Stop Waiting</button>
            </div>
            <async-task :asyncData='postResponse'></async-task>
          </div>
          <div v-else-if='postResponse'>
            <button class="btn btn-info mb-2" @click='clearPostResponse'>Clear Response</button>
            <div v-if='postError'>
              <exception :exception='postResponse'></exception>
            </div>
            <div v-else>
              <div class="alert alert-success">Action submitted successfully.</div>
              <optimization-result v-if="dataParsed" :result="postResponse" />
              <div v-else-if='typeof postResponse === "object"'>
                <h6>Response Summary</h6>
                <table class="table table-sm table-bordered">
                  <thead class="thead-light">
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(val, key) in flatSummary" :key="key">
                      <td>{{ key }}</td>
                      <td class="response-value">{{ val }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <button class="btn btn-sm btn-outline-secondary mb-2" @click="showRawResponse = !showRawResponse">
              {{ showRawResponse ? 'Hide' : 'Show' }} Raw Response
            </button>
            <pre v-if="showRawResponse" class="bg-light p-2 border" style="max-height:400px;overflow:auto;white-space:pre-wrap"><code>{{ typeof postResponse === 'string' ? postResponse : JSON.stringify(postResponse, null, 2) }}</code></pre>
          </div>
          <div class='alert alert-success' v-else>
            Waiting for Response ...
          </div>
        </div>
    </div>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
// Disable this due to https://github.com/linkedin/cruise-control-ui/issues/40
// import xssFilters from 'xss-filters'
import goals from '@/goals'
import BrokerState from '@/components/BrokerState'
import OptimizationResult from '@/components/OptimizationResult'
import ThrottleInput from '@/components/ThrottleInput'
import BrokerPicker from '@/components/BrokerPicker'
import StrategyPicker from '@/components/StrategyPicker'
import { CONCURRENCY_TYPES } from '@/ccOptions'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
const sortBy = require('lodash.sortby')

// The goal-based actions. params lists the request parameters each one supports (see the endpoints' OpenAPI spec), so
// that a form shows, and a request carries, only parameters the endpoint accepts.
const OPTIMIZATION_PARAMS = ['goals', 'skip_hard_goal_check', 'use_ready_default_goals', 'allow_capacity_estimation', 'data_from',
  'excluded_topics', 'included_topics', 'concurrent_partition_movements_per_broker', 'max_partition_movements_in_cluster',
  'concurrent_leader_movements', 'replication_throttle', 'replica_movement_strategies']
const OPTIMIZATION_ACTIONS = {
  rebalance: {
    endpoint: 'rebalance',
    title: 'Rebalance Cluster Flags',
    alertClass: 'alert-info',
    button: 'Execute Rebalance',
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'destination_broker_ids'])
  },
  rebalance_disk: {
    endpoint: 'rebalance',
    title: 'Rebalance Broker Disks Flags',
    alertClass: 'alert-primary',
    description: 'Only rebalance replicas between disks in an intra-broker manner.',
    button: 'Run Broker Disk Rebalance',
    goalGroup: 3,
    params: ['goals', 'skip_hard_goal_check', 'allow_capacity_estimation', 'data_from', 'excluded_topics', 'included_topics',
      'destination_broker_ids', 'rebalance_disk_broker_by_broker', 'concurrent_intra_broker_partition_movements', 'log_dir_throttle']
  },
  add: {
    endpoint: 'add_broker',
    title: 'Add Broker Flags',
    alertClass: 'alert-success',
    description: 'Choose new brokers which can accept replicas. Replicas will only be moved from the existing brokers to the provided new brokers.',
    button: 'Add Brokers',
    withBrokers: true,
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'throttle_added_broker'])
  },
  remove: {
    endpoint: 'remove_broker',
    title: 'Remove Broker Flags',
    alertClass: 'alert-danger',
    description: 'Select brokers to decomission and remove them from replicas. This only moves partitions from the brokers to be removed. Ignores excluded topics.',
    button: 'Remove Brokers',
    withBrokers: true,
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'throttle_removed_broker', 'destination_broker_ids'])
  },
  fix_offline_replicas: {
    endpoint: 'fix_offline_replicas',
    title: 'Fix Offline Replicas Flags',
    alertClass: 'alert-info',
    description: 'This moves all the offline replicas from dead disks/brokers',
    button: 'Fix Offline Replicas',
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS
  },
  topic_configuration: {
    endpoint: 'topic_configuration',
    title: 'Topic Configuration Flags',
    alertClass: 'alert-success',
    description: 'Use this for changing replication factor of a topic',
    button: 'Change Replication Factor',
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['skip_rack_awareness_check'])
  }
}

function isSet (v) {
  return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
}

export default {
  name: 'AdminBroker',
  props: {
    group: String,
    cluster: String
  },
  components: {
    BrokerState,
    OptimizationResult,
    ThrottleInput,
    BrokerPicker,
    StrategyPicker
  },
  data () {
    return {
      sortColumn: 'Broker', // column on which data needs to be sorted
      loading: false, // true if the data is being fetched now
      loaded: false, // true if data is fetched at-least once
      error: false, // in case server sent non 200 OK Response
      errorData: null, // complete error data
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      selectedBrokers: [],
      // This is the response from the CC
      KafkaBrokerState: {
        OfflineLogDirsByBrokerId: {},
        ReplicaCountByBrokerId: {},
        OutOfSyncCountByBrokerId: {},
        OnlineLogDirsByBrokerId: {},
        LeaderCountByBrokerId: {},
        OfflineReplicaCountByBrokerId: {}
      },
      brokerDetails: {}, // host, rack, state per broker from /load endpoint
      enableLogDirSelection: false,
      selectedLogDirs: {},
      adminFilterText: '',
      adminSortColumn: 'bid', // column to sort admin broker table
      allGoals: goals, // goals from configuration
      concurrencyTypes: CONCURRENCY_TYPES,
      /*
       * x                              Goals   Disallow-Capacity-Estimation   Skip-Hard-Goal-Check   Use-Ready-Default-Goals   Kafka-Assigner-Mode   Module
       * Goals                          1       1                              1                      0                         0                     Analyzer
       * Disallow-Capacity-Estimation   1       1                              1                      1                         1                     Capacity-Resolver
       * Skip-Hard-Goal-Check           1       1                              1                      1                         0                     Analyzer
       * Use-Ready-Default-Goals        0       1                              1                      1                         0                     Analyzer
       * Kafka-Assigner-Mode            0       1                              0                      0                         1                     Analyzer
       */
      // disable user flags
      disable_goals1: false,
      disable_skip_hard_goal_check: false,
      disable_use_ready_default_goals: false,
      disable_kafka_assigner: false,
      // user flags
      showAdvanced: false, // show all options on UI ?
      showURL: false, // show the URL on UI if true
      goals1: [], // goals of the chosen action (inter-broker goals, or intra-broker goals for rebalance_disk)
      skip_hard_goal_check: false, // Check CC Documentation
      use_ready_default_goals: false, // Check CC Documentation
      disallow_capacity_estimation: false, // Check CC Documentation
      kafka_assigner: false, // Check CC Documentation
      data_from: '', // Check CC Documentation
      excluded_topics: '', // Check CC Documentation
      included_topics: '', // mutually exclusive with excluded_topics
      concurrent_partition_movements_per_broker: null, // Check CC Documentation
      max_partition_movements_in_cluster: null,
      concurrent_leader_movements: null, // Check CC Documentation
      replication_throttle: null, // bytes/s
      log_dir_throttle: null, // bytes/s, rebalance_disk only
      replica_movement_strategies: [], // in chain order
      destination_broker_ids: [], // the destination picker (Rebalance Broker Disks uses the brokers selected in the table)
      rebalance_disk_broker_by_broker: false,
      throttle_removed_broker: false, // Check CC Documentation
      throttle_added_broker: false, // Check CC Documentation
      skip_rack_awareness_check: false, // Used for some APIs
      topic_regex: '', // Used for topic_configuration
      replication_factor: null, // Used for topic_configuration
      remove_disks_verbose: true,
      // admin flags
      concurrent_intra_broker_partition_movements: null,
      drop_recently_removed_brokers: null,
      drop_recently_demoted_brokers: null,
      disable_concurrency_adjuster_for: [],
      enable_concurrency_adjuster_for: [],
      min_isr_based_concurrency_adjustment: '', // '' = unchanged, 'true', 'false'
      replication_throttle_adjustment: '', // '' = unchanged, 'true', 'false'
      // workflow
      actionName: 'ple', // radio to chose an action on ui
      dryrun: true, // part of URL
      posted: false, // true if a POST method is made
      posturl: null, // POST url (also polled while the response is async)
      postResponse: {}, // POST response from server
      postAsync: false, // true while CC is still computing the POST (202 with a User-Task-ID)
      postTaskId: null,
      postRetryTimer: null,
      asyncRetrySeconds: ASYNC_RETRY_DELAY / 1000,
      detectedUserTaskId: false, // true in case the response has user-task-id
      postError: false, // true if the POST response is an error
      showRawResponse: false, // toggle raw JSON response view
      showAsyncRefreshButton: false, // show refresh button during async state
      dataParsed: false
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
    if (this.postRetryTimer) {
      clearTimeout(this.postRetryTimer)
    }
  },
  computed: {
    disableGoals () {
      return this.kafka_assigner || this.use_ready_default_goals
    },
    actionMeta () {
      return OPTIMIZATION_ACTIONS[this.actionName] || null
    },
    actionGoals () {
      const group = this.actionMeta ? this.actionMeta.goalGroup : 1
      return this.allGoals.goals.filter(g => !g.skip && g.group === group)
    },
    // the brokers the destination picker offers
    pickerBrokers () {
      return this.sortedAdminBrokers.map(r => ({ id: r.bid, host: r.host, rack: r.rack })).sort((a, b) => a.id - b.id)
    },
    sortedAdminBrokers () {
      const vm = this
      const rows = Object.keys(vm.KafkaBrokerState.ReplicaCountByBrokerId).map(function (bid) {
        const d = vm.brokerDetails[bid]
        return {
          bid: parseInt(bid, 10),
          host: d ? d.Host : '',
          rack: d && d.Rack && d.Rack !== d.Host ? d.Rack : '',
          state: d ? d.BrokerState : '',
          replicas: vm.KafkaBrokerState.ReplicaCountByBrokerId[bid] || 0,
          leaders: vm.KafkaBrokerState.LeaderCountByBrokerId[bid] || 0,
          outofsync: vm.KafkaBrokerState.OutOfSyncCountByBrokerId[bid] || 0,
          offlineReplicas: vm.KafkaBrokerState.OfflineReplicaCountByBrokerId ? (vm.KafkaBrokerState.OfflineReplicaCountByBrokerId[bid] || 0) : 0,
          onlineLogDirs: vm.KafkaBrokerState.OnlineLogDirsByBrokerId && vm.KafkaBrokerState.OnlineLogDirsByBrokerId[bid] ? vm.KafkaBrokerState.OnlineLogDirsByBrokerId[bid].length : 0,
          offlineLogDirs: vm.KafkaBrokerState.OfflineLogDirsByBrokerId && vm.KafkaBrokerState.OfflineLogDirsByBrokerId[bid] ? vm.KafkaBrokerState.OfflineLogDirsByBrokerId[bid].length : 0,
          OnlineLogDirsByBrokerId: vm.KafkaBrokerState.OnlineLogDirsByBrokerId,
          OfflineLogDirsByBrokerId: vm.KafkaBrokerState.OfflineLogDirsByBrokerId
        }
      })
      return sortBy(rows, vm.adminSortColumn)
    },
    filteredAdminBrokers () {
      const f = parseFilter(this.adminFilterText)
      return this.sortedAdminBrokers.filter(b => matchesFilter(f, [b.bid], [b.host, b.rack]))
    },
    brokerIdAndLogDirs (n) {
      return Object.keys(this.selectedLogDirs).filter(k => this.selectedLogDirs[k])
    },
    flatSummary () {
      if (!this.postResponse || typeof this.postResponse !== 'object') return {}
      const result = {}
      const skip = ['loadBeforeOptimization', 'loadAfterOptimization', 'goalSummary', 'goals', 'summary', 'proposals']
      Object.keys(this.postResponse).forEach(key => {
        if (skip.indexOf(key) !== -1) return
        const val = this.postResponse[key]
        if (val === null || val === undefined || val === '') return
        result[key] = typeof val === 'object' ? JSON.stringify(val) : String(val).trim()
      })
      return result
    },
    adminParams () {
      const vm = this
      const params = {}
      const set = (key, value) => { if (isSet(value)) params[key] = value }
      set('drop_recently_removed_brokers', vm.drop_recently_removed_brokers)
      set('drop_recently_demoted_brokers', vm.drop_recently_demoted_brokers)
      set('disable_concurrency_adjuster_for', vm.disable_concurrency_adjuster_for)
      set('enable_concurrency_adjuster_for', vm.enable_concurrency_adjuster_for)
      set('min_isr_based_concurrency_adjustment', vm.min_isr_based_concurrency_adjustment)
      set('replication_throttle_adjustment', vm.replication_throttle_adjustment)
      return params
    },
    actionURL () {
      const vm = this
      const action = vm.actionName
      if (action === 'admin') {
        // POST /kafkacruisecontrol/admin
        return vm.$helpers.getURL('admin', vm.adminParams)
      }
      const params = { dryrun: vm.dryrun }
      const set = (key, value) => { if (isSet(value)) params[key] = value }
      if (action === 'ple') {
        params.verbose = true
        if (vm.concurrent_leader_movements > 0) {
          params.concurrent_leader_movements = vm.concurrent_leader_movements
        }
        params.goals = 'PreferredLeaderElectionGoal'
        return vm.$helpers.getURL('rebalance', params)
      }
      if (action === 'demote') {
        // POST /kafkacruisecontrol/demote_broker
        params.verbose = true
        if (vm.selectedBrokers.length > 0) {
          params.brokerid = vm.selectedBrokers
        } else if (vm.brokerIdAndLogDirs.length > 0) {
          params.brokerid_and_logdirs = vm.brokerIdAndLogDirs.join(',')
        }
        if (vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
        set('concurrent_leader_movements', vm.concurrent_leader_movements)
        set('replication_throttle', vm.replication_throttle)
        set('replica_movement_strategies', vm.replica_movement_strategies)
        return vm.$helpers.getURL('demote_broker', params)
      }
      if (action === 'remove_disks') {
        // POST /kafkacruisecontrol/remove_disks
        params.brokerid_and_logdirs = vm.brokerIdAndLogDirs.join(',')
        if (vm.remove_disks_verbose) params.verbose = true
        if (vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
        return vm.$helpers.getURL('remove_disks', params)
      }
      const meta = vm.actionMeta
      if (!meta) return ''
      // POST /kafkacruisecontrol/{rebalance,add_broker,remove_broker,fix_offline_replicas,topic_configuration}
      params.verbose = true
      const supports = (p) => meta.params.includes(p)
      if (action === 'rebalance_disk') params.rebalance_disk = true
      if (action === 'topic_configuration') {
        params.topic = vm.topic_regex
        params.replication_factor = vm.replication_factor
      }
      if (meta.withBrokers) params.brokerid = vm.selectedBrokers
      // goals run in the listed order (their priority), not in the order they were ticked
      if (supports('goals')) set('goals', vm.actionGoals.map(g => g.goal).filter(g => vm.goals1.includes(g)))
      if (supports('skip_hard_goal_check') && vm.skip_hard_goal_check) params.skip_hard_goal_check = true
      if (supports('skip_rack_awareness_check') && vm.skip_rack_awareness_check) params.skip_rack_awareness_check = true
      if (supports('use_ready_default_goals') && vm.use_ready_default_goals) params.use_ready_default_goals = true
      if (supports('allow_capacity_estimation') && vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
      if (supports('kafka_assigner') && vm.kafka_assigner) params.kafka_assigner = true
      if (supports('throttle_added_broker') && vm.throttle_added_broker) params.throttle_added_broker = true
      if (supports('throttle_removed_broker') && vm.throttle_removed_broker) params.throttle_removed_broker = true
      if (supports('rebalance_disk_broker_by_broker') && vm.rebalance_disk_broker_by_broker) params.rebalance_disk_broker_by_broker = true
      if (supports('data_from')) set('data_from', vm.data_from)
      // Disable this due to https://github.com/linkedin/cruise-control-ui/issues/40
      // params.excluded_topics = xssFilters.uriQueryInDoubleQuotedAttr(vm.excluded_topics)
      if (supports('excluded_topics')) set('excluded_topics', vm.excluded_topics)
      if (supports('included_topics')) set('included_topics', vm.included_topics)
      if (supports('concurrent_partition_movements_per_broker')) set('concurrent_partition_movements_per_broker', vm.concurrent_partition_movements_per_broker)
      if (supports('max_partition_movements_in_cluster')) set('max_partition_movements_in_cluster', vm.max_partition_movements_in_cluster)
      if (supports('concurrent_intra_broker_partition_movements')) set('concurrent_intra_broker_partition_movements', vm.concurrent_intra_broker_partition_movements)
      if (supports('concurrent_leader_movements')) set('concurrent_leader_movements', vm.concurrent_leader_movements)
      if (supports('replication_throttle')) set('replication_throttle', vm.replication_throttle)
      if (supports('log_dir_throttle')) set('log_dir_throttle', vm.log_dir_throttle)
      if (supports('replica_movement_strategies')) set('replica_movement_strategies', vm.replica_movement_strategies)
      if (supports('destination_broker_ids')) {
        // Rebalance Broker Disks: the brokers selected in the table; the other actions: the destination picker
        const ids = action === 'rebalance_disk' ? vm.selectedBrokers : vm.destination_broker_ids
        if (ids.length) params.destination_broker_ids = ids.join(',')
      }
      return vm.$helpers.getURL(meta.endpoint, params)
    }
  },
  watch: {
    goals1: function (n, o) {
      this.disable_use_ready_default_goals = n.length > 0
      this.disable_kafka_assigner = n.length > 0
    },
    skip_hard_goal_check: function (n, o) {
      // console.log(n, o)
      if (n) {
        this.disable_kafka_assigner = true
      } else {
        this.disable_kafka_assigner = false
      }
    },
    use_ready_default_goals: function (n, o) {
      if (n) {
        this.goals1 = []
      }
      this.disable_goals1 = n
    },
    kafka_assigner: function (n, o) {
      if (n) {
        this.goals1 = []
        this.disable_goals1 = true
        this.disable_skip_hard_goal_check = true
        this.disable_use_ready_default_goals = true
      } else {
        this.disable_goals1 = false
        this.disable_skip_hard_goal_check = false
        this.disable_use_ready_default_goals = false
      }
    },
    showAdvanced: function (n, o) {
      if (!n) {
        this.goals1 = []
        this.disallow_capacity_estimation = false
        this.skip_hard_goal_check = false
        this.use_ready_default_goals = false
        this.kafka_assigner = false
        this.data_from = ''
        this.excluded_topics = ''
        this.included_topics = ''
        this.concurrent_partition_movements_per_broker = null
        this.destination_broker_ids = []
        this.max_partition_movements_in_cluster = null
        this.concurrent_intra_broker_partition_movements = null
        this.concurrent_leader_movements = null
        this.replication_throttle = null
        this.log_dir_throttle = null
        this.replica_movement_strategies = []
        this.rebalance_disk_broker_by_broker = false
      }
    },
    actionName: function (n, o) {
      // the intra-broker goals of rebalance_disk are not accepted by the other actions, and vice versa
      const group = (action) => OPTIMIZATION_ACTIONS[action] ? OPTIMIZATION_ACTIONS[action].goalGroup : null
      if (group(n) !== group(o)) {
        this.goals1 = []
      }
    },
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    },
    selectedBrokers () {
      this.syncActionWithSelection()
    },
    brokerIdAndLogDirs () {
      this.syncActionWithSelection()
    }
  },
  methods: {
    sortAdmin (col) {
      this.adminSortColumn = col
    },
    // whether the chosen goal-based action's endpoint accepts this request parameter
    supports (param) {
      return !!this.actionMeta && this.actionMeta.params.includes(param)
    },
    // switch away from an action the current broker / logdir selection does not allow
    syncActionWithSelection () {
      if (this.selectedBrokers.length > 0) {
        if (['ple', 'rebalance', 'fix_offline_replicas', 'remove_disks', 'topic_configuration', 'admin'].includes(this.actionName)) {
          this.actionName = 'add'
        }
      } else if (this.brokerIdAndLogDirs.length > 0) {
        if (['ple', 'rebalance', 'rebalance_disk', 'add', 'remove', 'fix_offline_replicas', 'topic_configuration', 'admin'].includes(this.actionName)) {
          this.actionName = 'remove_disks'
        }
      } else {
        if (['add', 'remove', 'demote', 'remove_disks'].includes(this.actionName)) {
          this.actionName = 'ple'
        }
      }
    },
    clearPostResponse () {
      if (this.postRetryTimer) {
        clearTimeout(this.postRetryTimer)
        this.postRetryTimer = null
      }
      this.posted = false
      this.posturl = null
      this.postResponse = ''
      this.postAsync = false
      this.postTaskId = null
      this.postError = false
      this.showRawResponse = false
      this.dataParsed = false
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
      this.clearPostResponse()
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getKafkaState()
      this.getBrokerDetails()
    },
    actionBroker () {
      this.clearPostResponse()
      this.posted = true
      this.posturl = this.actionURL
      this.post()
    },
    // Poll a POST that CC answered with 202 (still computing): the same request with the User-Task-ID CC gave for it.
    pollPost () {
      if (this.postRetryTimer) {
        clearTimeout(this.postRetryTimer)
        this.postRetryTimer = null
      }
      if (this.posturl && this.postTaskId) {
        this.post(this.postTaskId)
      }
    },
    post (taskId) {
      const vm = this
      const url = vm.posturl
      const config = { withCredentials: true }
      // A User-Task-ID header only polls the task CC created for this very request; a new POST must not carry one
      // (CC rejects a stale task ID with an "Unexpected header" error).
      if (taskId) {
        config.headers = { 'User-Task-ID': taskId }
      }
      this.$http.post(url, null, config).then((r) => {
        if (vm.posturl !== url) return // cleared or replaced meanwhile
        vm.detectedUserTaskId = Object.prototype.hasOwnProperty.call(r.headers, 'user-task-id')
        vm.posted = true
        vm.postError = false
        const data = r.data
        vm.postResponse = data
        if (r.status === 202 && vm.detectedUserTaskId) {
          vm.postAsync = true
          vm.postTaskId = r.headers['user-task-id']
          vm.postRetryTimer = setTimeout(() => vm.pollPost(), ASYNC_RETRY_DELAY)
          return
        }
        vm.postAsync = false
        const summary = (data && data.summary) || data
        vm.dataParsed = !!(summary && typeof summary === 'object' && (summary.numReplicaMovements != null || summary.numLeaderMovements != null || summary.numIntraBrokerReplicaMovements != null))
      }, (e) => {
        if (vm.posturl !== url) return
        vm.posted = true
        vm.postAsync = false
        vm.postError = true
        vm.postResponse = e && e.response ? e.response.data : e
      })
    },
    getBrokerDetails () {
      const vm = this
      const url = vm.$helpers.getURL('load', { allow_capacity_estimation: true })
      fetchCC(url).then((result) => {
        if (result.type === 'success' && result.data && result.data.brokers) {
          const details = {}
          result.data.brokers.forEach(function (b) {
            details[String(b.Broker)] = b
          })
          vm.brokerDetails = details
        }
      }).catch(() => {
        // silently ignore - broker details are supplementary
      })
    },
    getKafkaState () {
      const vm = this
      vm.error = false
      vm.async = false
      vm.loading = true
      const url = vm.$helpers.getURL('kafka_cluster_state')
      fetchCC(url).then((result) => {
        vm.detectedUserTaskId = result.headers.has('user-task-id')
        if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.loaded = false
          vm.error = true
          vm.errorData = result.data || result.status
        } else if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with 200-OK status code. Please file a bug here https://github.com/linkedin/cruise-control/issues'
        } else if (result.type === 'async') {
          vm.loading = false
          vm.async = true
          vm.asyncData = result.data
          vm.showAsyncRefreshButton = true
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getKafkaState(), ASYNC_RETRY_DELAY)
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.error = false
          vm.errorData = null
          vm.loading = false
          vm.loaded = true
          vm.showAsyncRefreshButton = false
          const data = result.data
          vm.KafkaBrokerState.ReplicaCountByBrokerId = data.KafkaBrokerState.ReplicaCountByBrokerId
          vm.KafkaBrokerState.OutOfSyncCountByBrokerId = data.KafkaBrokerState.OutOfSyncCountByBrokerId
          vm.KafkaBrokerState.LeaderCountByBrokerId = data.KafkaBrokerState.LeaderCountByBrokerId
          try {
            vm.KafkaBrokerState.OfflineReplicaCountByBrokerId = data.KafkaBrokerState.OfflineReplicaCountByBrokerId
            Object.keys(data.KafkaBrokerState.OfflineLogDirsByBrokerId).forEach(broker => {
              vm.KafkaBrokerState.OfflineLogDirsByBrokerId[broker] = data.KafkaBrokerState.OfflineLogDirsByBrokerId[broker].sort()
            })
            Object.keys(data.KafkaBrokerState.OnlineLogDirsByBrokerId).forEach(broker => {
              vm.KafkaBrokerState.OnlineLogDirsByBrokerId[broker] = data.KafkaBrokerState.OnlineLogDirsByBrokerId[broker].sort()
            })
          } catch (e) {
            // Kafka 2.0 features not available
          }
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e
      })
    }
  }
}
</script>

<style scoped>
.pointer { cursor: pointer; }
.response-value { white-space: pre-wrap; }
.filter-input { min-width: 300px; }
</style>
