const dgram = require('dgram')
const {forIn, omitBy, throttle} = require('lodash/fp')
const {RtpPacket} = require('node-rtp/lib/RtpPacket')
const {parseRtpPacket} = require('rtp-parser')
const chance = new require('chance').Chance()

let socketsByAddress = {}
const server = dgram.createSocket('udp4')

const dlog = throttle(2000)(console.log)

const suppressEcho = false
const ptt = true

const lastSeenTimeout = 10000

let sequence = chance.natural()
const source = chance.natural()

let firstSender

function formatRinfo({address, port}) {
	return `${address}:${port}`
}

function cleanupSockets () {
  const now = Date.now()

  socketsByAddress = omitBy(({lastSeen}) => (now - lastSeen) > lastSeenTimeout)(socketsByAddress)
  
  console.log('cleaned up unseen sockets, remaining: %d', Object.keys(socketsByAddress).length)
}

setInterval(cleanupSockets, 10000)

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`)
  server.close()
})

server.on('message', (msg, rinfo) => {
  const rtp = new RtpPacket(msg)
  rtp.seq = sequence++
  rtp.source = source
  rtp.timestamp = Date.now()
  
  const senderAddress = formatRinfo(rinfo)
  
  if(ptt && !firstSender) {
	  firstSender = senderAddress
	  console.log('first sender: %s', senderAddress)
  }
  
  if(!socketsByAddress[senderAddress]) {
    console.log(`registering new client ${senderAddress}`)

    socketsByAddress[senderAddress] = {address: rinfo.address, port: rinfo.port, lastSeen: Date.now()}
  } else {
    socketsByAddress[senderAddress].lastSeen = Date.now()
  }

  //dlog('received message of %d bytes from %s', msg.length, senderAddress)
  
  if(ptt && senderAddress !== firstSender) {
	// dlog('discarding message from %s because not first sender', senderAddress)
	return 
  }

  //dlog('delivering message to %d sockets', Object.keys(socketsByAddress).length)
	  
  forIn(({address, port}) => {
    if (address === rinfo.address && port === rinfo.port && suppressEcho) return

    server.send(msg, port, address, err => {
      if (err) return console.error(err)
      dlog('delivered message to %s:%d', address, port)
    })
	
	/*server.send(rtp.packet, port, address, err => {
      if (err) return console.error(err)
      dlog('delivered new message to %s:%d', address, port)
    })*/
  })(socketsByAddress)
})

server.on('listening', () => {
  const address = server.address()
  console.log(`server listening ${address.address}:${address.port}`)
})

server.bind(process.env.PORT || 22222)
