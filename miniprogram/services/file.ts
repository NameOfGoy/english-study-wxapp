// services/file.ts —— 文件上传（不走 request.ts，wx.uploadFile multipart）
//
// 为什么单独走 wx.uploadFile 而不复用 utils/request.ts：
//   request.ts 用 wx.request 发 application/json，无法发 multipart/form-data。
//   小程序上传文件唯一通道是 wx.uploadFile（它会把文件以 multipart 形式 POST，
//   formData 里的字段一起作为表单字段提交）。
//
// 后端契约（POST /api/v1/file-service/upload，需 JWT）：
//   - 文件字段名固定 'file'（后端 r.FormFile("file")）。
//   - 表单字段 bucket：必须空或 'englishstudy'（types.OssBucket），其余拒。
//   - 表单字段 object：客户端给相对对象名（如 avatar/{uid}/{ts}.{ext}）；
//     后端会强制加 per-user 命名空间，实际存为 upload/{userId}/{object}，
//     客户端不要自己拼 upload/ 前缀。
//   - 响应 body 为 JSON 字符串（wx.uploadFile 的 res.data 永远是 string，需 JSON.parse）：
//     { code, message, path }。注意 path 在 **顶层**，不是 data.path。
//     成功时 code===0，path 形如 /api/v1/file/englishstudy/upload/{userId}/avatar/...
//     —— 这正是可直接存进 UserInfo.avatar 的相对资源路径（渲染前过 resolveAsset）。

import config from '../config/index'
import { getToken } from '../utils/auth'

/** 上传接口路径（与 request.ts 约定一致：自带 /api/v1 前缀，host 由 config 提供） */
const UPLOAD_URL = '/api/v1/file-service/upload'

/** 上传桶名（后端白名单只放行这一个） */
export const OSS_BUCKET = 'englishstudy'

/** 后端上传响应 body 的结构（path 在顶层） */
interface UploadReplyBody {
  code: number
  message?: string
  path?: string
}

/**
 * 上传单个本地文件，返回后端给的相对资源路径（形如 /api/v1/file/{bucket}/...）。
 *
 * @param filePath 本地临时文件路径（wx.chooseMedia / wx.chooseImage 拿到的 tempFilePath）
 * @param bucket   桶名，默认 'englishstudy'（后端只放行这个）
 * @param object   相对对象名（如 avatar/{uid}/{ts}.{ext}）；不要带 upload/ 前缀，后端会加
 * @returns Promise<string> resolve 后端返回的相对 path；失败 reject(Error(message))
 *
 * 用法：
 *   const path = await uploadFile(tempFilePath, OSS_BUCKET, `avatar/${uid}/${Date.now()}.jpg`)
 *   // 把 path 存进 UserInfo.avatar，再 updateUser 落库；渲染前 resolveAsset(path)
 */
export function uploadFile(
  filePath: string,
  bucket: string = OSS_BUCKET,
  object: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const token = getToken()
    const header: WechatMiniprogram.IAnyObject = {}
    if (token) {
      header.Authorization = 'Bearer ' + token
    }

    wx.uploadFile({
      url: config.apiBaseUrl + UPLOAD_URL,
      filePath,
      name: 'file', // 后端 r.FormFile("file")，字段名固定
      header,
      formData: { bucket, object },
      success: (res) => {
        // 裸 HTTP 401：JWT 失效（上传接口同样要登录态）
        if (res.statusCode === 401) {
          reject(new Error('登录已失效，请重新登录'))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('上传失败(' + res.statusCode + ')'))
          return
        }
        // wx.uploadFile 的 res.data 永远是字符串，需手动 JSON.parse
        let body: UploadReplyBody
        try {
          body = JSON.parse(res.data) as UploadReplyBody
        } catch (e) {
          reject(new Error('上传响应解析失败'))
          return
        }
        if (!body || typeof body.code !== 'number') {
          reject(new Error('上传响应格式异常'))
          return
        }
        if (body.code === 0) {
          if (body.path) {
            resolve(body.path)
          } else {
            reject(new Error('上传成功但未返回文件路径'))
          }
          return
        }
        reject(new Error(body.message || '上传失败'))
      },
      fail: (err) => {
        reject(new Error(err && err.errMsg ? err.errMsg : '网络异常，上传失败'))
      }
    })
  })
}

/** 从临时文件路径里猜扩展名；取不到则兜底 jpg（chooseMedia 图片基本是 jpg/png） */
function guessExt(tempPath: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(tempPath)
  const ext = m ? m[1].toLowerCase() : ''
  return ext || 'jpg'
}

/**
 * 选图 + 上传头像便捷封装。
 * 流程：wx.chooseMedia(单图) → uploadFile 到 avatar/{uid}/{ts}.{ext} → 返回相对 path。
 *
 * @param uid 当前用户 id（用于拼 object 命名空间，对照 H5 的 avatar/{userId}/...）
 * @returns Promise<string> 头像相对资源路径（存进 UserInfo.avatar）；
 *          用户取消选图时 reject(Error('已取消'))，调用方可据此静默处理。
 *
 * 用法（我的页换头像）：
 *   const avatar = await chooseAndUploadAvatar(uid)
 *   await updateUser(uid, { ...userInfo, avatar })  // 落库
 *   // 本地 setUserInfo + 渲染 resolveAsset(avatar)
 */
export function chooseAndUploadAvatar(uid: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('未选择图片'))
          return
        }
        const ext = guessExt(file.tempFilePath)
        const object = `avatar/${uid}/${Date.now()}.${ext}`
        uploadFile(file.tempFilePath, OSS_BUCKET, object).then(resolve, reject)
      },
      fail: (err) => {
        // 用户主动取消属正常路径，不当错误冒泡 toast
        const msg = err && err.errMsg ? err.errMsg : ''
        if (/cancel/i.test(msg)) {
          reject(new Error('已取消'))
        } else {
          reject(new Error(msg || '选择图片失败'))
        }
      }
    })
  })
}
