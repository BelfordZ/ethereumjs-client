const EventEmitter = require('events')
const { EthereumService } = require('./service');
const RlpxServer = require('./rlpxserver');

const defaultOptions = {
  minPeers: 3,
  maxPeers: 25,
  servers: []
}

class Node extends EventEmitter {
  constructor (options) {
    super();
    options = {...defaultOptions, ...options};

    this.common = options.common;
    this.syncmode = options.syncmode;

    this.server = new RlpxServer({ port: 30303 });
    this.service = new EthereumService({
      server: this.server,
      lightserv: options.lightserv,
      common: options.common,
      minPeers: options.minPeers,
      maxPeers: options.maxPeers,
      db: options.db
    });

    this.opened = false;
    this.started = false;
  }

  async open() {
    if (this.opened) {
      return false;
    }

    this.server
      .on('error', error => this.emit('error', error))
      .on('listening', details => this.emit('listening', details));

    this.service
      .on('error', error => this.emit('error', error))
      .on('synchronized', stats => this.emit('synchronized', stats));

    await this.service.open();
    this.opened = true;

    return true;
  }

  async start() {
    if (this.started) {
      return false;
    }
    await this.server.start();
    await this.service.start();

    this.started = true;
    return true;
  }

  async stop() {
    if (!this.started) {
      return false;
    }
    await this.service.stop();
    await this.service.stop();
    this.started = false;
    return true;
  }
}

module.exports = Node
