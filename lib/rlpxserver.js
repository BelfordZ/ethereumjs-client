const { randomBytes } = require('crypto');
const devp2p = require('ethereumjs-devp2p');
const RlpxPeer = require('./rlpxpeer');
const { parse } = require('./util');
const EventEmitter = require('events');

const defaultOptions = {
  maxPeers: 25,
  refreshInterval: 30000,
  port: 30303,
  key: randomBytes(32),
  clientFilter: ['go1.5', 'go1.6', 'go1.7', 'quorum', 'pirl', 'ubiq', 'gmc', 'gwhale', 'prichain'],
  bootnodes: []
};

const ignoredErrors = new RegExp([
  'EPIPE',
  'ECONNRESET',
  'ETIMEDOUT',
  'NetworkId mismatch',
  'Timeout error: ping',
  'Genesis block mismatch',
  'Handshake timed out',
  'Invalid address buffer',
  'Invalid MAC',
  'Invalid timestamp buffer',
  'Hash verification failed'
].join('|'));

class RlpxServer extends EventEmitter {
  constructor (options) {
    super(options)
    options = {
      ...defaultOptions,
      ...options
    };

    this.protocols = new Set();
    this.started = false;

    this.port = options.port
    this.key = options.key
    this.clientFilter = options.clientFilter
    this.bootnodes = options.bootnodes
    this.init()
  }

  get running () {
    return this.started
  }

  init () {
    this.dpt = null
    this.rlpx = null
    this.peers = new Map()
    if (typeof this.bootnodes === 'string') {
      this.bootnodes = parse.bootnodes(this.bootnodes)
    }
    if (typeof this.key === 'string') {
      this.key = Buffer.from(this.key, 'hex')
    }
  }

  async start () {
    if (this.started) {
      return false
    }

    const protocols = Array.from(this.protocols);
    await Promise.all(protocols.map(p => p.open()));

    this.started = true;
    this.initDpt();
    this.initRlpx();

    this.bootnodes.map(node => {
      const bootnode = {
        address: node.ip,
        udpPort: node.port,
        tcpPort: node.port
      };
      return this.dpt.bootstrap(bootnode).catch(e => this.error(e));
    });

    console.log(`Started rlpx server.`);
  }

  async stop () {
    if (!this.started) {
      return false
    }
    this.started = false
    this.rlpx.destroy()
    this.dpt.destroy()
  }

  addProtocols (protocols) {
    if (this.started) {
      console.error('Cannot require protocols after server has been started')
      return false
    }
    protocols.forEach(p => this.protocols.add(p))
  }

  ban (peerId, maxAge = 60000) {
    if (!this.started) {
      return false
    }
    this.dpt.banPeer(peerId, maxAge)
  }

  error (error, peer) {
    if (ignoredErrors.test(error.message)) {
      return
    }
    if (peer) {
      peer.emit('error', error)
    } else {
      this.emit('error', error)
    }
  }

  initDpt () {
    this.dpt = new devp2p.DPT(this.key, {
      refreshInterval: this.refreshInterval,
      endpoint: {
        address: '0.0.0.0',
        udpPort: null,
        tcpPort: null
      }
    })

    this.dpt.on('error', e => this.error(e))

    if (this.port) {
      this.dpt.bind(this.port, '0.0.0.0')
    }
  }

  initRlpx () {
    this.rlpx = new devp2p.RLPx(this.key, {
      dpt: this.dpt,
      maxPeers: this.maxPeers,
      capabilities: RlpxPeer.capabilities(this.protocols),
      remoteClientIdFilter: this.clientFilter,
      listenPort: this.port
    })

    this.rlpx.on('peer:added', async (rlpxPeer) => {
      const peer = new RlpxPeer({
        id: rlpxPeer.getId().toString('hex'),
        host: rlpxPeer._socket.remoteAddress,
        port: rlpxPeer._socket.remotePort,
        protocols: Array.from(this.protocols),
        inbound: !!rlpxPeer._socket.server
      })
      try {
        await peer.accept(rlpxPeer, this)
        this.peers.set(peer.id, peer)
        console.log(`Peer connected: ${peer}`)
        this.emit('connected', peer)
      } catch (error) {
        this.error(error)
      }
    })

    this.rlpx.on('peer:removed', (rlpxPeer, reason) => {
      const id = rlpxPeer.getId().toString('hex')
      const peer = this.peers.get(id)
      if (peer) {
        this.peers.delete(peer.id)
        console.log(`Peer disconnected (${rlpxPeer.getDisconnectPrefix(reason)}): ${peer}`)
        this.emit('disconnected', peer)
      }
    })

    this.rlpx.on('peer:error', (rlpxPeer, error) => {
      const id = rlpxPeer.getId().toString('hex')
      const peer = this.peers.get(id)
      this.error(error, peer)
    })

    this.rlpx.on('error', e => this.error(e))

    this.rlpx.on('listening', () => {
      this.emit('listening', {
        url: `enode://${this.rlpx._id.toString('hex')}@[::]:${this.port}`
      })
    })

    if (this.port) {
      this.rlpx.listen(this.port, '0.0.0.0')
    }
  }
}

module.exports = RlpxServer
