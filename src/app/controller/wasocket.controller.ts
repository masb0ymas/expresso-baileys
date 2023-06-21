import { type Request, type Response } from 'express'
import { toDataURL } from 'qrcode'
import { logger } from '~/config/pino'
import { onQRUpdated, startBaileys } from '~/config/wasocket'
import HttpResponse from '~/core/modules/response/HttpResponse'
import { asyncHandler } from '~/core/utils/asyncHandler'
import { yupOptions } from '~/core/utils/yup'
import route from '~/routes/v1'
import wasocketSchema from '../schema/wasocket.schema'
import whatsappSchema from '../schema/whatsapp.schema'
import WaSocketService from '../service/wasocket.service'
import { Phonenumber } from 'expresso-core'

const phoneHelper = new Phonenumber({ country: 'ID' })

route.post(
  '/wa/session',
  asyncHandler(async function createSession(req: Request, res: Response) {
    const formData = req.getBody()

    const value = wasocketSchema.create.validateSync(formData, yupOptions)

    onQRUpdated(async (data) => {
      logger.info(data, 'Test')

      const qr = await toDataURL(data.qr)

      const httpResponse = HttpResponse.get({ qr })
      res.status(200).json(httpResponse)
    })

    await startBaileys({
      session_id: value.session,
      options: { printQR: true },
    })
  })
)

route.post(
  '/wa/send-message',
  asyncHandler(async function sendMessage(req: Request, res: Response) {
    const formData = req.getBody()

    const value = whatsappSchema.sendMessage.validateSync(formData, yupOptions)
    const phone = phoneHelper.formatWhatsapp(value.phone)

    const data = await WaSocketService.sendMessage({
      session_id: value.session_id,
      to: String(phone),
      message: value.message,
    })

    const httpResponse = HttpResponse.get({ data })
    res.status(200).json(httpResponse)
  })
)
