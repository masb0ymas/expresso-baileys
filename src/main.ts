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
} from '@whiskeysockets/baileys'
import express, { type Request, type Response } from 'express'
import { Phonenumber, ms } from 'expresso-core'
import http from 'http'
import _ from 'lodash'
import pino from 'pino'
import app from './config/app'
import whatsappSchema from './schema/whatsapp.schema'

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})

const useStore = !process.argv.includes('--no-store')
const doReplies = !process.argv.includes('--no-reply')

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger }) : undefined
store?.readFromFile('./baileys_store_multi.json')

// save every 12s
setInterval(() => {
  store?.writeToFile('./baileys_store_multi.json')
}, ms('12s'))

const phoneHelper = new Phonenumber({ country: 'ID' })

/**
 * Connect To Whatsapp
 * @returns
 */
async function connectToWhatsapp(): Promise<typeof makeWaSocket> {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')

  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion()
  logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`)

  // Initialize Whatsapp Socket
  const sock = makeWaSocket({
    version,
    logger,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true,
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      /** caching makes the store faster to send/recv messages */
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  })

  store?.bind(sock.ev)

  /**
   *
   * @param msg
   * @param jid
   */
  const sendMessageWTyping = async (
    msg: AnyMessageContent,
    jid: string
  ): Promise<void> => {
    await sock.presenceSubscribe(jid)
    await delay(500)

    await sock.sendPresenceUpdate('composing', jid)
    await delay(2000)

    await sock.sendPresenceUpdate('paused', jid)

    await sock.sendMessage(jid, msg)
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
        if (connection === 'close') {
          // reconnect if not logged out
          if (
            // @ts-expect-error
            lastDisconnect?.error?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            void connectToWhatsapp()
          } else {
            logger.info('Connection closed. You are logged out.')
          }
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
        console.log(events['message-receipt.update'])
      }

      if (events['messages.reaction']) {
        console.log(events['messages.reaction'])
      }

      if (events['presence.update']) {
        console.log(events['presence.update'])
      }

      if (events['chats.update']) {
        console.log(events['chats.update'])
      }

      if (events['contacts.update']) {
        for (const contact of events['contacts.update']) {
          if (typeof contact.imgUrl !== 'undefined') {
            const newUrl =
              contact.imgUrl === null
                ? null
                : await sock.profilePictureUrl(contact.id!).catch(() => null)
            console.log(
              `contact ${contact.id} has a new profile pic: ${newUrl}`
            )
          }
        }
      }

      if (events['chats.delete']) {
        console.log('chats deleted ', events['chats.delete'])
      }
    }
  )

  // root api
  app.get('/', async function root(req: Request, res: Response) {
    return res.status(200).json({
      code: 200,
      message: 'expresso whatsapp is ready...',
      data: sock.user,
    })
  })

  // declare version 1
  app.get('/v1', async function version1(req: Request, res: Response) {
    return res.status(403).json({ code: 403, message: 'Forbidden' })
  })

  // declare router
  const router = express.Router()
  app.use('/v1', router)

  // send message
  router.post(
    '/send-message',
    async function sendMessage(req: Request, res: Response) {
      const formData = req.body

      const value = whatsappSchema.sendMessage.validateSync(formData, {
        abortEarly: false,
        stripUnknown: true,
      })

      const newPhone = phoneHelper.formatWhatsapp(value.phone)

      if (sock.user) {
        const phoneWa = await sock.onWhatsApp(newPhone)
        console.log({ phoneWa })

        if (_.isEmpty(phoneWa) || !phoneWa?.[0].exists) {
          const errMessage = 'phone number are not registrated!'
          return res.status(400).json({ code: 400, message: errMessage })
        }

        const jid = phoneWa[0].jid

        const data = await sock.sendMessage(jid, { text: value.message })
        return res.status(200).json({ data })
      }

      const errMessage = 'please check your whatsapp connectivity'
      return res.status(400).json({ code: 400, message: errMessage })
    }
  )

  // @ts-expect-error
  return sock
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

// Connect To Whatsapp
void connectToWhatsapp().then(() => {
  const port = process.env.PORT ?? 8000
  const server = http.createServer(app)

  server.listen(port, () => {
    logger.info(`Listening on port ${port}`)
  })
})
