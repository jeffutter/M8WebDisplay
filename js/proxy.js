import { on, off } from './util.js';

export class ProxyConnection {
    _parser;
    _onConnectionChanged;
    _waitingForUserSelection;
    _socket;
    _socketAddr;
    _player;
    _decoder;

    constructor(parser, onConnectionChanged) {
        this._parser = parser;
        this._onConnectionChanged = onConnectionChanged;
        this._waitingForUserSelection = false;

        this._decoder = new window["opus-decoder"].OpusDecoder({
            forceStereo: false,
            sampleRate: 48000,
            preSkip: 0,
            channels: 2,
            streamCount: 1,
            coupledStreamCount: 1,
            channelMappingTable: [0, 1]
        });

        this._player = new PCMPlayer({
            inputCodec: 'Float32',
            channels: 2,
            sampleRate: 48000,
            flushTime: 20
        });

        var loc = window.location, uri;
        if (loc.protocol === "https:") {
            uri = `wss://${loc.host}/ws`;
        } else {
            uri = `ws://${loc.host}/ws`;
        }
        this.socketAddr = uri;

        if (this._player.audioCtx.state !== 'running') {
            this.waitForUserGesture();
        }
    }

    waitForUserGesture() {
        const events = ['keydown', 'mousedown', 'touchstart'];
        const self = this;

        function resume() {
            self._player.audioCtx && self._player.audioCtx.resume();
            events.forEach(e =>
                off(document, e, resume));
        }

        events.forEach(e =>
            on(document, e, resume));
    }

    get isConnected() {
        return !!this._socket;
    }

    async _send(msg) {
        if (!this._socket)
            return;

        try {
            await this._socket.send(new Uint8Array(msg));
        } catch (err) {
            console.error(err);
            this.disconnect();
        }
    }

    async sendKeys(state) {
        this._send([0x43, state]);
    }

    async sendNoteOn(note, vel) {
        this._send([0x4B, note, vel]);
    }

    async sendNoteOff() {
        this._send([0x4B, 255]);
    }

    async disconnect() {
        this._socket.close();
        this._socket = null;

        this._onConnectionChanged(false);
    }

    async connect() {
        const socket = new WebSocket(this.socketAddr);
        socket.binaryType = "arraybuffer";
        const self = this;

        socket.addEventListener('open', function(_e) {
            self._socket = socket;
            self._parser.reset();
            self._onConnectionChanged(true);

            socket.addEventListener('message', async function(event) {
                const data = new Uint8Array(event.data);
                const type = String.fromCharCode(data[0]);

                if (type == 'A' && self._player.audioCtx.state == "running") {
                    // Audio

                    const encoded = new Uint8Array(event.data.slice(1));
                    const decoded = self._decoder.decodeFrame(encoded);
                    self._player.feed(self.getInterleaved(decoded.channelData, decoded.samplesDecoded));
                } else if (type == 'S') {
                    // Serial
                    const real_data = data.slice(1);
                    try {
                        self._parser.process(real_data);
                    } catch (err) {
                        console.error(err);
                    }
                }
            });
        });

    }

    getInterleaved(channelData, samples) {
        const interleaved = new Float32Array(samples * channelData.length);

        for (let offset = 0, interleavedOffset = 0; offset < samples; offset++) {
            for (let channel = 0; channel < channelData.length; channel++) {
                interleaved[interleavedOffset++] = channelData[channel][offset];
            }
        }

        return interleaved;
    };
}
