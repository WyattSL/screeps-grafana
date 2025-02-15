/**
 * hopsoft\screeps-statsd
 *
 * Licensed under the MIT license
 * For full copyright and license information, please see the LICENSE file
 * 
 * @author     Bryan Conrad <bkconrad@gmail.com>
 * @copyright  2016 Bryan Conrad
 * @link       https://github.com/hopsoft/docker-graphite-statsd
 * @license    http://choosealicense.com/licenses/MIT  MIT License
 */

/**
 * SimpleClass documentation
 *
 * @since  0.1.0
 */
import fetch from 'node-fetch';
import StatsD from 'node-statsd';
import zlib from 'zlib';
import { ScreepsAPI } from "screeps-api";

export default class ScreepsStatsd {
  _host;
  _email;
  _password;
  _shard;
  _graphite;
  _token;
  _success;
  api;
  constructor(host, email, password, shard, graphite) {
    this._host = host;
    this._email = email;
    this._password = password;
    this._shard = shard;
    this._graphite = graphite;
    this._client = new StatsD({host: this._graphite});
  }
  run( string ) {
    //this.signin();

    //setInterval(() => this.loop(), 15000);

    this.api = new ScreepsAPI({
      protocol: "http",
      hostname: this._host,
      path: "/",
      port: 21025,
    })

    console.log(`Authenticating`);
    this.api.auth(this._email, this._password).then((a,b) => {
      console.log(`Auth result:`,a,b)
      this.api.socket.connect().then(() => {
        console.log("Connected to Screeps API");
        this.api.socket.on('disconnected', () => {
          this.api.socket.connect();
        })
        let first = false;
        this.api.socket.subscribe('console', (event) => {
          let msgs = event.data.messages.log;
          if (first == false) {
            console.log(`First messages:`,msgs)
            first = true;
          }
          for (let msg of msgs) {
            if (!msg.startsWith("stat")) continue;
            let data = JSON.parse(msg.substring(4));
            console.log(`Stats ${data}`);
            this.report(data, "con.");
          }
        })
        this.api.socket.subscribe('cpu', (event) => {
          console.log(`CPU `,event.data);
          this.report(event.data, "cpu.");
        })
      })
    });
  }

  loop() {
    this.getMemory();
  }

  async signin() {
    if(this.token) {
      return;
    }
    console.log("New login request -", new Date());
    const response = await fetch(this._host + '/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: this._email,
        password: this._password
      }),
      headers: {
        'content-type': 'application/json'
      }
    });
    const data = await response.json();
    this._token = data.token;
  }

  async getMemory() {
    try {
      await this.signin();

      const response = await fetch(this._host + `/api/user/memory?path=stats&shard=${this._shard}`, {
        method: 'GET',
        headers: {
          "X-Token": this._token,
          "X-Username": this._token,
          'content-type': 'application/json',
        }
      });
      const data = await response.json();
      
      this._token = response.headers['x-token'];
      if (!data?.data || data.error) throw new Error(data?.error ?? 'No data');
      const unzippedData = JSON.parse(zlib.gunzipSync(Buffer.from(data.data.split('gz:')[1], 'base64')).toString())
      this.report(unzippedData);
    } catch (e) {
      console.error(e);
      this._token = undefined;
    }
  }

  report(data, prefix="") {
    if (prefix === '') console.log("Pushing to gauges -", new Date())
    for (const [k,v] of Object.entries(data)) {
      if (typeof v === 'object') {
        this.report(v, prefix+k+'.');
      } else {
        this._client.gauge(prefix+k, v);
      }
    }
  }
}
