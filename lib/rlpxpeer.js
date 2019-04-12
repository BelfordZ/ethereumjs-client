'use strict'

const RlpxSender = require('./rlpxsender')
const { ETH, LES, RLPx } = require('ethereumjs-devp2p')
const { randomBytes } = require('crypto')
const EventEmitter = require('events')

const devp2pCapabilities = {
  eth62: ETH.eth62,
  eth63: ETH.eth63,
  les2: LES.les2
}

const defaultOptions = {
  inbound: false,
  server: null,
  protocols: []
}

class RlpxPeer extends EventEmitter {
  constructor (options) {
    super()
    options = { ...defaultOptions, ...options }

    this.id = options.id
    this.address = `${options.host}:${options.port}`
    this.inbound = options.inbound
    this.transport = 'rlpx'
    this.protocols = options.protocols
    this.bound = new Map()
    this.server = options.server

    this._idle = true

    this.host = options.host
    this.port = options.port
    this.server = null
    this.rlpx = null
    this.rlpxPeer = null
    this.connected = false
  }

  get idle () {
    return this._idle
  }

  set idle (value) {
    this._idle = value
  }

  static capabilities (protocols) {
    const capabilities = []
    protocols.forEach(protocol => {
      const { name, versions } = protocol
      const keys = versions.map(v => name + v)
      keys.forEach(key => {
        const capability = devp2pCapabilities[key]
        if (capability) {
          capabilities.push(capability)
        }
      })
    })
    return capabilities
  }

  async connect () {
    if (this.connected) {
      return
    }
    const key = randomBytes(32)
    await Promise.all(this.protocols.map(p => p.open()))
    this.rlpx = new RLPx(key, {
      capabilities: RlpxPeer.capabilities(this.protocols),
      listenPort: null }
    )
    await this.rlpx.connect({
      id: Buffer.from(this.id, 'hex'),
      address: this.host,
      port: this.port
    })
    this.rlpx.on('peer:error', (rlpxPeer, error) => {
      this.emit('error', error)
    })
    this.rlpx.once('peer:added', async (rlpxPeer) => {
      try {
        await this.bindProtocols(rlpxPeer)
        this.emit('connected')
      } catch (error) {
        this.emit('error', error)
      }
    })
    this.rlpx.once('peer:removed', (rlpxPeer, reason) => {
      try {
        if (rlpxPeer !== this.rlpxPeer) {
          return
        }
        reason = rlpxPeer.getDisconnectPrefix(reason)
        this.rlpxPeer = null
        this.connected = false
        this.emit('disconnected', reason)
      } catch (error) {
        this.emit('error', error)
      }
    })
  }

  async accept (rlpxPeer, server) {
    if (this.connected) {
      return
    }
    await this.bindProtocols(rlpxPeer)
    this.server = server
  }

  async bindProtocols (rlpxPeer) {
    this.rlpxPeer = rlpxPeer
    await Promise.all(rlpxPeer.getProtocols().map(rlpxProtocol => {
      const name = rlpxProtocol.constructor.name.toLowerCase()
      const protocol = this.protocols.find(p => p.name === name)
      if (protocol) {
        return this.bindProtocol(protocol, new RlpxSender(rlpxProtocol))
      }
    }))
    this.connected = true
  }

  async bindProtocol (protocol, sender) {
    const bound = await protocol.bind(this, sender)
    bound.on('message', message => {
      this.emit('message', message, protocol.name)
    })
    bound.on('error', error => {
      this.emit('error', error, protocol.name)
    })
    this.bound.set(bound.name, bound)
  }

  understands (protocolName) {
    return !!this.bound.get(protocolName)
  }

  toString (fullId) {
    const properties = {
      id: fullId ? this.id : this.id.substr(0, 8),
      address: this.address,
      transport: this.transport,
      protocols: Array.from(this.bound.keys()),
      inbound: this.inbound || null
    }
    return Object.entries(properties)
      .filter(([, value]) => value !== undefined && value !== null && value.toString() !== '')
      .map(keyValue => keyValue.join('='))
      .join(' ')
  }
}

module.exports = RlpxPeer
