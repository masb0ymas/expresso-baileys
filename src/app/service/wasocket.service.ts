import { type proto } from '@whiskeysockets/baileys'
import { getSession, isExistWhatsapp } from '~/config/wasocket'
import ResponseError from '~/core/modules/response/ResponseError'

interface ISendMessage {
  session_id: string
  to: string
  message: string
  isGroup?: boolean
  answering?: proto.IWebMessageInfo
}

export default class WaSocketService {
  /**
   *
   * @param values
   * @returns
   */
  public static async sendMessage(
    values: ISendMessage
  ): Promise<proto.WebMessageInfo | undefined> {
    const { session_id, to, message, isGroup, answering } = values
    const session = getSession(session_id)

    if (!session) {
      throw new ResponseError.BadRequest(`${session_id} invalid session id`)
    }

    const isExist = isExistWhatsapp(session_id, to, isGroup)

    if (!isExist) {
      throw new ResponseError.NotFound(`${to} is not registered on whatsapp`)
    }

    const data = await session.sendMessage(
      to,
      { text: message },
      { quoted: answering }
    )

    return data
  }
}
