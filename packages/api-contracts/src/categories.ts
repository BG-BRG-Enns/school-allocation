// The school's categories (school-core rules.ts): one list for every
// registration, read by everyone signed in, kept by organizers and
// administrators. An activity belongs to none, one or several; a rule asks
// for some of one.

import { MAX_CATEGORIES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { SingleLineText, StrictObject } from './common.ts'

export const CategorySchema = StrictObject({ id: Type.String(), name: Type.String() })
export type Category = Static<typeof CategorySchema>

export const CategoriesResponse = StrictObject({ categories: Type.Array(CategorySchema, { maxItems: MAX_CATEGORIES }) })
export type CategoriesResponse = Static<typeof CategoriesResponse>

/** A category with what names it: an activity or a rule in any registration keeps it from being removed. */
export const CategoryUsageSchema = StrictObject({ ...CategorySchema.properties, items: Type.Integer(), rules: Type.Integer() })
export type CategoryUsage = Static<typeof CategoryUsageSchema>

export const CategoryUsageResponse = StrictObject({ categories: Type.Array(CategoryUsageSchema) })
export type CategoryUsageResponse = Static<typeof CategoryUsageResponse>

export const CategoryBody = StrictObject({ name: SingleLineText(60) })
