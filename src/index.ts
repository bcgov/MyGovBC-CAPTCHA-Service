import { Request, Response } from "express"

/*jshint node:true, esversion: 6 */
require('dotenv').config()
import bodyParser = require('body-parser')
var jose = require('node-jose')
var app = require('express')()
var jwt = require('jsonwebtoken')
var svgCaptcha = require('svg-captcha')
var winston = require('winston')
const ipRangeCheck = require("ip-range-check")

// requires for audio support
var lame = require('lame')
var wav = require('wav')
import text2wav = require('text2wav')
var streamifier = require("streamifier")
var arrayBufferToBuffer = require('arraybuffer-to-buffer')

const AUTHORIZED_RESOURCE_SERVER_IP_RANGE_LIST = process.env.AUTHORIZED_RESOURCE_SERVER_IP_RANGE_LIST || '127.0.0.1'
var LISTEN_IP = process.env.LISTEN_IP || '0.0.0.0'
var HOSTNAME = require('os').hostname()
var CAPTCHA_SIGN_EXPIRY: number = process.env.CAPTCHA_SIGN_EXPIRY && +process.env.CAPTCHA_SIGN_EXPIRY || 15 // In minutes
var JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || "15" // In minutes
var SECRET = process.env.SECRET || "defaultSecret"
var PRIVATE_KEY = process.env.PRIVATE_KEY ? JSON.parse(process.env.PRIVATE_KEY) : {
  kty: 'oct',
  kid: 'gBdaS-G8RLax2qObTD94w',
  use: 'enc',
  alg: 'A256GCM',
  k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
}
var LOG_LEVEL = process.env.LOG_LEVEL || "debug"
var SERVICE_PORT = process.env.SERVICE_PORT || 8080
var WINSTON_HOST = process.env.WINSTON_HOST
var WINSTON_PORT = process.env.WINSTON_PORT
var AUDIO_ENABLED = process.env.AUDIO_ENABLED || "true"

// Prevent default keys going into production
if (process.env.NODE_ENV == 'production') {
  if (SECRET == 'defaultSecret' ||
    PRIVATE_KEY.kid == 'gBdaS-G8RLax2qObTD94w') {

    winston.info("You MUST change SECRET and PRIVATE_KEY before running in a production environment.")
    process.exit(1)
  }
}

if (process.env.NODE_ENV != 'production' ||
  process.env.CORS_ALLOW_ALL == 'true') {
  app.use(function (req: Request, res: Response, next: Function) {
    res.header("Access-Control-Allow-Origin", "*")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    next()
  })
}


////////////////////////////////////////////////////////
/*
 * Logger init
 */
////////////////////////////////////////////////////////
winston.level = LOG_LEVEL
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {
  'timestamp': true
})
if (process.env.WINSTON_PORT) {
  winston.add(winston.transports.Syslog, {
    host: WINSTON_HOST,
    port: WINSTON_PORT,
    protocol: 'udp4',
    localhost: HOSTNAME
  })
}

////////////////////////////////////////////////////////
/*
 * App Startup
 */
////////////////////////////////////////////////////////

// create the Encoder instance
var encoder = new lame.Encoder({
  // input
  channels: 1, // 1 channels
  bitDepth: 16, // 16-bit samples
  sampleRate: 44100, // 44,100 Hz sample rate

  // output
  bitRate: 128,
  outSampleRate: 22050,
  mode: lame.MONO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
})

// init app
app.use(bodyParser.json())

var args = process.argv
if (args.length == 3 && args[2] == 'server') {
  var server = app.listen(SERVICE_PORT, LISTEN_IP, function () {
    var host = server.address().address
    var port = server.address().port
    winston.info(`MyGov Captcha Service listening at http://${host}:${port}`)
    winston.info(`Log level is at: ${LOG_LEVEL}`)
  })
}

////////////////////////////////////////////////////////
/*
 * Encryption Routines
 */
////////////////////////////////////////////////////////
async function decrypt(body: object, private_key: object) {
  winston.debug(`to decrypt body: ` + JSON.stringify(body))
  try {
    let res = await jose.JWK.asKey(private_key, "json")
    let decrypted = await jose.JWE.createDecrypt(res)
      .decrypt(body)
    var decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'))
    winston.debug('decrypted object: ' + JSON.stringify(decryptedObject))
    return decryptedObject
  } catch (e) {
    winston.error(`err: ` + JSON.stringify(e))
    throw e
  }
}

async function encrypt(body: object) {
  winston.debug(`encrypt: ` + JSON.stringify(body))
  let buff = Buffer.from(JSON.stringify(body))
  try {
    let cr = await jose.JWE.createEncrypt(PRIVATE_KEY)
      .update(buff)
      .final()
    winston.debug(`encrypted: ` + JSON.stringify(cr))
    return cr
  } catch (e) {
    winston.error(`err: ` + JSON.stringify(e))
    throw e
  }
}

////////////////////////////////////////////////////////
/*
 * Get a new captcha
 */
////////////////////////////////////////////////////////
interface GetCaptchaRequest {
  nonce: string
}

interface UnencryptedValidation {
  nonce: string,
  answer: string,
  expiry: number,
}

export interface ValidCaptchaResponse {
  nonce: string,
  captcha: string,
  validation: object
}

export interface InvalidCaptchaResponse {
  valid: boolean
}

let getCaptcha = async function (payload: GetCaptchaRequest): Promise<ValidCaptchaResponse | InvalidCaptchaResponse> {
  winston.debug(`getCaptcha: ${payload.nonce}`)
  var captcha = svgCaptcha.create({
    size: 6, // size of random string
    ignoreChars: '0o1il', // filter out some characters like 0o1i
    noise: 2 // number of lines to insert for noise
  })
  if (!captcha || (captcha && !captcha.data)) {
    // Something bad happened with Captcha.
    return {
      valid: false
    }
  }
  winston.debug(`captcha generated: ${captcha.text}`)

  // prep captcha string for good reading by putting spaces between letters
  var captchaAudioText = "Type in the text box the following: " + captcha.text

  // add answer, nonce and expiry to body
  var body: UnencryptedValidation = {
    nonce: payload.nonce,
    answer: captcha.text,
    expiry: Date.now() + (CAPTCHA_SIGN_EXPIRY * 60000)
  }
  try {
    let validation = await encrypt(body)
    if (validation === "") {
      // Error
      winston.error(`Validation Failed`)
      return {
        valid: false
      }
    } else {
      winston.debug(`validation: ` + JSON.stringify(validation))
      // create basic response
      var responseBody = {
        nonce: payload.nonce,
        captcha: captcha.data,
        validation: validation
      }
      return responseBody
    }
  } catch (err) {
    winston.error(err)
    return {
      valid: false
    }
  }
}
exports.getCaptcha = getCaptcha

app.post('/captcha', async function (req: Request, res: Response) {
  let captcha = await getCaptcha(req.body)
  winston.debug(`returning: ` + JSON.stringify(captcha))
  return res.send(captcha)
})


////////////////////////////////////////////////////////
/*
 * Verify a captcha against it's encrypted response.
 * If successful, return a signed jwt by us.
 */
////////////////////////////////////////////////////////
interface VerifyCaptchaRequest {
  answer: string,
  nonce: string,
  validation: object,
}

export interface VerifyCaptchaValidResponse {
  valid: boolean,
  jwt: string
}

export interface VerifyCaptchaInvalidResponse {
  valid: boolean
}

var verifyCaptcha = async function (payload: VerifyCaptchaRequest): Promise<VerifyCaptchaInvalidResponse | VerifyCaptchaValidResponse> {
  winston.debug(`incoming payload: ` + JSON.stringify(payload))
  var validation = payload.validation
  var answer = payload.answer
  var nonce = payload.nonce

  // Captcha by-pass for automated testing in dev/test environments
  if (process.env.BYPASS_ANSWER &&
    process.env.BYPASS_ANSWER.length > 0 &&
    process.env.BYPASS_ANSWER === answer) {

    // Passed the captcha test
    winston.debug(`Captcha bypassed! Creating JWT.`)

    var token = jwt.sign({
      data: {
        nonce: nonce
      }
    }, SECRET, {
        expiresIn: JWT_SIGN_EXPIRY + 'm'
      })
    return {
      valid: true,
      jwt: token
    }
  }

  // Normal mode, decrypt token
  let body: UnencryptedValidation = await decrypt(validation, PRIVATE_KEY)
  winston.debug(`verifyCaptcha decrypted: ` + JSON.stringify(body))
  if (body !== null) {

    // Check answer
    if (body.answer.toLowerCase() === answer.toLowerCase()) {
      if (body.nonce === nonce) {
        // Check expiry
        if (body.expiry > Date.now()) {
          // Passed the captcha test
          winston.debug(`Captcha verified! Creating JWT.`)

          var token = jwt.sign({
            data: {
              nonce: nonce
            }
          }, SECRET, {
              expiresIn: JWT_SIGN_EXPIRY + 'm'
            })
          return {
            valid: true,
            jwt: token
          }
        } else {
          // incorrect answer
          winston.debug(`Captcha expired: ` + body.expiry + "; now: " + Date.now())
          return {
            valid: false
          }
        }
      } else {
        // incorrect nonce
        winston.debug(`nonce incorrect, expected: ` + body.nonce + '; provided: ' + nonce)
        return {
          valid: false
        }
      }
    } else {
      // incorrect answer
      winston.debug(`Captcha answer incorrect, expected: ` + body.answer + '; provided: ' + answer)
      return {
        valid: false
      }
    }
  } else {
    // Bad decyption
    winston.error(`Captcha decryption failed`)
    return {
      valid: false
    }
  }
}
exports.verifyCaptcha = verifyCaptcha

app.post('/verify/captcha', async function (req: Request, res: Response) {
  let ret = await verifyCaptcha(req.body)
  return res.send(ret)
})

////////////////////////////////////////////////////////
/*
 * Get Audio
 */
////////////////////////////////////////////////////////
interface GetAudioRequestBody {
  validation: object,
}

var getAudio = async function (body: GetAudioRequestBody) {
  winston.debug(`getting audio for`, body)
  try {
    // Ensure audio is enabled.
    if (!AUDIO_ENABLED || AUDIO_ENABLED !== "true") {
      winston.error('audio disabled but user attempted to getAudio')
      return {
        error: "audio disabled"
      }
    }

    // pull out encrypted answer
    var validation = body.validation

    // decrypt payload to get captcha text
    let decryptedBody = await decrypt(validation, PRIVATE_KEY)
    winston.debug('get audio decrypted body', body)

    // Insert leading text and commas to slow down reader
    var captchaCharArray = decryptedBody.answer.toString().split("")
    var spokenCatpcha = "Please type in following letters or numbers: "
    for (var i = 0; i < captchaCharArray.length; i++) {
      spokenCatpcha += captchaCharArray[i] + ", "
    }
    let audioDataUri = await getMp3DataUriFromText(spokenCatpcha)
    // Now pass back the full payload ,
    return {
      audio: audioDataUri
    }
  } catch (e) {
    winston.error('Error getting audio:', e)
    return {
      error: "unknown"
    }
  }
}

app.post('/captcha/audio', async function (req: Request, res: Response) {
  let ret = await getAudio(req.body)
  return res.send(ret)
})

////////////////////////////////////////////////////////
/*
 * Verify a JWT generated by us.
 */
////////////////////////////////////////////////////////
export interface VerifyJWTResponse {
  valid: boolean
}
var verifyJWT = async function (token: string, nonce: string): Promise<VerifyJWTResponse> {
  winston.debug(`verifying: ${token} against ${nonce}`)
  try {
    var decoded = jwt.verify(token, SECRET)
    winston.debug(`decoded: ` + JSON.stringify(decoded))
    if (decoded.data && decoded.data.nonce === nonce) {
      winston.debug(`Captcha Valid`)
      return {
        valid: true
      }
    } else {
      winston.debug(`Captcha Invalid!`)
      return {
        valid: false
      }
    }
  } catch (e) {
    winston.error(`Token/ResourceID Verification Failed: ` + JSON.stringify(e))
    return {
      valid: false
    }
  }
}
exports.verifyJWT = verifyJWT

app.post('/verify/jwt', async function (req: Request, res: Response) {
  let ipRangeArr = AUTHORIZED_RESOURCE_SERVER_IP_RANGE_LIST.split(',')
  let allowed = false
  for (let ipRange of ipRangeArr) {
    if (ipRangeCheck(req.ip, ipRange.trim())) {
      allowed = true
      break
    }
  }
  if (!allowed) {
    winston.debug(`Unauthorized access to /verify/jwt from ip ${req.ip}.`)
    res.status(403).end()
    return
  }
  let ret = await verifyJWT(req.body.token, req.body.nonce)
  res.send(ret)
})

////////////////////////////////////////////////////////
/*
 * Audio routines
 */
////////////////////////////////////////////////////////
function getMp3DataUriFromText(text: string) {
  winston.debug("Starting audio generation...")
  return new Promise(async function (resolve) {

    // init wave reader, used to convert WAV to PCM
    var reader = new wav.Reader()

    // we have to wait for the "format" event before we can start encoding
    reader.on('format', function (format: object) {
      // init encoder
      winston.debug("Init mp3 encoder")
      var encoder = new lame.Encoder(format)

      // Pipe Wav reader to the encoder and capture the output stream
      winston.debug("Pipe WAV reader to MP3 encoder")

      // As the stream is encoded, convert the mp3 array buffer chunks into base64 string with mime type
      var dataUri: string | undefined = "data:audio/mp3;base64,"
      encoder.on('data', function (arrayBuffer: Buffer) {
        if (!dataUri) {
          return
        }
        winston.debug("Encoder output received chunk of bytes, convert to base64 string")
        dataUri += arrayBuffer.toString('base64')
        // by observation encoder hung before finish due to event loop being empty
        // setTimeout injects an event to mitigate the issue
        setTimeout(() => { }, 0)
      })

      // When encoding is complete, callback with data uri
      encoder.on('finish', function () {
        winston.debug("Finished converting to MP3")
        resolve(dataUri)
        dataUri = undefined
      })
      reader.pipe(encoder)
    })

    // Generate audio, Base64 encoded WAV in DataUri format including mime type header
    winston.debug("Generate speach as WAV in ArrayBuffer")
    var audioArrayBuffer = await text2wav(text)

    // convert to buffer
    winston.debug("Convert arraybuffer to buffer")
    var audioBuffer = arrayBufferToBuffer(audioArrayBuffer)

    // Convert ArrayBuffer to Streamable type for input to the encoder
    winston.debug("Streamify our buffer")
    var audioStream = streamifier.createReadStream(audioBuffer)

    // once all events setup we can the pipeline
    winston.debug("Pipe audio stream to WAV reader")
    audioStream.pipe(reader)
  })
}

app.get(/^\/(status)?$/, function (req: Request, res: Response) {
  res.send("OK")
})