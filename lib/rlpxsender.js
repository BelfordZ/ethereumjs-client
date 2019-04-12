const rlp = require('ethereumjs-util').rlp
const EventEmitter = require('events')

class RlpxSender extends EventEmitter {
  constructor (rlpxProtocol) {
    super()
    this._status = null
    this.sender = rlpxProtocol
    this.sender.on('status', (status) => {
      this.status = status
    })
    this.sender.on('message', (code, payload) => {
      this.emit('message', { code, payload })
    })
  }

  get status () {
    return this._status
  }

  set status (status) {
    this._status = status
    this.emit('status', status)
  }

  sendStatus (status) {
    try {
      this.sender.sendStatus(status)
    } catch (err) {
      this.emit('error', err)
    }
  }

  sendMessage (code, data) {
    try {
      this.sender._send(code, rlp.encode(data))
    } catch (err) {
      this.emit('error', err)
    }
  }
}

module.exports = RlpxSender
