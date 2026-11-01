// The people of the tests: teachers and students of the stand-in's tenant.
// The API tests sign them in through the fake Entra's claims; the browser
// journeys choose them on its sign-in page. Nobody has an app role: who is
// what is the roster's to say (docs/identity-and-roles.md).

export interface Person {
  oid: string
  name: string
  /** The email claim; undefined leaves it out. */
  email?: string
  preferredUsername?: string
  /** An app-role claim, which the application ignores; here so a token can carry one. */
  roles?: string[]
}

export const ANNA: Person = { oid: 'a0000000-0000-4000-8000-00000000000a', name: 'Anna Zwexmhofer', email: 'anna.zwexmhofer@schule.example.org' }
export const BERND: Person = { oid: 'b0000000-0000-4000-8000-00000000000b', name: 'Bernd Pfnöxlhofer', email: 'bernd.pfnoexlhofer@schule.example.org' }
export const CARLA: Person = { oid: 'c0000000-0000-4000-8000-00000000000c', name: 'Carla Knoxbrunner', email: 'carla.knoxbrunner@schule.example.org' }
export const SARA: Person = { oid: 'd0000000-0000-4000-8000-00000000000d', name: 'Sara Pfnäxthuber', email: 'sara.pfnaexthuber@schule.example.org' }
export const TIM: Person = { oid: 'e0000000-0000-4000-8000-00000000000e', name: 'Tim Gnöxwieser', email: 'tim.gnoexwieser@schule.example.org' }

export const PERSONAS: readonly Person[] = [ANNA, BERND, CARLA, SARA, TIM]

/** The ID token claims of a person, as Entra would send them. */
export function claimsOf(person: Person): Record<string, unknown> {
  return {
    oid: person.oid,
    name: person.name,
    email: person.email,
    preferred_username: person.preferredUsername ?? person.email,
    roles: person.roles ?? [],
  }
}
