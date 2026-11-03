// What a page tells the person about an action: that it is running, that
// it failed and why (in the API's words, lib/api-rules.ts), or that it
// worked. One helper, so every page shows these the same way.

import { ref } from 'vue'
import { errorMessage } from './api-rules.ts'
import { SCHOOL_TIME_ZONE } from './format.ts'
import { INTL_LOCALE } from './i18n.ts'

export function useFeedback() {
  const busy = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)

  /** Runs `action`; a failure becomes the error text, `done` the notice. Returns whether it succeeded. */
  async function run(action: () => Promise<void>, done?: string): Promise<boolean> {
    busy.value = true
    error.value = null
    notice.value = null
    try {
      await action()
      if (done !== undefined) notice.value = done
      return true
    } catch (err) {
      error.value = errorMessage(err)
      return false
    } finally {
      busy.value = false
    }
  }

  return { busy, error, notice, run }
}

const when = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** A date and time as the lists show them, in the school's locale and time zone (an instant near midnight keeps the school's date in a browser elsewhere). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '–'
  return when.format(new Date(iso))
}
