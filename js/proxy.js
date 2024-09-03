import { wait, on, off } from './util.js';

export class ProxyConnection {
    _parser;
    _onConnectionChanged;
    _waitingForUserSelection;
    _socket;
    _socketAddr;

    _audioContext;
    _audioBuffer1;
    _audioBuffer2;
    _currentBuffer;
    _bufferIdx;

    constructor(parser, onConnectionChanged) {
        this._parser = parser;
        this._onConnectionChanged = onConnectionChanged;
        this._waitingForUserSelection = false;

        this._audioContext = new AudioContext({
            latencyHint: "interactive",
            sampleRate: 44100
        });
        // this._audioContext = new AudioContext();
        this._audioBuffer1 = this._audioContext.createBuffer(2, this._audioContext.sampleRate * 0.1, this._audioContext.sampleRate);
        this._audioBuffer2 = this._audioContext.createBuffer(2, this._audioContext.sampleRate * 0.1, this._audioContext.sampleRate);
        this._currentBuffer = 0;
        this._bufferIdx = 0;

        var loc = window.location, uri;
        if (loc.protocol === "https:") {
            uri = `wss://${loc.host}/ws`;
        } else {
            uri = `ws://${loc.host}/ws`;
        }
        this.socketAddr = uri;

        if (this._audioContext.state !== 'running') {
            this.waitForUserGesture();
        }
    }


    waitForUserGesture() {
        const events = ['keydown', 'mousedown', 'touchstart'];
        const self = this;

        function resume() {
            self._audioContext && self._audioContext.resume();
            events.forEach(e =>
                off(document, e, resume));
        }

        events.forEach(e =>
            on(document, e, resume));
    }

    get isConnected() {
        return !!this._socket;
    }

    async _startReading() {
        try {
            while (this._port) {
                const { value, done } = await this._port.reader.read();
                if (value) {
                    try {
                        this._parser.process(value);
                    } catch (err) {
                        console.error(err);
                    }
                }

                if (done)
                    return;
            }
        } catch (err) {
            console.error(err);
            this.disconnect();
        }
    }

    async _send(msg) {
        if (!this._socket)
            return;

        try {
            // await this._port.writer.write(new Uint8Array(msg));
            //
            this._socket.send(new Uint8Array(msg));
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

    async _reset() {
        // await this._port.writer.write(new Uint8Array([0x44]));
        // await wait(50);
        this._parser.reset();
        // await this._port.writer.write(new Uint8Array([0x45, 0.12]));
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

        socket.addEventListener('open', function(e) {
            self._socket = socket;
            self._parser.reset();
            self._onConnectionChanged(true);

            socket.addEventListener('message', function(event) {
                const data = new Uint8Array(event.data);
                const type = String.fromCharCode(data[0]);
                const real_data = data.slice(1);

                if (type == 'A' && self._audioContext.state == "running") {
                    // Audio
                    // console.log("Got Audio");
                    const audio_data = new Float32Array(event.data.slice(1));
                    let buffer;
                    if (self._currentBuffer == 0) {
                        buffer = self._audioBuffer1;
                    } else {
                        buffer = self._audioBuffer2;
                    }
                    const chan0Buff = buffer.getChannelData(0);
                    const chan1Buff = buffer.getChannelData(1);

                    for (let i = 0; i < audio_data.length; i += 2) {
                        chan0Buff[self._bufferIdx] = audio_data[i];
                        chan1Buff[self._bufferIdx] = audio_data[i + 1];
                        self._bufferIdx += 1;
                    }
                    if ((self._bufferIdx) >= buffer.length) {
                        const thisBuffer = self._currentBuffer;

                        if (self._currentBuffer == 0) {
                            self._currentBuffer = 1;
                        } else {
                            self._currentBuffer = 0;
                        }
                        self._bufferIdx = 0;

                        const source = self._audioContext.createBufferSource();
                        source.buffer = buffer;
                        source.connect(self._audioContext.destination);
                        source.start();
                        source.onended = () => {
                            source.disconnect(self._audioContext.destination);
                        }

                    }
                } else if (type == 'S') {
                    // Serial
                    self._parser.process(real_data);
                }
            });
        });

    }
}
