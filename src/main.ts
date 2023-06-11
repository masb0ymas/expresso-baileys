import 'module-alias/register'
import '~/core/modules/pathAlias'

import http from 'http'
import { App } from './config/app'
import { env } from './config/env'
import { httpHandle } from './core/modules/http/handle'
import { connectToWhatsapp } from './app/service/wasocket.service'

function bootstrap(): void {
  const port = env.APP_PORT

  // run wa socket
  void connectToWhatsapp()

  // create express app
  const app = new App().create()
  const server = http.createServer(app)

  // http handle
  const { onError, onListening } = httpHandle(server, port)

  // run server listen
  server.listen(port)
  server.on('error', onError)
  server.on('listening', onListening)
}

bootstrap()
