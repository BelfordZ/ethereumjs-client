const EventEmitter = require('events');

const defaultOptions = {
  interval: 1000,
  minPeers: 3
};

class Synchronizer extends EventEmitter {
  constructor (options) {
    super()
    options = {...defaultOptions, ...options}

    this.pool = options.pool
    this.chain = options.chain
    this.flow = options.flow
    this.minPeers = options.minPeers
    this.interval = options.interval
    this.running = false
    this.forceSync = false
    this.pool.on('added', peer => {
      if (this.syncable(peer)) {
        console.log(`Found ${this.type} peer: ${peer}`);
      }
    });
  }

  get type () {
    return 'fast'
  }

  async open () {
    await this.chain.open()
    await this.pool.open()
    const number = this.chain.blocks.height.toString(10)
    const td = this.chain.blocks.td.toString(10)
    const hash = this.chain.blocks.latest.hash()
    this.logger.info(`Latest local block: number=${number} td=${td} hash=${short(hash)}`)
  }

  syncable (peer) {
    return peer.eth
  }

  async latest (peer) {
    const headers = await peer.eth.getBlockHeaders({
      block: peer.eth.status.bestHash, max: 1
    })
    return headers[0]
  }

  best () {
    let best
    const peers = this.pool.peers.filter(this.syncable.bind(this))
    if (peers.length < this.minPeers && !this.forceSync) return
    for (let peer of peers) {
      const td = peer.eth.status.td
      if ((!best && td.gte(this.chain.blocks.td)) ||
          (best && best.eth.status.td.lt(td))) {
        best = peer
      }
    }
    return best
  }

  async syncWithPeer (peer) {
    if (!peer) return false
    const latest = await this.latest(peer)
    const height = new BN(latest.number)
    const first = this.chain.blocks.height.addn(1)
    const count = height.sub(first).addn(1)
    if (count.lten(0)) return false

    this.logger.debug(`Syncing with peer: ${peer.toString(true)} height=${height.toString(10)}`)

    this.blockFetcher = new BlockFetcher({
      pool: this.pool,
      chain: this.chain,
      logger: this.logger,
      interval: this.interval,
      first,
      count
    })
    this.blockFetcher
      .on('error', (error) => {
        this.emit('error', error)
      })
      .on('fetched', blocks => {
        const first = new BN(blocks[0].header.number)
        const hash = short(blocks[0].hash())
        this.logger.info(`Imported blocks count=${blocks.length} number=${first.toString(10)} hash=${hash} peers=${this.pool.size}`)
      })
    await this.blockFetcher.fetch()
    delete this.blockFetcher
    return true

    // TO DO: Fetch state trie as well
  }

  async sync () {
    const peer = this.best()
    return this.syncWithPeer(peer)
  }

  async announced (announcements, peer) {
    if (announcements.length) {
      const [hash, height] = announcements[announcements.length - 1]
      this.logger.debug(`New height: number=${height.toString(10)} hash=${short(hash)}`)
      // TO DO: download new blocks
    }
  }
  
  async start () {
    if (this.running) {
      return false
    }
    this.running = true
    const timeout = setTimeout(() => { this.forceSync = true }, this.interval * 30)
    while (this.running) {
      try {
        if (await this.sync()) this.emit('synchronized')
      } catch (error) {
        if (this.running) this.emit('error', error)
      }
      await new Promise(resolve => setTimeout(resolve, this.interval))
    }
    this.running = false
    clearTimeout(timeout)
  }

  /**
   * Stop synchronization. Returns a promise that resolves once its stopped.
   * @return {Promise}
   */
  async stop () {
    if (!this.running) {
      return false
    }
    if (this.blockFetcher) {
      this.blockFetcher.destroy()
      delete this.blockFetcher
    }

    if (!this.running) {
      return false
    }
    await new Promise(resolve => setTimeout(resolve, this.interval))
    this.running = false
  }
}

module.exports = Synchronizer
