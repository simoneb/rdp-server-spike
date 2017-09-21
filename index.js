const dgram = require('dgram')
const {forIn, omitBy, throttle} = require('lodash/fp')

let socketsByAddress = {}
const server = dgram.createSocket('udp4')

const dlog = throttle(2000)(console.log)

const lastSeenTimeout = 10000
const suppressEcho = false

function cleanupSockets () {
  const now = Date.now()

  console.log('cleaning up unseen sockets')

  socketsByAddress = omitBy(({lastSeen}) => (now - lastSeen) > lastSeenTimeout)(socketsByAddress)
}

setInterval(cleanupSockets, 10000)

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`)
  server.close()
})

server.on('message', (msg, rinfo) => {
  if(!socketsByAddress[`${rinfo.address}-${rinfo.port}`]) {
    console.log(`registering new client ${rinfo.address}:${rinfo.port}`)

    socketsByAddress[`${rinfo.address}-${rinfo.port}`] =
        {address: rinfo.address, port: rinfo.port, lastSeen: Date.now()}
  } else {
    socketsByAddress[`${rinfo.address}-${rinfo.port}`].lastSeen = Date.now()
  }

  dlog('received message from %s:%d', rinfo.address, rinfo.port)

  forIn(({address, port}) => {
    if (suppressEcho && address !== rinfo.address && port !== rinfo.port) // suppress echo
      server.send(msg, port, address, err => {
        if (err) return console.error(err)
        dlog('delivered message to %s:%d', address, port)
      })
  })(socketsByAddress)
})

server.on('listening', () => {
  const address = server.address()
  console.log(`server listening ${address.address}:${address.port}`)
})

server.bind(process.env.PORT || 22222)
