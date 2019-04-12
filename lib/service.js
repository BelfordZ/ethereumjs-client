const Chain = require('./chain')
const Common = require('ethereumjs-common').default
const EventEmitter = require('events')
const PeerPool = require('./peerpool')

const defaultOptions = {
  lightserv: false,
  common: new Common('mainnet'),
  minPeers: 3,
  maxPeers: 25,
  timeout: 5000,
  interval: 1000
}

class EthereumService extends EventEmitter {
  constructor (options) {
    options = { ...defaultOptions, ...options }
    super()

    if (!options.server) throw new Error('Server is required');
    options = { ...defaultOptions, ...options }

    this.opened = false
    this.running = false
    this.server = options.server
    this.pool = new PeerPool({
      server: this.server,
      maxPeers: options.maxPeers
    })
    this.pool.on('message', async (message, protocol, peer) => {
      if (this.running) {
        try {
          await this.handle(message, protocol, peer)
        } catch (error) {
          console.log(`Error handling message (${protocol}:${message.name}): ${error.message}`)
        }
      }
    })

    this.chain = options.chain || new Chain(options)
    this.minPeers = options.minPeers
    this.interval = options.interval
    this.timeout = options.timeout
    this.synchronizer = null
  }

  /**
   * Service name
   * @protected
   * @type {string}
   */
  get name () {
    return 'eth'
  }

  /**
   * Open eth service. Must be called before service is started
   * @return {Promise}
   */
  async open () {
    if (this.opened) {
      return false
    }
    
    if (this.opened) {
      return false
    }
    const protocols = this.protocols
    this.server.addProtocols(protocols);
    if (this.pool) {
      this.pool.on('banned', peer => console.log(`Peer banned: ${peer}`))
      this.pool.on('error', error => this.emit('error', error))
      this.pool.on('added', peer => console.log(`Peer added: ${peer}`))
      this.pool.on('removed', peer => console.log(`Peer removed: ${peer}`))
      await this.pool.open()
    }
    this.opened = true

    this.synchronizer.on('synchronized', () => this.emit('synchronized'))
    this.synchronizer.on('error', error => this.emit('error', error))
    await this.chain.open()
    await this.synchronizer.open()
  }

  /**
   * Close service.
   * @return {Promise}
   */
  async close () {
    if (this.pool) {
      this.pool.removeAllListeners()
      await this.pool.close()
    }
    this.opened = false
  }

  /**
   * Starts service and ensures blockchain is synchronized. Returns a promise
   * that resolves once the service is started and blockchain is in sync.
   * @return {Promise}
   */
  async start () {
    if (this.running) {
      return false
    }

    if (this.running) {
      return false
    }
    await this.server.start();
    this.running = true
    console.log(`Started ${this.name} service.`)

    this.synchronizer.start()
  }

  /**
   * Stop service. Interrupts blockchain synchronization if its in progress.
   * @return {Promise}
   */
  async stop () {
    if (!this.running) {
      return false
    }
    await this.synchronizer.stop()
    await super.stop()
  }
  /**
   * Handles incoming request from connected peer
   * @param  {Object}  message message object
   * @param  {string}  protocol protocol name
   * @param  {Peer}    peer peer
   * @return {Promise}
   */
  async handle (message, protocol, peer) {
  }
}

exports.EthereumService = EthereumService;