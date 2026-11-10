// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// The limits values are flagged against (Cluster Load cells and summary, Partition Load disks)

// a usage above it (% of the capacity) is flagged
export const LIMIT_PCT = 70

// a disk's share of a network rate of its broker above this many times the average share of the broker's disks is
// flagged (disk I/O): a disk has no network capacity of its own
export const DISK_IO_SKEW = 3

// the limit of a disk's share (%) on a broker with that many disks, or null
export function diskIoLimit (disks) {
  return disks > 0 ? DISK_IO_SKEW * 100 / disks : null
}
