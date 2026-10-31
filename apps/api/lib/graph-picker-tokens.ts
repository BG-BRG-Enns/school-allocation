import { randomBytes } from 'node:crypto'

interface PickerToken {
  accessToken: string
  userId: string
  expiresAt: number
}

/** Per-app-instance token handles: never persisted, returned to the browser or logged. */
export class GraphPickerTokens {
  private readonly tokens = new Map<string, PickerToken>()
  private readonly now: () => number

  /** `now` in milliseconds, from the database's clock (lib/clock.ts). */
  constructor(now: () => number) {
    this.now = now
  }

  store(userId: string, accessToken: string): string {
    const handle = randomBytes(24).toString('base64url')
    this.tokens.set(handle, { userId, accessToken, expiresAt: this.now() + 50 * 60 * 1000 })
    return handle
  }

  read(handle: string | undefined, userId: string): string | undefined {
    const now = this.now()
    for (const [key, token] of this.tokens) if (token.expiresAt <= now) this.tokens.delete(key)
    const token = handle === undefined ? undefined : this.tokens.get(handle)
    return token?.userId === userId ? token.accessToken : undefined
  }

  forget(handle: string | undefined): void {
    if (handle !== undefined) this.tokens.delete(handle)
  }
}
