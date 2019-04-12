const EventEmitter = require('events')
const Peer = require('./rlpxpeer')

const defaultOptions = {
  servers: [],
  maxPeers: 25
}

class PeerPool extends EventEmitter {
  constructor (options) {
    super()

    options = {...defaultOptions, ...options}

    this.servers = options.servers
    this.maxPeers = options.maxPeers
    this.pool = new Map()
    this.init()
  }

  init () {
    this.opened = false
  }

  async open () {
    if (this.opened) {
      return false
    }
    this.servers.map(server => {
      server.on('connected', (peer) => { this.connected(peer) })
      server.on('disconnected', (peer) => { this.disconnected(peer) })
    })
    this.opened = true
  }

  async close () {
    this.pool.clear()
    this.opened = false
  }

  get peers () {
    return Array.from(this.pool.values())
  }

  get size () {
    return this.peers.length
  }

  contains (peer) {
    if (peer instanceof Peer) {
      peer = peer.id
    }
    return !!this.pool.get(peer)
  }

  idle (filterFn = () => true) {
    const idle = this.peers.filter(p => p.idle && filterFn(p))
    const index = Math.floor(Math.random() * idle.length)
    return idle[index]
  }

  connected (peer) {
    if (this.size >= this.maxPeers) return
    peer.on('message', (message, protocol) => {
      if (this.pool.get(peer.id)) {
        this.emit('message', message, protocol, peer)
        this.emit(`message:${protocol}`, message, peer)
      }
    })
    peer.on('error', (error, protocol) => {
      if (this.pool.get(peer.id)) {
        console.log(`Peer error: ${error} ${peer}`)
        this.ban(peer)
      }
    })
    this.add(peer)
  }

  disconnected (peer) {
    this.remove(peer)
  }

  ban (peer, maxAge) {
    if (!peer.server) {
      return
    }
    peer.server.ban(peer.id, maxAge)
    this.remove(peer)
    this.emit('banned', peer)
  }

  add (peer) {
    if (peer && peer.id && !this.pool.get(peer.id)) {
      this.pool.set(peer.id, peer)
      this.emit('added', peer)
    }
  }

  remove (peer) {
    if (peer && peer.id) {
      if (this.pool.delete(peer.id)) {
        this.emit('removed', peer)
      }
    }
  }
}

module.exports = PeerPool
