// A direct placement of an activity that is not saved yet: the form keeps
// the list and enters it with the first save (components/Placements.vue).

export interface PendingPlacement {
  personId: string
  displayName: string
  className: string
  /** Instead of the class activities of that time (the default), or beside them. */
  leavesClass: boolean
}
