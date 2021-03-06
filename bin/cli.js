#!/usr/bin/env node

const Common = require('ethereumjs-common').default
const chains = require('ethereumjs-common/dist/chains').chains
const { parse } = require('../lib/util')
const Node = require('../lib/node')
const level = require('level')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')

const networks = Object.entries(chains.names)
const args = require('yargs')
  .options({
    'network': {
      describe: `Network`,
      choices: networks.map(n => n[1]),
      default: networks[0][1]
    },
    'datadir': {
      describe: 'Data directory for the blockchain',
      default: `${os.homedir()}/Library/Ethereum`
    },
    'params': {
      describe: 'Path to chain parameters json file',
      coerce: path.resolve
    }
  })
  .locale('en_EN')
  .argv

async function runNode (options) {
  console.log('Initializing Ethereumjs client...')
  const node = new Node(options)
  node.on('error', err => console.error(err))
  node.on('listening', details => {
    console.log(`Listener up transport=${details.transport} url=${details.url}`)
  })
  node.on('synchronized', () => {
    console.log('Synchronized')
  })
  console.log(`Connecting to network: ${options.common.chainName()}`)
  await node.open()
  console.log('Synchronizing blockchain...')
  await node.start()

  return node
}

async function run () {
  const syncDirName = 'chaindata';
  const networkDirName = args.network === 'mainnet' ? '' : `${args.network}/`;
  const chainParams = args.params ? await parse.params(args.params) : args.network
  const common = new Common(chainParams)
  const dataDir = `${args.datadir}/${networkDirName}ethereumjs/${syncDirName}`

  fs.ensureDirSync(dataDir)
  console.log(`Data directory: ${dataDir}`)

  const options = {
    common,
    db: level(dataDir)
  }
  const node = await runNode(options)
 }

run().catch(err => console.error(err))
