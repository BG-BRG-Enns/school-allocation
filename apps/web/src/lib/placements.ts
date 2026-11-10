// What a form keeps of an activity that is not saved yet, and enters with
// the first save (components/Placements.vue): the students placed into it
// directly, and, for a class activity, who of its classes does not take part.

export interface PendingPlacement {
  personId: string
  displayName: string
  className: string
  /** Instead of the class activities of that time (the default), or beside them. */
  leavesClass: boolean
}

/** A student of one of the activity's classes on its list of who does not take part. */
export interface PendingAbsence {
  personId: string
  displayName: string
  className: string
}
