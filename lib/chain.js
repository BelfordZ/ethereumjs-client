'use strict'

const EventEmitter = require('events')
const Common = require('ethereumjs-common').default
const Block = require('ethereumjs-block')
const Blockchain = require('ethereumjs-blockchain')
const { BN } = require('ethereumjs-util')
const promisify = require('util-promisify')

const defaultOptions = {
  common: new Common('mainnet')
}

class Chain extends EventEmitter {
  constructor (options) {
    super()
    options = {...defaultOptions, ...options}

    this.common = options.common
    this.db = options.db
    this.blockchain = options.blockchain
    this.init()
  }

  init () {
    if (!this.blockchain) {
      this.blockchain = new Blockchain({
        db: this.db,
        validate: false,
        common: this.common
      })
      if (!this.db) {
        this.db = this.blockchain.db
      }
    }

    this.reset()
    this.opened = false
  }

  reset () {
    this._headers = {
      latest: null,
      td: new BN(0),
      height: new BN(0)
    }
    this._blocks = {
      latest: null,
      td: new BN(0),
      height: new BN(0)
    }
  }

  get networkId () {
    return this.common.networkId()
  }

  get genesis () {
    const genesis = this.common.genesis()
    Object.entries(genesis).forEach(([k, v]) => { genesis[k] = hexToBuffer(v) })
    return genesis
  }

  get headers () {
    return { ...this._headers }
  }

  get blocks () {
    return { ...this._blocks }
  }

  async open () {
    if (this.opened) {
      return false
    }

    await this.blockchain.db.open()
    this.opened = true
    await this.update()
  }

  async close () {
    if (!this.opened) {
      return false
    }
    this.reset()
    await this.blockchain.db.close()
    this.opened = false
  }

  async update () {
    if (!this.opened) {
      return false
    }
    const headers = {}
    const blocks = {}
    await Promise.all([
      this.getLatestHeader(),
      this.getLatestBlock()
    ]).then(latest => { [headers.latest, blocks.latest] = latest })
    await Promise.all([
      this.getTd(headers.latest.hash()),
      this.getTd(blocks.latest.hash())
    ]).then(td => { [headers.td, blocks.td] = td })
    headers.height = new BN(headers.latest.number)
    blocks.height = new BN(blocks.latest.header.number)
    this._headers = headers
    this._blocks = blocks
    this.emit('updated')
  }

  async getBlocks (block, max, skip, reverse) {
    if (!this.opened) {
      await this.open()
    }
    if (!this._getBlocks) {
      this._getBlocks = promisify(this.blockchain.getBlocks.bind(this.blockchain))
    }
    return this._getBlocks(block, max, skip, reverse)
  }

  async getBlock (block) {
    if (!this.opened) {
      await this.open()
    }
    if (!this._getBlock) {
      this._getBlock = promisify(this.blockchain.getBlock.bind(this.blockchain))
    }

    return this._getBlock(block)
  }

  async putBlocks (blocks) {
    if (!this.opened) {
      await this.open()
    }
    if (!this._putBlocks) {
      this._putBlocks = promisify(this.blockchain.putBlocks.bind(this.blockchain))
    }
    if (!blocks) {
      return
    }
    blocks = blocks.map(b => new Block(b.raw, { common: this.common }))
    await this._putBlocks(blocks)
    await this.update()
  }

  async getHeaders (block, max, skip, reverse) {
    const blocks = await this.getBlocks(block, max, skip, reverse)
    return blocks.map(b => b.header)
  }

  async putHeaders (headers) {
    if (!this.opened) {
      await this.open()
    }
    if (!this._putHeaders) {
      this._putHeaders = promisify(this.blockchain.putHeaders.bind(this.blockchain))
    }
    if (!headers) {
      return
    }
    headers = headers.map(h => new Block.Header(h.raw, { common: this.common }))
    await this._putHeaders(headers)
    await this.update()
  }

  async getLatestHeader () {
    if (!this.opened) {
      await this.open()
    }
    if (!this._getLatestHeader) {
      this._getLatestHeader = promisify(this.blockchain.getLatestHeader.bind(this.blockchain))
    }
    return this._getLatestHeader()
  }

  async getLatestBlock () {
    if (!this.opened) {
      await this.open()
    }
    if (!this._getLatestBlock) {
      this._getLatestBlock = promisify(this.blockchain.getLatestBlock.bind(this.blockchain))
    }
    return this._getLatestBlock()
  }

  async getTd (hash) {
    if (!this.opened) {
      await this.open()
    }
    if (!this._getTd) {
      this._getTd = promisify(this.blockchain._getTd.bind(this.blockchain))
    }
    return this._getTd(hash)
  }
}

function hexToBuffer (hexString) {
  if (typeof (hexString) === 'string' && hexString.startsWith('0x')) {
    return Buffer.from(hexString.slice(2), 'hex')
  }
  return hexString
}

module.exports = Chain
