import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import type { DescMessage, MessageInitShape, MessageShape } from '@bufbuild/protobuf'

const TOKEN_HEADER = 'X-Quizgate-Token'

/** 后端的错误报文是 text/plain 的中文提示，直接拿来当用户可见文案。 */
export class RpcError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/**
 * 一个请求 = 一次 POST + 裸 protobuf 报文，和安卓两端走同一条协议，服务端没有 JSON 层。
 * init 缺省给空对象：全默认值报文序列化成 0 字节，服务端的 @RequestBody(required=false) 认这种请求。
 */
export async function rpc<Req extends DescMessage, Res extends DescMessage>(
  path: string,
  reqSchema: Req,
  resSchema: Res,
  init?: MessageInitShape<Req>,
  token?: string,
): Promise<MessageShape<Res>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-protobuf' }
  if (token !== undefined) headers[TOKEN_HEADER] = token

  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers,
    body: toBinary(reqSchema, create(reqSchema, init)),
  })
  if (!res.ok) {
    const detail = (await res.text()).trim() || `HTTP ${res.status}`
    throw new RpcError(res.status, detail)
  }
  return fromBinary(resSchema, new Uint8Array(await res.arrayBuffer()))
}
