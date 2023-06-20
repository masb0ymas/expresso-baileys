/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import makeWaSocket, {
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  proto,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WAMessageContent,
  type WAMessageKey,
  type WASocket,
} from '@whiskeysockets/baileys'
import { ms } from 'expresso-core'
import fs from 'fs'
import path from 'path'
import { logger } from '~/config/pino'
import ResponseError from '~/core/modules/response/ResponseError'

interface IConnectWhatsapp {
  session_id: string
  options?: {
    printQRCode?: boolean
  }
}

interface IOnQRUpdated {
  session_id: string
  qrcode: string
}

// const phoneHelper = new Phonenumber({ country: 'ID' })

const useStore = !process.argv.includes('--no-store')
const doReplies = !process.argv.includes('--no-reply')

// initialize
const WaSessions = new Map<string, WASocket>()
const WaCallback = new Map<string, Function>()
const WaRetryCount = new Map<string, number>()

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger }) : undefined
store?.readFromFile('./temp/baileys_store_multi.json')

// save every 12s
setInterval(() => {
  store?.writeToFile('./temp/baileys_store_multi.json')
}, ms('12s'))

/**
 *
 * @param session_id
 * @returns
 */
function authStorage(session_id: string): string {
  const result = `./temp/${session_id}_credentials`

  return result
}

/**
 * Connect To Whatsapp
 * @returns
 */
export async function startBaileys(
  values: IConnectWhatsapp
): Promise<WASocket> {
  const { session_id, options } = values

  // Connecting To Whatsapp
  const startWaSocket = async (): Promise<WASocket> => {
    // credentials
    const storageFileAuth = authStorage(session_id)
    const { state, saveCreds } = await useMultiFileAuthState(storageFileAuth)

    // fetch latest version of WA Web
    const { version, isLatest } = await fetchLatestBaileysVersion()
    logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`)

    // Initialize Whatsapp Socket
    const sock: WASocket = makeWaSocket({
      version,
      logger,
      browser: Browsers.macOS('Safari'),
      syncFullHistory: true,
      printQRInTerminal: options?.printQRCode ?? true,
      auth: {
        creds: state.creds,
        /** caching makes the store faster to send/recv messages */
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
    })

    store?.bind(sock.ev)

    // set session
    WaSessions.set(session_id, { ...sock })

    /**
     *
     * @param msg
     * @param jid
     */
    async function sendMessageWTyping(
      msg: AnyMessageContent,
      jid: string
    ): Promise<void> {
      await sock.presenceSubscribe(jid)
      await delay(500)

      await sock.sendPresenceUpdate('composing', jid)
      await delay(2000)

      await sock.sendPresenceUpdate('paused', jid)

      await sock.sendMessage(jid, msg)
    }

    /**
     *
     * @param key
     * @returns
     */
    async function getMessage(
      key: WAMessageKey
    ): Promise<WAMessageContent | undefined> {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid!, key.id!)
        return msg?.message ?? undefined
      }

      // only if store is present
      return proto.Message.fromObject({})
    }

    // the process function lets you process all events that just occurred
    // efficiently in a batch
    sock.ev.process(
      // events is a map for event name => event data
      async (events) => {
        // something about the connection changed
        // maybe it closed, or we received all offline message or connection opened
        if (events['connection.update']) {
          const update = events['connection.update']
          const { connection, lastDisconnect } = update

          // check update qrcode
          if (update.qr) {
            WaCallback.get('on-qr')?.({
              session_id,
              qr: update.qr,
            })
          }

          // check connecting
          if (connection === 'connecting') {
            WaCallback.get('on-connecting')?.(session_id)
          }

          if (connection === 'close') {
            // @ts-expect-error
            const statusCode = lastDisconnect?.error?.output?.statusCode
            let retryCount = WaRetryCount.get(session_id) ?? 0

            let isRetry: boolean = false

            // reconnect if not logged out
            if (statusCode !== DisconnectReason.loggedOut && retryCount < 10) {
              isRetry = true
            }

            if (isRetry) {
              retryCount += 1

              WaRetryCount.set(session_id, retryCount)
              await startWaSocket()
            } else {
              WaRetryCount.delete(session_id)
              await deleteSession(session_id)
              WaCallback.get('on-disconnected')?.(session_id)

              logger.info('Connection closed. You are logged out.')
            }
          }

          if (connection === 'open') {
            WaRetryCount.delete(session_id)
            WaCallback.get('on-connected')?.(session_id)
          }

          logger.info('connection update', update)
        }

        // credentials updated -- save them
        if (events['creds.update']) {
          await saveCreds()
        }

        if (events['labels.association']) {
          console.log(events['labels.association'])
        }

        if (events['labels.edit']) {
          console.log(events['labels.edit'])
        }

        if (events.call) {
          console.log('recv call event', events.call)
        }

        // history received
        if (events['messaging-history.set']) {
          const { chats, contacts, messages, isLatest } =
            events['messaging-history.set']
          logger.info(
            `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`
          )
        }

        // received a new message
        if (events['messages.upsert']) {
          const upsert = events['messages.upsert']
          logger.info('recv messages ', JSON.stringify(upsert, undefined, 2))

          if (upsert.type === 'notify') {
            for (const msg of upsert.messages) {
              if (!msg.key.fromMe && doReplies) {
                logger.info('replying to', msg.key.remoteJid)

                await sock.readMessages([msg.key])
                await sendMessageWTyping(
                  { text: 'Hello there!' },

                  msg.key.remoteJid!
                )
              }
            }
          }
        }

        // messages updated like status delivered, message deleted etc.
        if (events['messages.update']) {
          logger.info(JSON.stringify(events['messages.update'], undefined, 2))

          for (const { key, update } of events['messages.update']) {
            if (update.pollUpdates) {
              const pollCreation = await getMessage(key)
              if (pollCreation) {
                logger.info(
                  'got poll update, aggregation: ',
                  getAggregateVotesInPollMessage({
                    message: pollCreation,
                    pollUpdates: update.pollUpdates,
                  })
                )
              }
            }
          }
        }

        if (events['message-receipt.update']) {
          logger.info(events['message-receipt.update'])
        }

        if (events['messages.reaction']) {
          logger.info(events['messages.reaction'])
        }

        if (events['presence.update']) {
          logger.info(events['presence.update'])
        }

        if (events['chats.update']) {
          logger.info(events['chats.update'])
        }

        if (events['contacts.update']) {
          for (const contact of events['contacts.update']) {
            if (typeof contact.imgUrl !== 'undefined') {
              const newUrl =
                contact.imgUrl === null
                  ? null
                  : await sock.profilePictureUrl(contact.id!).catch(() => null)

              logger.info(
                `contact ${contact.id} has a new profile pic: ${newUrl}`
              )
            }
          }
        }

        if (events['chats.delete']) {
          logger.info('chats deleted ', events['chats.delete'])
        }
      }
    )

    return sock
  }

  return await startWaSocket()
}

/**
 *
 * @param session_id
 * @returns
 */
export function getSession(session_id: string): WASocket | undefined {
  return WaSessions.get(session_id)
}

/**
 *
 * @param session_id
 * @returns
 */
export function isExistSession(session_id: string): boolean {
  const storageFileAuth = authStorage(session_id)

  if (
    fs.existsSync(storageFileAuth) &&
    fs.readdirSync(storageFileAuth) &&
    getSession(session_id)
  ) {
    return true
  }

  return false
}

/**
 *
 * @param session_id
 * @returns
 */
export function isShouldLoadSession(session_id: string): boolean {
  const storageFileAuth = authStorage(session_id)

  if (
    fs.existsSync(storageFileAuth) &&
    fs.readdirSync(storageFileAuth) &&
    !getSession(session_id)
  ) {
    return true
  }

  return false
}

/**
 * Load Session
 */
export function loadSession(): void {
  const tempDir = path.resolve('temp')

  if (fs.existsSync(tempDir)) {
    fs.readdir(tempDir, async (err: any, dirs: string[]) => {
      if (err) {
        logger.error(`Error: ${err}`)
        throw new ResponseError.InternalServer(
          "can't load session, directory not found"
        )
      }

      for (const dir of dirs) {
        const session_id = dir.split('_')[0]
        if (!isShouldLoadSession(session_id)) continue

        await startBaileys({ session_id })
      }
    })
  }
}

/**
 * On Message Received
 * @param listener
 */
export function onMessageReceived(
  listener: (msg: { session_id: string }) => any
): void {
  WaCallback.set('on-message-received', listener)
}

/**
 * On QR Code Updated
 * @param listener
 */
export function onQRUpdated(
  listener: ({ session_id, qrcode }: IOnQRUpdated) => any
): void {
  WaCallback.set('on-qr', listener)
}

/**
 * On Connected
 * @param listener
 */
export function onConnected(listener: (session_id: string) => any): void {
  WaCallback.set('on-connected', listener)
}

/**
 * On Connecting
 * @param listener
 */
export function onConnecting(listener: (session_id: string) => any): void {
  WaCallback.set('on-connecting', listener)
}

/**
 * On Disconnected
 * @param listener
 */
export function onDisconnected(listener: (session_id: string) => any): void {
  WaCallback.set('on-disconnected', listener)
}

/**
 *
 * @param session_id
 */
export async function deleteSession(session_id: string): Promise<void> {
  const session = getSession(session_id)
  const storageFileAuth = authStorage(session_id)

  try {
    await session?.logout()
  } catch (err) {
    session?.end(undefined)
    WaSessions.delete(session_id)

    const authDir = path.resolve(storageFileAuth)
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { force: true, recursive: true })

      const message = 'has been deleted, please create new session again!'
      logger.info(`Session: ${session_id}, ${message}`)
    }
  }
}
