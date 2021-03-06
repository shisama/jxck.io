debug = DEBUG ? console.info.bind(console) : ()=>{}

const $ = document.querySelector.bind(document);

// polyfill
window.RTCIceRole  = (window.RTCIceRole !== undefined)  ? RTCIceRole  : { controlling: "controlling", controlled: "controlled" }
window.RTCDtlsRole = (window.RTCDtlsRole !== undefined) ? RTCDtlsRole : { auto: "auto", client: "client", server: "server" }


class Util {
  static Caps2Params(sendCaps, remoteRecvCaps) {
    let muxId = ''
    let codecs = Util.filterCodecParams(sendCaps.codecs, remoteRecvCaps.codecs)
    let headerExtensions = Util.filterHdrExtParams(sendCaps.headerExtensions, remoteRecvCaps.headerExtensions)
    let encodings = []

    // RTCRtcpParameters
    let rtcp = {
      ssrc: 0,
      cname: '',
      reducedSize: false,
      mux: true,
    }

    // RTCRtpParameters
    return { muxId, codecs, headerExtensions, encodings, rtcp }
  }

  static filterCodecParams(left, right) {
    let codecPrms = []

    if (left && right) {
      left.forEach(function(leftItem) {
        for (let i = 0; i < right.length; i++) {
          let codec = right[i]
          let equality = (
            leftItem.name == codec.name &&
            leftItem.kind === codec.kind &&
            leftItem.preferredPayloadType === codec.preferredPayloadType &&
            leftItem.numChannels === codec.numChannels
          )

          if (equality) {
            let codecParams = {
              name: codec.name,
              payloadType: codec.preferredPayloadType,
              clockRate: codec.clockRate,
              numChannels: codec.numChannels,
              rtcpFeedback: codec.rtcpFeedback,
              parameters: codec.parameters,
            }
            codecPrms.push(codecParams)

            break
          }
        }
      })
    }

    return codecPrms
  }

  static filterHdrExtParams(left, right) {
    let hdrExtPrms = []
    return hdrExtPrms
  }

  static RTCRtpEncodingParameters(params) {
    const defaults = {
      codecPayloadType:     0,
      fec:                  0,
      rtx:                  0,
      priority:             1.0,
      maxBitrate:           2000000.0,
      minQuality:           0,
      framerateBias:        0.5,
      resolutionScale:      1.0,
      framerateScale:       1.0,
      active:               true,
      encodingId:           undefined,
      dependencyEncodingId: undefined,
    }
    return Object.assign({}, defaults, params)
  }
}

class Transport extends EventEmitter {
  constructor(rtcDtlsTransport) {
    super()
    this.id = Math.floor(Math.random() * 1000)
    this.rtcDtlsTransport = rtcDtlsTransport
  }

  get track() {
    this.receiver.track
  }

  addSender(track) {
    const kind = track.kind
    debug('addSender', kind)
    this.sender = new RTCRtpSender(track, this.rtcDtlsTransport)
    this.senderCaps = RTCRtpSender.getCapabilities(kind)

    const capability = {
      muxId: null,
      kind: kind,
      caps: this.senderCaps,
    }
    this.emit('capability:sender', capability)
  }

  addReceiver(senderParams) {
    const kind = senderParams.kind
    debug('addReceiver', kind)

    this.receiver = new RTCRtpReceiver(this.rtcDtlsTransport, kind)
    this.receiverCaps = RTCRtpReceiver.getCapabilities(kind)

    const capability = {
      kind: kind,
      caps: this.recverCaps,
    }
    this.emit('capability:receiver', capability)
  }

  send(receiverParams) {
    const ssrc = this.id
    const encodingParams = Util.RTCRtpEncodingParameters({ssrc})
    const params = Util.Caps2Params(this.senderCaps, receiverParams.caps)
    params.encodings.push(encodingParams)
    this.sender.send(params)
  }

  receive(senderParams) {
    const ssrc = this.id
    const encodingParams = Util.RTCRtpEncodingParameters({ssrc})
    const params = Util.Caps2Params(senderParams.caps, this.recverCaps)
    params.muxId = senderParams.muxId
    params.encodings.push(encodingParams)
    this.receiver.receive(params)

    this.emit('track', this.receiver.track)
  }
}


class ORTC extends EventEmitter {
  constructor(id) {
    super()

    this.id = id

    this.rtcIceRole = null

    this.iceOptions = ortcConfig

    debug(this.iceOptions)


    // RTCIceGatherer
    this.rtcIceGatherer = null


    // RTCIceTransport
    this.rtcIceTransport = new RTCIceTransport()

    this.rtcIceTransport.onstatechange = (e) => {
      debug(e.type, e.state, e)
    }

    this.rtcIceTransport.onicestatechange = (e) => {
      // deprecated ?
      debug(e.type, e.state, e)
    }

    this.rtcIceTransport.oncandidatepairchange = (e) => {
      debug(e.type, e.pair, e)
    }


    // RTCDtlsTransport
    this.rtcDtlsTransport = new RTCDtlsTransport(this.rtcIceTransport)

    this.rtcDtlsTransport.ondtlsstatechange = (e) => {
      debug(e.type, e.state, e)
      if (e.state === 'connected') {
        super.emit('connected')
      }
    }

    this.rtcDtlsTransport.onerror = (e) => {
      console.error(e.type, e)
    }


    this.Transports = {
      sender: {
        video: null,
        audio: null,
      },
      recver: {
        video: null,
        audio: null,
      }
    }

    // local capabilities
    this.Caps = {
      sender: {
        video: null,
        audio: null,
      },
      recver: {
        video: null,
        audio: null,
      }
    }

    this.mediaStream = new MediaStream()
    this.mediaStream.onaddtrack = (e) => {
      debug(e)
    }
    this.mediaStream.onremovetrack = (e) => {
      debug(e)
    }

    this.trackCount = 0

  }

  addRemoteCandidate(candidate) {
    debug('addRemoteCandidate()', candidate.type, candidate.ip, candidate.port)
    this.rtcIceTransport.addRemoteCandidate(candidate)
  }

  getLocalParameters() {
    return {
      rtcIceParameters:  this.rtcIceGatherer.getLocalParameters(),
      rtcDtlsParameters: this.rtcDtlsTransport.getLocalParameters(),
    }
  }

  start(rtcIceParametersRemote, rtcDtlsParametersRemote) {
    debug('start()', rtcIceParametersRemote, rtcDtlsParametersRemote)
    this.rtcIceTransport.start(this.rtcIceGatherer, rtcIceParametersRemote, this.rtcIceRole)
    this.rtcDtlsTransport.start(rtcDtlsParametersRemote)
  }

  call(rtcIceRole) {
    this.rtcIceRole = rtcIceRole

    // RTCIceGatherer
    this.rtcIceGatherer = new RTCIceGatherer(this.iceOptions)

    this.rtcIceGatherer.onstatechange = (e) => {
      debug(e.type, this.rtcIceGatherer.state, e)
    }

    this.rtcIceGatherer.onlocalcandidate = (e) => {
      debug(e.type, e.complete, e)

      const candidate = e.candidate

      debug('localcandidate', candidate)
      super.emit('localcandidate', candidate)

      // polyfill for RTCIceCandidateComplete
      if (Object.keys(candidate).length == 0) {
        debug('localcandidatecomplete', candidate)
        super.emit('localcandidatecomplete')
      }
    }

    this.rtcIceGatherer.onerror = (e) => {
      console.error(e.type, e)
    }
  }







  addStream(stream) {
    debug('addStream')
    stream.getTracks().forEach((track) => {
      this.addSender(track)
    })
  }

  addSender(track) {
    // sender を作り caps を送る
    debug('addSender', track.kind)
    const kind = track.kind
    const caps = RTCRtpSender.getCapabilities(kind)
    const muxId = null

    const ssrc = Math.floor(Math.random()*1000)

    this.Caps.sender[ssrc] = caps
    this.Transports.sender[ssrc] = new RTCRtpSender(track, this.rtcDtlsTransport)

    this.emit('capability:sender', {
      ssrc,
      kind,
      caps,
      muxId,
    })
  }

  addReceiver(kind, ssrc) {
    debug('addReceiver', kind, ssrc)
    // receiver を作り caps を送る
    const caps = RTCRtpReceiver.getCapabilities(kind)

    this.Caps.recver[ssrc] = caps
    this.Transports.recver[ssrc] = new RTCRtpReceiver(this.rtcDtlsTransport, kind)

    // mediastream に追加
    this.mediaStream.addTrack(this.Transports.recver[ssrc].track)

    this.emit('capability:receiver', {
      ssrc,
      kind,
      caps,
    })
  }

  addSenderCapability(message) {
    // 相手から来た sender の capability を受け取る
    // 対応する receiver を作り、 receive() する
    const kind = message.kind
    const caps = message.caps
    const muxId = message.muxId
    const ssrc = message.ssrc

    this.addReceiver(kind, ssrc)

    this.transportRecv(kind, caps, muxId, ssrc)

    this.trackCount++
    if (this.trackCount == 2) {
      super.emit('mediastream', this.mediaStream)
    }
  }

  addReceiverCapability(message) {
    // 相手から来た receiver の capability を受け取り
    // sender に設定する
    const kind = message.kind
    const caps = message.caps
    const ssrc = message.ssrc

    // 逆側に設定する。
    this.transportSend(kind, caps, ssrc)
  }

  transportSend(kind, caps, ssrc) {
    // caps を適用して send() する
    const encodingParams = Util.RTCRtpEncodingParameters({ssrc})
    const sendParams = Util.Caps2Params(this.Caps.sender[ssrc], caps)
    sendParams.encodings.push(encodingParams)
    this.Transports.sender[ssrc].send(sendParams)
  }

  transportRecv(kind, caps, muxId, ssrc) {
    // caps を適用して receive() する
    const encodingParams = Util.RTCRtpEncodingParameters({ssrc})
    const recvParams = Util.Caps2Params(caps, this.Caps.recver[ssrc])
    recvParams.muxId = muxId
    recvParams.encodings.push(encodingParams)
    this.Transports.recver[ssrc].receive(recvParams)
  }
}

window.onload = function() {
  const socket = new WS('wss://ws.jxck.io', ['broadcast', 'ortc-demo'])
  const ortc = new ORTC(socket.id)
  const $video = $('#remote')
  const $local = $('#local')

  ortc.on('mediastream', (stream) => {
    $video.srcObject = stream
  })

  ortc.on('localcandidate', (candidate) => {
    socket.emit('candidate', {
      from: socket.id,
      to: window.peerid,
      candidate: candidate,
    })
  })

  ortc.on('connected', () => {
    // Get a local stream
    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    }).then((stream) => {
      debug('getUserMedia', stream)
      $local.srcObject = stream
      ortc.addStream(stream)
    }).catch((err) => {
      console.error(err)
    })
  })

  ortc.on('capability:sender', (capability) => {
    socket.emit('capability:sender', {
      from: socket.id,
      to: window.peerid,
      capability,
    })
  })

  ortc.on('capability:receiver', (capability) => {
    socket.emit('capability:receiver', {
      from: socket.id,
      to: window.peerid,
      capability,
    })
  })


  // localcandidate を送り終わってないと remote params で start() することができない。
  // localcandidate の終わりと params の受信を両方待つ Promsie.all を作ってやる
  Promise.all([
    new Promise((done, fail) => {
      ortc.on('localcandidatecomplete', () => {
        // parameter を送信
        socket.emit('params', {
          from: socket.id,
          to: window.peerid,
          params: ortc.getLocalParameters(),
        })
        done()
      })
    }),
    new Promise((done, fail) => {
      socket.on('params', ({from, to, params}) => {
        // parameter を受信
        if (to !== socket.id) return;
        done(params)
      })
    })
  ]).then(([_undefined, params]) => {
    const rtcIceParametersRemote = params.rtcIceParameters
    const rtcDtlsParametersRemote = params.rtcDtlsParameters
    ortc.start(rtcIceParametersRemote, rtcDtlsParametersRemote)
  })


  socket.on('candidate', ({from, to, candidate}) => {
    if (to !== socket.id) return
    ortc.addRemoteCandidate(candidate)
  })

  socket.on('capability:sender', ({from, to, capability}) => {
    if (to !== socket.id) return
    ortc.addSenderCapability(capability)
  })

  socket.on('capability:receiver', ({from, to, capability}) => {
    if (to !== socket.id) return
    ortc.addReceiverCapability(capability)
  })

  socket.on('start', ({from, to, rtcIceRole}) => {
    if (to !== socket.id) return
    window.peerid = from // save to global
    ortc.call(rtcIceRole)
  })

  socket.on('open', () => {
    debug('ws:open')
    $('#id').textContent = socket.id

    $('#call').disabled = false
    $('#peer').value = '';
    $('#start').addEventListener('submit', (e) => {
      e.preventDefault()
      window.peerid = $('#peer').value; // save to global
      if (window.peerid === '') return alert('input peerid')

      // 相手を controlled として start する
      socket.emit('start', {
        from: socket.id,
        to: peerid,
        rtcIceRole: RTCIceRole.controlling,
      })

      // 自分を controlling として start する
      ortc.call(RTCIceRole.controlled)
    })
  })
}
