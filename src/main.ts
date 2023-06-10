/* eslint-disable @typescript-eslint/no-non-null-assertion */
import makeWaSocket, {
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
  Browsers,
} from '@whiskeysockets/baileys'
import compression from 'compression'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { Phonenumber } from 'expresso-core'
import http from 'http'
import _ from 'lodash'
import path from 'path'
import pino from 'pino'
import pinoHttp from 'pino-http'

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

// save every 10s
setInterval(() => {
  store?.writeToFile('./baileys_store_multi.json')
}, 10_000)

const phoneHelper = new Phonenumber({ country: 'ID' })

/**
 * Initialize Express App
 */
const app = express()
app.use(compression())
app.use(cors())
app.use(
  pinoHttp({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'req,res,responseTime',
      },
    },

    // Define a custom receive message
    customReceivedMessage: function (req, res) {
      // @ts-expect-error
      const endpoint = `${req?.hostname}${req?.originalUrl}`

      return `request received: ${req.method} ${endpoint}`
    },

    // Define a custom success message
    customSuccessMessage: function (req, res) {
      // @ts-expect-error
      const endpoint = `${req?.hostname}${req?.originalUrl}`

      if (res.statusCode === 404) {
        return 'resource not found'
      }

      return `${res.statusCode} ${req.method} ${endpoint} completed`
    },

    // Define a custom error message
    customErrorMessage: function (req, res, err) {
      return `request errored with status code: ${res.statusCode}, error : ${err.message}`
    },
  })
)
app.use(express.json({ limit: '200mb', type: 'application/json' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.resolve(`${__dirname}/../public`)))

/**
 * Connect To Whatsapp
 * @returns
 */
async function connectToWhatsapp(): Promise<typeof makeWaSocket> {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')

  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

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
            console.log('Connection closed. You are logged out.')
          }
        }

        console.log('connection update', update)
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
        console.log(
          `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`
        )
      }

      // received a new message
      if (events['messages.upsert']) {
        const upsert = events['messages.upsert']
        console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

        if (upsert.type === 'notify') {
          for (const msg of upsert.messages) {
            if (!msg.key.fromMe && doReplies) {
              console.log('replying to', msg.key.remoteJid)
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
        console.log(JSON.stringify(events['messages.update'], undefined, 2))

        for (const { key, update } of events['messages.update']) {
          if (update.pollUpdates) {
            const pollCreation = await getMessage(key)
            if (pollCreation) {
              console.log(
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

  app.get('/', async function root(req: Request, res: Response) {
    return res.status(200).json({
      code: 200,
      message: 'expresso whatsapp is ready...',
      data: sock.user,
    })
  })

  app.get('/v1', async function root(req: Request, res: Response) {
    return res.status(403).json({ code: 403, message: 'Forbidden' })
  })

  const router = express.Router()
  app.use('/v1', router)

  router.post(
    '/send-message',
    async function sendMessage(req: Request, res: Response) {
      const { phone, message } = req.body

      const newPhone = phoneHelper.formatWhatsapp(phone)

      if (sock.user) {
        const phoneWa = await sock.onWhatsApp(newPhone)
        console.log({ phoneWa })

        if (_.isEmpty(phoneWa) || !phoneWa?.[0].exists) {
          const errMessage = 'phone number are not registrated!'
          return res.status(400).json({ code: 400, message: errMessage })
        }

        const jid = phoneWa[0].jid

        const data = await sock.sendMessage(jid, { text: message })
        return res.status(200).json({ data })
      }

      const errMessage = 'please check your whatsapp connectivity'
      return res.status(400).json({ code: 400, message: errMessage })
    }
  )

  // @ts-expect-error
  return sock
}

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

// Run Whatsapp Socker
void connectToWhatsapp().then(() => {
  const port = process.env.PORT ?? 8000
  const server = http.createServer(app)

  server.listen(port, () => {
    logger.info(`[server]: Listening on port ${port}`)
  })
})
