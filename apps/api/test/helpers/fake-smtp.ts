// A stand-in for the school's SMTP server on a local port: plain ESMTP
// with AUTH PLAIN and LOGIN, no TLS, every message recorded, and the reply
// after DATA under the test's control (250 by default, 4xx or 5xx to
// provoke retries and failures). Ported from an internal mail service by
// the same author.

import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'

export interface ReceivedMail {
  from: string
  to: string[]
  /** Raw message as transmitted, dot-unstuffed, CRLF line ends. */
  data: string
}

export interface FakeSmtpOptions {
  /** Reply after the message data, possibly delayed. Default: 250 OK. */
  dataReply?: (mail: ReceivedMail, count: number) => string | Promise<string>
  /** The credentials the server takes; others get 535. */
  credentials?: { user: string, password: string }
}

export interface FakeSmtp {
  port: number
  host: string
  received: ReceivedMail[]
  /** The users that authenticated, in order. */
  logins: string[]
  connections: number
  close: () => Promise<void>
}

function angleAddress(line: string): string {
  const open = line.indexOf('<')
  const close = line.indexOf('>', open + 1)
  if (open !== -1 && close !== -1) return line.slice(open + 1, close)
  return line.slice(line.indexOf(':') + 1).trim()
}

export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const name = 'mail.schule.example.org'
  const received: ReceivedMail[] = []
  const logins: string[] = []
  const credentials = options.credentials ?? { user: 'wahl', password: 'test-password' }
  let connections = 0
  const sockets = new Set<Socket>()
  const dataReply = options.dataReply ?? (() => '250 OK queued')

  const server: Server = createServer((socket) => {
    connections++
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => { /* client went away */ })
    let buffer = ''
    let inData = false
    let loginStep: 'user' | 'password' | null = null
    let loginUser = ''
    let from = ''
    let to: string[] = []
    let lines: string[] = []
    const write = (reply: string) => socket.write(reply + '\r\n')
    write(`220 ${name} ESMTP fake`)

    const authenticated = (user: string, password: string) => {
      if (user === credentials.user && password === credentials.password) {
        logins.push(user)
        write('235 2.7.0 Authentication successful')
      } else {
        write('535 5.7.8 Authentication credentials invalid')
      }
    }

    const command = (line: string) => {
      if (loginStep === 'user') {
        loginUser = Buffer.from(line, 'base64').toString('utf8')
        loginStep = 'password'
        write('334 UGFzc3dvcmQ6')
        return
      }
      if (loginStep === 'password') {
        loginStep = null
        authenticated(loginUser, Buffer.from(line, 'base64').toString('utf8'))
        return
      }
      const verb = line.split(/[\s:]/, 1)[0]?.toUpperCase() ?? ''
      switch (verb) {
        case 'EHLO':
          socket.write(`250-${name} Hello\r\n250-8BITMIME\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 52428800\r\n`)
          break
        case 'HELO':
          write(`250 ${name}`)
          break
        case 'AUTH': {
          const [, mechanism, initial] = line.split(' ')
          if (mechanism?.toUpperCase() === 'PLAIN' && initial) {
            const [, user = '', password = ''] = Buffer.from(initial, 'base64').toString('utf8').split('\0')
            authenticated(user, password)
          } else if (mechanism?.toUpperCase() === 'LOGIN') {
            loginStep = 'user'
            write('334 VXNlcm5hbWU6')
          } else {
            write('504 5.5.4 Unrecognized authentication type')
          }
          break
        }
        case 'MAIL':
          from = angleAddress(line)
          to = []
          write('250 OK')
          break
        case 'RCPT':
          to.push(angleAddress(line))
          write('250 OK')
          break
        case 'DATA':
          inData = true
          lines = []
          write('354 End data with <CR><LF>.<CR><LF>')
          break
        case 'RSET':
          from = ''
          to = []
          write('250 OK')
          break
        case 'NOOP':
          write('250 OK')
          break
        case 'QUIT':
          write('221 Bye')
          socket.end()
          break
        default:
          write('502 Command not implemented')
      }
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\r\n')
      while (index !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            const mail = { from, to, data: lines.map((l) => (l.startsWith('..') ? l.slice(1) : l)).join('\r\n') + '\r\n' }
            received.push(mail)
            Promise.resolve(dataReply(mail, received.length)).then(write, () => socket.destroy())
          } else {
            lines.push(line)
          }
        } else {
          command(line)
        }
        index = buffer.indexOf('\r\n')
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    port,
    host: '127.0.0.1',
    received,
    logins,
    get connections() { return connections },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    },
  }
}

/** Header value from a raw message, unfolded; null when absent. */
export function headerOf(data: string, name: string): string | null {
  const headers = data.split('\r\n\r\n', 1)[0] ?? ''
  const unfolded = headers.replaceAll(/\r\n[ \t]+/g, ' ')
  const pattern = new RegExp(`^${name}:\\s*(.*)$`, 'im')
  return pattern.exec(unfolded)?.[1]?.trim() ?? null
}

/** A header value with its RFC 2047 encoded words decoded (UTF-8, Q or B encoding), as a mail client shows it. */
export function decodeHeader(value: string): string {
  return value.replaceAll(/=\?UTF-8\?([QB])\?([^?]*)\?=(\s+(?==\?))?/gi, (_, encoding: string, text: string) => {
    if (encoding.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8')
    const bytes = text.replaceAll('_', ' ').replaceAll(/=([0-9A-F]{2})/gi, (__, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    return Buffer.from(bytes, 'latin1').toString('utf8')
  })
}

/** The decoded text body of a raw message, for a plain-text mail as the sender writes it (quoted-printable or 7bit). */
export function bodyOf(data: string): string {
  const [headers = '', ...rest] = data.split('\r\n\r\n')
  const body = rest.join('\r\n\r\n')
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    return body.replaceAll(/=\r\n/g, '').replaceAll(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  }
  if (/content-transfer-encoding:\s*base64/i.test(headers)) return Buffer.from(body, 'base64').toString('utf8')
  return body
}
