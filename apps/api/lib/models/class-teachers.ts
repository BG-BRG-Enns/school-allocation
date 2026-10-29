export type { ClassTeacher } from '@school-allocation/api-contracts'

export type { ClassWithTeachers } from '@school-allocation/api-contracts'

/** The students of a class in the roster in force, for its class teacher's page. */
export interface ClassStudent {
  personId: string
  displayName: string
}
