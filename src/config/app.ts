import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import path from 'path'
import { pinoLoggerHttp } from './pino'

const app = express()

app.use(compression())
app.use(helmet())
app.use(cors())
app.use(pinoLoggerHttp())
app.use(express.json({ limit: '200mb', type: 'application/json' }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.resolve(`${__dirname}/../../public`)))

export default app
