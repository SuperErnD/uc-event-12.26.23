import express from "express"
import cors from "cors"
const app = express();
app.use(cors());
import http from "http"
const server = http.createServer(app);
import { Server } from "socket.io";
const io = new Server(server, { cors: { origin: ["https://admin.socket.io"], credentials: true } });
import { instrument } from "@socket.io/admin-ui";
import fs from "fs";
import { URL } from 'url';

app.get("/", (req, res) => {
  res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

let SOCKETS = {};
let map = [];
let cooldown = [];
let blacklist = fs.readFileSync("blacklist.txt").toString('utf-8').split('\n')

console.log(blacklist)

const SIZE = 64;
if(!fs.existsSync("save.json")) {
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      map.push({
        by: null,
        color: "ffffff",
      });
    }
  }
} else 
  map = JSON.parse(fs.readFileSync("save.json").toString('utf-8'))
io.on("connection", (socket) => {
  socket.emit("initMap", map);
  const id = socket.id.split("").map((el, i) => i % 2 == 0 ? "" : el).join("");
  SOCKETS[id] = socket;

  const ip = socket.handshake.headers["x-forwarded-for"];
  console.log(ip)
  if(blacklist.includes(ip)) {
    return socket.disconnect(true)
  }

  if (cooldown.filter((e) => e.ip == ip).length < 1) {
    cooldown.push({
      ip,
      time: (new Date().getTime() - 5 * 60 * 1000),
    });
  }
  socket.on("newPixel", (data) => {
    if (cooldown.filter((e) => e.ip == ip).length < 1) return;
    const cTime = new Date().getTime();
    const tDiff = cTime - cooldown.filter((e) => e.ip == ip)[0].time;
    if (tDiff < 1 * 1000) {
      socket.emit("cooldown", tDiff);
      return;
    }
    cooldown.filter((e) => e.ip == ip)[0].time = cTime;
    const newMap = [...map]

    newMap[data.index] = {
      by: id,
      color: data.color,
    };

    const mapSize = newMap.length ** (1 / 2);

    if(mapSize ** 2 != Math.floor(mapSize) ** 2) {
      return
    }

    map = [...newMap]

    for (let i in SOCKETS) {
      const SOCKET = SOCKETS[i];
      SOCKET.emit("updatePixel", {
        index: data.index,
        color: data.color,
      });
    }
  });
});

instrument(io, {
  auth: false,
  mode: "development",
});

server.listen(3000, () => {
  console.log("listening on *:3000");
  setInterval(() => fs.writeFileSync("save.json", JSON.stringify(map)), 60 * 1000)
});

const powerOff = () => {
  console.log("power off")
  fs.writeFileSync("save.json", JSON.stringify(map))
}

server.on('close', () => {
  powerOff();
})

process.on('exit', () => {
  powerOff();
})

process.on('SIGINT', () => {
  console.log('Ctrl-C...');
  process.exit(2)
});
