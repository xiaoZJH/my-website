'use strict';

/**
 * 短信验证码发送模块（零依赖）
 *
 * 行为：
 *  - 未配置腾讯云密钥（开发态）：仅把验证码打印到服务器控制台，并返回 false（由 API 在响应里回传 devCode 方便本地测试）。
 *  - 已配置密钥（生产态）：使用 Node 全局 fetch + TC3-HMAC-SHA256 调用腾讯云 SMS SendSms。
 *
 * 生产所需环境变量（在服务器上 export 或通过 .env 注入）：
 *  TENCENT_SMS_SECRET_ID      腾讯云 API 密钥 ID
 *  TENCENT_SMS_SECRET_KEY     腾讯云 API 密钥 Key
 *  TENCENT_SMS_SDK_APP_ID     短信 SdkAppId（形如 1400000000）
 *  TENCENT_SMS_SIGN_NAME      已审核通过的短信签名
 *  TENCENT_SMS_TEMPLATE_ID     验证码模板 ID（注册/通用）
 *  TENCENT_SMS_TEMPLATE_LOGIN 可选：登录验证码模板 ID（缺省用 TENCENT_SMS_TEMPLATE_ID）
 *  TENCENT_SMS_REGION         可选：默认 ap-guangzhou
 */

const crypto = require('crypto');

function sha256hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac256(key, s) { return crypto.createHmac('sha256', key).update(s, 'utf8').digest(); }
function hmac256hex(key, s) { return crypto.createHmac('sha256', key).update(s, 'utf8').digest('hex'); }

async function tencentRequest(secretId, secretKey, service, action, version, region, payloadObj) {
  const host = service + '.tencentcloudapi.com';
  const endpoint = 'https://' + host;
  const payload = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000);
  // UTC 日期（腾讯云要求 YYYY-MM-DD）
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const algorithm = 'TC3-HMAC-SHA256';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' +
    'host:' + host + '\n' +
    'x-tc-action:' + action.toLowerCase() + '\n';
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = sha256hex(payload);
  const canonicalRequest =
    'POST' + '\n' + canonicalUri + '\n' + canonicalQueryString + '\n' +
    canonicalHeaders + '\n' + signedHeaders + '\n' + hashedPayload;

  const credentialScope = date + '/' + service + '/tc3_request';
  const stringToSign =
    algorithm + '\n' + timestamp + '\n' + credentialScope + '\n' + sha256hex(canonicalRequest);

  const secretDate = hmac256('TC3' + secretKey, date);
  const secretService = hmac256(secretDate, service);
  const secretSigning = hmac256(secretService, 'tc3_request');
  const signature = hmac256hex(secretSigning, stringToSign);

  const authorization =
    algorithm + ' ' +
    'Credential=' + secretId + '/' + credentialScope + ', ' +
    'SignedHeaders=' + signedHeaders + ', ' +
    'Signature=' + signature;

  const headers = {
    'Authorization': authorization,
    'Content-Type': 'application/json; charset=utf-8',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
  };
  if (region) headers['X-TC-Region'] = region;

  const r = await fetch(endpoint, { method: 'POST', headers, body: payload });
  return r.json();
}

async function sendSmsCode(phone, code, purpose) {
  const secretId = process.env.TENCENT_SMS_SECRET_ID;
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY;
  if (!secretId || !secretKey) {
    console.log(`  [SMS:dev] 向 ${phone} 发送验证码(用途:${purpose}): ${code}`);
    return false;
  }
  try {
    const templateId = purpose === 'login'
      ? (process.env.TENCENT_SMS_TEMPLATE_LOGIN || process.env.TENCENT_SMS_TEMPLATE_ID)
      : process.env.TENCENT_SMS_TEMPLATE_ID;
    const j = await tencentRequest(secretId, secretKey, 'sms', 'SendSms', '2021-01-11',
      process.env.TENCENT_SMS_REGION || 'ap-guangzhou', {
        PhoneNumberSet: ['+86' + phone],
        SmsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID,
        SignName: process.env.TENCENT_SMS_SIGN_NAME,
        TemplateId: templateId,
        TemplateParamSet: [code, '5'],
      });
    const resp = j.Response || {};
    if (resp.Error) { console.error('  [SMS] 腾讯云返回错误:', resp.Error); return false; }
    const st = (resp.SendStatusSet || [])[0];
    if (st && st.Code === 'Ok') { console.log(`  [SMS] 已发送至 ${phone}`); return true; }
    console.error('  [SMS] 发送状态异常:', st); return false;
  } catch (e) {
    console.error('  [SMS] 请求异常:', e.message); return false;
  }
}

module.exports = { sendSmsCode };
