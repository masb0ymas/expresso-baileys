import { validateEmpty } from 'expresso-core'
import { useToken } from 'expresso-hooks'
import { type ExpiresType } from 'expresso-hooks/lib/token/interface'
import { type TOptions } from 'i18next'
import _ from 'lodash'
import { type Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { env } from '~/config/env'
import { i18n } from '~/config/i18n'
import ConstRole from '~/core/constants/ConstRole'
import { type IReqOptions } from '~/core/interface/ReqOptions'
import ResponseError from '~/core/modules/response/ResponseError'
import { yupOptions } from '~/core/utils/yup'
import { AppDataSource } from '~/database/data-source'
import {
  User,
  type LoginAttributes,
  type UserLoginAttributes,
} from '~/database/entities/User'
import { type DtoLogin } from '../interface/dto/Auth'
import userSchema from '../schema/user.schema'
import SessionService from './session.service'
import UserService from './user.service'

interface AuthRepository {
  userRepo: Repository<User>
}

export default class AuthService {
  /**
   * Collect Repository
   * @returns
   */
  private static _repository(): AuthRepository {
    const userRepo = AppDataSource.getRepository(User)

    return { userRepo }
  }

  /**
   *
   * @param formData
   * @returns
   */
  public static async signUp(formData: any): Promise<User> {
    // declare repository
    const { userRepo } = this._repository()

    const uid = uuidv4()

    const { token } = useToken.generate({
      value: { token: uid },
      secretKey: env.JWT_SECRET_ACCESS_TOKEN,
      expires: env.JWT_ACCESS_TOKEN_EXPIRED as ExpiresType,
    })

    let role_id = ConstRole.ID_USER

    // check role
    if (formData.roleAs === 'USER') {
      role_id = ConstRole.ID_USER
    }

    const newFormData = {
      ...formData,
      is_active: false,
      phone: validateEmpty(formData.phone),
      token_verify: token,
      role_id,
    }

    const value = userSchema.register.validateSync(newFormData, yupOptions)

    const formRegister: any = {
      ...value,
      password: value.confirm_new_password,
    }

    const data = new User()
    const newData = await userRepo.save({
      ...data,
      ...formRegister,
    })

    return newData
  }

  /**
   *
   * @param formData
   * @param options
   * @returns
   */
  public static async signIn(
    formData: LoginAttributes,
    options?: IReqOptions
  ): Promise<DtoLogin> {
    // declare repository
    const { userRepo } = this._repository()
    const i18nOpt: string | TOptions = { lng: options?.lang }

    const value = userSchema.login.validateSync(formData, yupOptions)

    const getUser = await userRepo.findOne({
      select: ['id', 'fullname', 'email', 'is_active', 'password', 'role_id'],
      where: { email: value.email },
    })

    // check user account
    if (!getUser) {
      const message = i18n.t('errors.account_not_found', i18nOpt)
      throw new ResponseError.NotFound(message)
    }

    // check active account
    if (!getUser.is_active) {
      const message = i18n.t('errors.please_check_your_email', i18nOpt)
      throw new ResponseError.BadRequest(message)
    }

    const matchPassword = await getUser.comparePassword(value.password)

    // compare password
    if (!matchPassword) {
      const message = i18n.t('errors.incorrect_email_or_pass', i18nOpt)
      throw new ResponseError.BadRequest(message)
    }

    const user_id = getUser.id
    const payloadToken = { uid: user_id }

    const { token, expiresIn } = useToken.generate({
      value: payloadToken,
      secretKey: env.JWT_SECRET_ACCESS_TOKEN,
      expires: env.JWT_ACCESS_TOKEN_EXPIRED as ExpiresType,
    })

    const message = i18n.t('success.login', i18nOpt)

    const newData = {
      message,
      accessToken: token,
      expiresIn,
      tokenType: 'Bearer',
      user: payloadToken,
      fullname: getUser.fullname,
    }

    return newData
  }

  /**
   *
   * @param user_id
   * @param token
   * @param options
   * @returns
   */
  public static async verifySession(
    user_id: string,
    token: string,
    options?: IReqOptions
  ): Promise<User | null> {
    const getSession = await SessionService.findByUserToken(user_id, token)

    const validateToken = useToken.verify({
      token: getSession.token,
      secretKey: env.JWT_SECRET_ACCESS_TOKEN,
    })

    const userToken = validateToken?.data as UserLoginAttributes

    if (!_.isEmpty(userToken.uid)) {
      const getUser = await UserService.findById(userToken.uid, { ...options })

      return getUser
    }

    return null
  }

  /**
   *
   * @param user_id
   * @param token
   * @param options
   * @returns
   */
  public static async logout(
    user_id: string,
    token: string,
    options?: IReqOptions
  ): Promise<string> {
    const i18nOpt: string | TOptions = { lng: options?.lang }

    const getUser = await UserService.findById(user_id, { ...options })

    // clean session
    await SessionService.deleteByUserToken(getUser.id, token)
    const message = i18n.t('success.logout', i18nOpt)

    return message
  }
}
